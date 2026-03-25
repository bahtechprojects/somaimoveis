import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/whatsapp-templates";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { loadBillingRules } from "@/lib/billing-rules";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ==================================================
// POST /api/notifications/send-billing
// Processa todos os pagamentos pendentes/atrasados e
// envia as notificacoes apropriadas via WhatsApp
// ==================================================
export async function POST(_request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const rules = await loadBillingRules();

    if (!rules.notifyByWhatsapp) {
      return NextResponse.json({
        sent: 0,
        skipped: 0,
        errors: 0,
        details: [],
        message: "Notificações por WhatsApp estão desativadas nas regras de cobrança.",
      });
    }

    const now = new Date();
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const details: {
      paymentId: string;
      paymentCode: string;
      tenantName: string;
      action: string;
      result: string;
    }[] = [];

    // ========================================
    // 1. Lembretes de pagamentos proximos do vencimento
    // ========================================
    for (const daysBefore of rules.reminderDaysBefore) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysBefore);
      // Pegar o inicio e fim do dia alvo
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const upcomingPayments = await prisma.payment.findMany({
        where: {
          status: "PENDENTE",
          dueDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          contract: { include: { property: { select: { title: true } } } },
          tenant: { select: { id: true, name: true, phone: true } },
        },
      });

      for (const payment of upcomingPayments) {
        // Verificar se ja foi enviada notificacao de lembrete para este pagamento neste dia
        const alreadySent = await prisma.notification.findFirst({
          where: {
            paymentId: payment.id,
            templateKey: "payment_reminder",
            status: { in: ["ENVIADO", "PENDENTE"] },
            createdAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            },
          },
        });

        if (alreadySent) {
          skipped++;
          details.push({
            paymentId: payment.id,
            paymentCode: payment.code,
            tenantName: payment.tenant?.name || "N/A",
            action: "payment_reminder",
            result: "ja_enviado",
          });
          continue;
        }

        if (!payment.tenant?.phone) {
          skipped++;
          details.push({
            paymentId: payment.id,
            paymentCode: payment.code,
            tenantName: payment.tenant?.name || "N/A",
            action: "payment_reminder",
            result: "sem_telefone",
          });
          continue;
        }

        try {
          const rendered = renderTemplate("payment_reminder", {
            tenantName: payment.tenant?.name || "N/A",
            value: formatCurrency(payment.value),
            propertyTitle: payment.contract.property?.title || "N/A",
            daysUntilDue: daysBefore,
            dueDate: formatDate(new Date(payment.dueDate)),
          });

          const sendResult = await sendWhatsAppMessage({
            to: payment.tenant?.phone,
            message: rendered.message,
          });

          await prisma.notification.create({
            data: {
              type: "WHATSAPP",
              channel: "whatsapp",
              recipientName: payment.tenant?.name || "N/A",
              recipientPhone: payment.tenant?.phone,
              templateKey: "payment_reminder",
              subject: rendered.subject,
              message: rendered.message,
              status: sendResult.success ? "ENVIADO" : "FALHA",
              sentAt: sendResult.success ? new Date() : null,
              errorMessage: sendResult.error || null,
              paymentId: payment.id,
              contractId: payment.contractId,
              tenantId: payment.tenantId,
              metadata: JSON.stringify({ messageId: sendResult.messageId, daysBefore }),
            },
          });

          if (sendResult.success) {
            sent++;
            details.push({
              paymentId: payment.id,
              paymentCode: payment.code,
              tenantName: payment.tenant?.name || "N/A",
              action: "payment_reminder",
              result: "enviado",
            });
          } else {
            errors++;
            details.push({
              paymentId: payment.id,
              paymentCode: payment.code,
              tenantName: payment.tenant?.name || "N/A",
              action: "payment_reminder",
              result: `falha: ${sendResult.error}`,
            });
          }
        } catch (err) {
          errors++;
          details.push({
            paymentId: payment.id,
            paymentCode: payment.code,
            tenantName: payment.tenant?.name || "N/A",
            action: "payment_reminder",
            result: `erro: ${(err as Error).message}`,
          });
        }
      }
    }

    // ========================================
    // 2. Notificacoes de pagamentos em atraso (escalation)
    // ========================================
    const overduePayments = await prisma.payment.findMany({
      where: {
        status: "ATRASADO",
      },
      include: {
        contract: {
          include: {
            property: { select: { title: true } },
          },
        },
        tenant: { select: { id: true, name: true, phone: true } },
        owner: { select: { id: true, name: true, phone: true } },
      },
    });

    for (const payment of overduePayments) {
      const dueDate = new Date(payment.dueDate);
      const daysOverdue = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Encontrar o step de escalation aplicavel baseado nos dias de atraso
      const whatsappSteps = rules.escalationSteps.filter(
        (step) => step.action === "whatsapp_reminder" && daysOverdue >= step.daysAfterDue
      );

      if (whatsappSteps.length === 0) {
        // Ainda nao esta no momento de enviar WhatsApp para este pagamento
        continue;
      }

      // Verificar se ja foi enviada notificacao de atraso para este pagamento hoje
      const alreadySentToday = await prisma.notification.findFirst({
        where: {
          paymentId: payment.id,
          templateKey: "payment_overdue",
          status: { in: ["ENVIADO", "PENDENTE"] },
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          },
        },
      });

      if (alreadySentToday) {
        skipped++;
        details.push({
          paymentId: payment.id,
          paymentCode: payment.code,
          tenantName: payment.tenant?.name || "N/A",
          action: "payment_overdue",
          result: "ja_enviado_hoje",
        });
        continue;
      }

      // ---- Enviar notificacao para o locatario ----
      if (payment.tenant?.phone) {
        try {
          // Calcular valor atualizado com multa e juros
          const fineValue = payment.fineValue || 0;
          const interestValue = payment.interestValue || 0;
          const totalValue = payment.value + fineValue + interestValue;

          const rendered = renderTemplate("payment_overdue", {
            tenantName: payment.tenant?.name || "N/A",
            value: formatCurrency(payment.value),
            propertyTitle: payment.contract.property?.title || "N/A",
            dueDate: formatDate(dueDate),
            totalValue: formatCurrency(totalValue),
          });

          const sendResult = await sendWhatsAppMessage({
            to: payment.tenant?.phone,
            message: rendered.message,
          });

          await prisma.notification.create({
            data: {
              type: "WHATSAPP",
              channel: "whatsapp",
              recipientName: payment.tenant?.name || "N/A",
              recipientPhone: payment.tenant?.phone,
              templateKey: "payment_overdue",
              subject: rendered.subject,
              message: rendered.message,
              status: sendResult.success ? "ENVIADO" : "FALHA",
              sentAt: sendResult.success ? new Date() : null,
              errorMessage: sendResult.error || null,
              paymentId: payment.id,
              contractId: payment.contractId,
              tenantId: payment.tenantId,
              metadata: JSON.stringify({
                messageId: sendResult.messageId,
                daysOverdue,
              }),
            },
          });

          if (sendResult.success) {
            sent++;
            details.push({
              paymentId: payment.id,
              paymentCode: payment.code,
              tenantName: payment.tenant?.name || "N/A",
              action: "payment_overdue",
              result: "enviado",
            });
          } else {
            errors++;
            details.push({
              paymentId: payment.id,
              paymentCode: payment.code,
              tenantName: payment.tenant?.name || "N/A",
              action: "payment_overdue",
              result: `falha: ${sendResult.error}`,
            });
          }
        } catch (err) {
          errors++;
          details.push({
            paymentId: payment.id,
            paymentCode: payment.code,
            tenantName: payment.tenant?.name || "N/A",
            action: "payment_overdue",
            result: `erro: ${(err as Error).message}`,
          });
        }
      } else {
        skipped++;
        details.push({
          paymentId: payment.id,
          paymentCode: payment.code,
          tenantName: payment.tenant?.name || "N/A",
          action: "payment_overdue",
          result: "sem_telefone_locatario",
        });
      }

      // ---- Notificar o proprietario sobre o atraso ----
      if (payment.owner.phone) {
        // Verificar se ja notificou proprietario hoje
        const ownerNotifiedToday = await prisma.notification.findFirst({
          where: {
            paymentId: payment.id,
            templateKey: "owner_payment_overdue",
            ownerId: payment.ownerId,
            status: { in: ["ENVIADO", "PENDENTE"] },
            createdAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            },
          },
        });

        if (!ownerNotifiedToday) {
          try {
            const rendered = renderTemplate("owner_payment_overdue", {
              ownerName: payment.owner.name,
              propertyTitle: payment.contract.property?.title || "N/A",
              dueDate: formatDate(dueDate),
            });

            const sendResult = await sendWhatsAppMessage({
              to: payment.owner.phone,
              message: rendered.message,
            });

            await prisma.notification.create({
              data: {
                type: "WHATSAPP",
                channel: "whatsapp",
                recipientName: payment.owner.name,
                recipientPhone: payment.owner.phone,
                templateKey: "owner_payment_overdue",
                subject: rendered.subject,
                message: rendered.message,
                status: sendResult.success ? "ENVIADO" : "FALHA",
                sentAt: sendResult.success ? new Date() : null,
                errorMessage: sendResult.error || null,
                paymentId: payment.id,
                contractId: payment.contractId,
                ownerId: payment.ownerId,
                metadata: JSON.stringify({
                  messageId: sendResult.messageId,
                  daysOverdue,
                }),
              },
            });

            if (sendResult.success) sent++;
            else errors++;
          } catch {
            errors++;
          }
        }
      }
    }

    // ========================================
    // 3. Contratos proximos do vencimento (30 e 60 dias)
    // ========================================
    const contractAlertDays = [60, 30];
    for (const daysUntilExpiry of contractAlertDays) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntilExpiry);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const expiringContracts = await prisma.contract.findMany({
        where: {
          status: "ATIVO",
          endDate: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          property: { select: { title: true } },
          tenant: { select: { id: true, name: true, phone: true } },
        },
      });

      for (const contract of expiringContracts) {
        // Verificar se ja foi notificado
        const alreadySent = await prisma.notification.findFirst({
          where: {
            contractId: contract.id,
            templateKey: "contract_expiring",
            status: { in: ["ENVIADO", "PENDENTE"] },
            metadata: { contains: `"daysUntilExpiry":${daysUntilExpiry}` },
          },
        });

        if (alreadySent || !contract.tenant?.phone) continue;

        try {
          const rendered = renderTemplate("contract_expiring", {
            tenantName: contract.tenant?.name || "N/A",
            propertyTitle: contract.property?.title || "N/A",
            daysUntilExpiry,
          });

          const sendResult = await sendWhatsAppMessage({
            to: contract.tenant?.phone,
            message: rendered.message,
          });

          await prisma.notification.create({
            data: {
              type: "WHATSAPP",
              channel: "whatsapp",
              recipientName: contract.tenant?.name || "N/A",
              recipientPhone: contract.tenant?.phone,
              templateKey: "contract_expiring",
              subject: rendered.subject,
              message: rendered.message,
              status: sendResult.success ? "ENVIADO" : "FALHA",
              sentAt: sendResult.success ? new Date() : null,
              errorMessage: sendResult.error || null,
              contractId: contract.id,
              tenantId: contract.tenantId,
              metadata: JSON.stringify({
                messageId: sendResult.messageId,
                daysUntilExpiry,
              }),
            },
          });

          if (sendResult.success) sent++;
          else errors++;
        } catch {
          errors++;
        }
      }
    }

    return NextResponse.json({
      sent,
      skipped,
      errors,
      details,
    });
  } catch (error) {
    console.error("Erro ao processar envio de cobrancas:", error);
    return NextResponse.json(
      { error: "Erro ao processar envio de cobrancas" },
      { status: 500 }
    );
  }
}
