import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadBillingRules } from "@/lib/billing-rules";
import { renderTemplate } from "@/lib/whatsapp-templates";
import { sendWhatsAppMessage, sendEmailMessage } from "@/lib/whatsapp-sender";
import { isTodayBusinessDay } from "@/lib/business-days";

// ==================================================
// GET /api/cron/daily
// Endpoint de automacao diaria - deve ser chamado via cron job externo
// Ex: curl -H "Authorization: Bearer $CRON_SECRET" https://sommaimob.bahflash.tech/api/cron/daily
//
// Executa em sequencia:
// 1. Marcar pagamentos atrasados e calcular multa/juros
// 2. Enviar lembretes de pagamentos proximos
// 3. Enviar cobranças de pagamentos atrasados
// 4. Alertas de contratos expirando
//
// Se for final de semana ou feriado nacional, pula a execucao.
// O cron pode rodar todos os dias - o endpoint filtra sozinho.
// ==================================================

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Autenticacao via Bearer token ou query param
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || new URL(request.url).searchParams.get("token");

  if (CRON_SECRET && token !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pular execucao em finais de semana e feriados
  // Pode forcar execucao com ?force=true
  const force = new URL(request.url).searchParams.get("force") === "true";
  if (!force && !isTodayBusinessDay()) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: "Hoje nao e dia util. Execucao adiada para o proximo dia util.",
      executedAt: new Date().toISOString(),
    });
  }

  const log: string[] = [];
  const now = new Date();

  try {
    const rules = await loadBillingRules();
    log.push(`[${new Date().toISOString()}] Regras carregadas`);

    // ========================================
    // ETAPA 1: Marcar pagamentos atrasados
    // ========================================
    if (rules.autoMarkOverdue) {
      const cutoffDate = new Date(now);
      cutoffDate.setDate(cutoffDate.getDate() - rules.gracePeriodDays);

      const overduePayments = await prisma.payment.findMany({
        where: {
          status: "PENDENTE",
          dueDate: { lt: cutoffDate },
        },
      });

      let markedOverdue = 0;
      for (const payment of overduePayments) {
        const dueDate = new Date(payment.dueDate);
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        const finePercent = rules.lateFeePercent > 0 ? rules.lateFeePercent : 2;
        const fineValue = Math.round(payment.value * (finePercent / 100) * 100) / 100;

        const dailyRate = rules.dailyInterestPercent > 0 ? rules.dailyInterestPercent : 0.033;
        const interestValue = daysOverdue > 0
          ? Math.round(payment.value * (dailyRate / 100) * daysOverdue * 100) / 100
          : 0;

        const totalDue = Math.round((payment.value + fineValue + interestValue) * 100) / 100;

        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "ATRASADO",
            fineValue: fineValue > 0 ? fineValue : null,
            interestValue: interestValue > 0 ? interestValue : null,
            lateFee: fineValue,
            totalDue,
          },
        });
        markedOverdue++;
      }
      log.push(`[Etapa 1] ${markedOverdue} pagamento(s) marcado(s) como ATRASADO`);
    }

    // ========================================
    // ETAPA 2: Lembretes de vencimento proximo
    // ========================================
    let remindersSent = 0;
    for (const daysBefore of rules.reminderDaysBefore) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysBefore);
      const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

      const payments = await prisma.payment.findMany({
        where: {
          status: "PENDENTE",
          dueDate: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          contract: { include: { property: { select: { title: true } } } },
          tenant: { select: { id: true, name: true, phone: true, email: true } },
        },
      });

      for (const payment of payments) {
        // Verificar se ja enviou hoje
        const alreadySent = await prisma.notification.findFirst({
          where: {
            paymentId: payment.id,
            templateKey: "payment_reminder",
            status: { in: ["ENVIADO", "PENDENTE"] },
            createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
          },
        });
        if (alreadySent) continue;

        const rendered = renderTemplate("payment_reminder", {
          tenantName: payment.tenant?.name || "N/A",
          value: payment.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          propertyTitle: payment.contract.property?.title || "N/A",
          daysUntilDue: daysBefore,
          dueDate: new Date(payment.dueDate).toLocaleDateString("pt-BR"),
        });

        // WhatsApp
        if (rules.notifyByWhatsapp && payment.tenant?.phone) {
          try {
            const result = await sendWhatsAppMessage({ to: payment.tenant.phone, message: rendered.message });
            await prisma.notification.create({
              data: {
                type: "WHATSAPP", channel: "whatsapp",
                recipientName: payment.tenant.name, recipientPhone: payment.tenant.phone,
                templateKey: "payment_reminder", subject: rendered.subject, message: rendered.message,
                status: result.success ? "ENVIADO" : "FALHA",
                sentAt: result.success ? new Date() : null,
                errorMessage: result.error || null,
                paymentId: payment.id, contractId: payment.contractId, tenantId: payment.tenantId,
                metadata: JSON.stringify({ messageId: result.messageId, daysBefore }),
              },
            });
            if (result.success) remindersSent++;
          } catch { /* non-critical */ }
        }

        // Email
        if (rules.notifyByEmail && payment.tenant?.email) {
          try {
            const result = await sendEmailMessage({ to: payment.tenant.email, subject: rendered.subject, message: rendered.message });
            await prisma.notification.create({
              data: {
                type: "EMAIL", channel: "email",
                recipientName: payment.tenant.name, recipientEmail: payment.tenant.email,
                templateKey: "payment_reminder", subject: rendered.subject, message: rendered.message,
                status: result.success ? "ENVIADO" : "FALHA",
                sentAt: result.success ? new Date() : null,
                errorMessage: result.error || null,
                paymentId: payment.id, contractId: payment.contractId, tenantId: payment.tenantId,
                metadata: JSON.stringify({ messageId: result.messageId, daysBefore }),
              },
            });
            if (result.success) remindersSent++;
          } catch { /* non-critical */ }
        }
      }
    }
    log.push(`[Etapa 2] ${remindersSent} lembrete(s) enviado(s)`);

    // ========================================
    // ETAPA 3: Cobranças de pagamentos atrasados
    // ========================================
    let overdueSent = 0;
    const overduePayments = await prisma.payment.findMany({
      where: { status: "ATRASADO" },
      include: {
        contract: { include: { property: { select: { title: true } } } },
        tenant: { select: { id: true, name: true, phone: true, email: true } },
        owner: { select: { id: true, name: true, phone: true } },
      },
    });

    for (const payment of overduePayments) {
      const dueDate = new Date(payment.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      const applicableSteps = rules.escalationSteps.filter(
        (step) =>
          (step.action === "whatsapp_reminder" || step.action === "email_reminder") &&
          daysOverdue >= step.daysAfterDue
      );
      if (applicableSteps.length === 0) continue;

      // Verificar se ja notificou hoje
      const alreadySent = await prisma.notification.findFirst({
        where: {
          paymentId: payment.id,
          templateKey: "payment_overdue",
          status: { in: ["ENVIADO", "PENDENTE"] },
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      });
      if (alreadySent) continue;

      const fineValue = payment.fineValue || 0;
      const interestValue = payment.interestValue || 0;
      const totalValue = payment.value + fineValue + interestValue;

      const rendered = renderTemplate("payment_overdue", {
        tenantName: payment.tenant?.name || "N/A",
        value: payment.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        propertyTitle: payment.contract.property?.title || "N/A",
        dueDate: dueDate.toLocaleDateString("pt-BR"),
        totalValue: totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      });

      // WhatsApp ao locatário
      if (rules.notifyByWhatsapp && payment.tenant?.phone) {
        try {
          const result = await sendWhatsAppMessage({ to: payment.tenant.phone, message: rendered.message });
          await prisma.notification.create({
            data: {
              type: "WHATSAPP", channel: "whatsapp",
              recipientName: payment.tenant.name, recipientPhone: payment.tenant.phone,
              templateKey: "payment_overdue", subject: rendered.subject, message: rendered.message,
              status: result.success ? "ENVIADO" : "FALHA",
              sentAt: result.success ? new Date() : null, errorMessage: result.error || null,
              paymentId: payment.id, contractId: payment.contractId, tenantId: payment.tenantId,
              metadata: JSON.stringify({ messageId: result.messageId, daysOverdue }),
            },
          });
          if (result.success) overdueSent++;
        } catch { /* non-critical */ }
      }

      // Email ao locatário
      if (rules.notifyByEmail && payment.tenant?.email) {
        try {
          const result = await sendEmailMessage({ to: payment.tenant.email, subject: rendered.subject, message: rendered.message });
          await prisma.notification.create({
            data: {
              type: "EMAIL", channel: "email",
              recipientName: payment.tenant.name, recipientEmail: payment.tenant.email,
              templateKey: "payment_overdue", subject: rendered.subject, message: rendered.message,
              status: result.success ? "ENVIADO" : "FALHA",
              sentAt: result.success ? new Date() : null, errorMessage: result.error || null,
              paymentId: payment.id, contractId: payment.contractId, tenantId: payment.tenantId,
              metadata: JSON.stringify({ messageId: result.messageId, daysOverdue }),
            },
          });
          if (result.success) overdueSent++;
        } catch { /* non-critical */ }
      }

      // WhatsApp ao proprietário
      if (rules.notifyByWhatsapp && payment.owner?.phone) {
        const ownerAlready = await prisma.notification.findFirst({
          where: {
            paymentId: payment.id, templateKey: "owner_payment_overdue",
            ownerId: payment.ownerId,
            status: { in: ["ENVIADO", "PENDENTE"] },
            createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
          },
        });
        if (!ownerAlready) {
          try {
            const ownerRendered = renderTemplate("owner_payment_overdue", {
              ownerName: payment.owner.name,
              propertyTitle: payment.contract.property?.title || "N/A",
              dueDate: dueDate.toLocaleDateString("pt-BR"),
            });
            const result = await sendWhatsAppMessage({ to: payment.owner.phone, message: ownerRendered.message });
            await prisma.notification.create({
              data: {
                type: "WHATSAPP", channel: "whatsapp",
                recipientName: payment.owner.name, recipientPhone: payment.owner.phone,
                templateKey: "owner_payment_overdue", subject: ownerRendered.subject, message: ownerRendered.message,
                status: result.success ? "ENVIADO" : "FALHA",
                sentAt: result.success ? new Date() : null, errorMessage: result.error || null,
                paymentId: payment.id, contractId: payment.contractId, ownerId: payment.ownerId,
                metadata: JSON.stringify({ messageId: result.messageId, daysOverdue }),
              },
            });
            if (result.success) overdueSent++;
          } catch { /* non-critical */ }
        }
      }
    }
    log.push(`[Etapa 3] ${overdueSent} notificacao(es) de atraso enviada(s)`);

    // ========================================
    // ETAPA 4: Alertas de contratos expirando
    // ========================================
    let contractAlerts = 0;
    for (const daysUntilExpiry of [60, 30]) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntilExpiry);
      const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

      const contracts = await prisma.contract.findMany({
        where: {
          status: "ATIVO",
          endDate: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          property: { select: { title: true } },
          tenant: { select: { id: true, name: true, phone: true, email: true } },
        },
      });

      for (const contract of contracts) {
        const alreadySent = await prisma.notification.findFirst({
          where: {
            contractId: contract.id,
            templateKey: "contract_expiring",
            status: { in: ["ENVIADO", "PENDENTE"] },
            metadata: { contains: `"daysUntilExpiry":${daysUntilExpiry}` },
          },
        });
        if (alreadySent) continue;

        const rendered = renderTemplate("contract_expiring", {
          tenantName: contract.tenant?.name || "N/A",
          propertyTitle: contract.property?.title || "N/A",
          daysUntilExpiry,
        });

        if (rules.notifyByWhatsapp && contract.tenant?.phone) {
          try {
            const result = await sendWhatsAppMessage({ to: contract.tenant.phone, message: rendered.message });
            await prisma.notification.create({
              data: {
                type: "WHATSAPP", channel: "whatsapp",
                recipientName: contract.tenant.name, recipientPhone: contract.tenant.phone,
                templateKey: "contract_expiring", subject: rendered.subject, message: rendered.message,
                status: result.success ? "ENVIADO" : "FALHA",
                sentAt: result.success ? new Date() : null, errorMessage: result.error || null,
                contractId: contract.id, tenantId: contract.tenantId,
                metadata: JSON.stringify({ messageId: result.messageId, daysUntilExpiry }),
              },
            });
            if (result.success) contractAlerts++;
          } catch { /* non-critical */ }
        }

        if (rules.notifyByEmail && contract.tenant?.email) {
          try {
            const result = await sendEmailMessage({ to: contract.tenant.email, subject: rendered.subject, message: rendered.message });
            await prisma.notification.create({
              data: {
                type: "EMAIL", channel: "email",
                recipientName: contract.tenant.name, recipientEmail: contract.tenant.email,
                templateKey: "contract_expiring", subject: rendered.subject, message: rendered.message,
                status: result.success ? "ENVIADO" : "FALHA",
                sentAt: result.success ? new Date() : null, errorMessage: result.error || null,
                contractId: contract.id, tenantId: contract.tenantId,
                metadata: JSON.stringify({ messageId: result.messageId, daysUntilExpiry }),
              },
            });
            if (result.success) contractAlerts++;
          } catch { /* non-critical */ }
        }
      }
    }
    log.push(`[Etapa 4] ${contractAlerts} alerta(s) de contrato enviado(s)`);

    return NextResponse.json({
      success: true,
      executedAt: now.toISOString(),
      log,
    });
  } catch (error) {
    console.error("[Cron Daily] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao executar rotina diaria", details: (error as Error).message, log },
      { status: 500 }
    );
  }
}
