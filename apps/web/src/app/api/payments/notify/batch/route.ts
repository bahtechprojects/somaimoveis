import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import {
  sendWhatsAppMessage,
  sendWhatsAppDocumentBase64,
  sendEmailMessage,
} from "@/lib/whatsapp-sender";
import { renderTemplate } from "@/lib/whatsapp-templates";
import { sicrediPrintBoleto } from "@/lib/sicredi-client";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Track batch processing state in memory
let batchProcessing = false;
let batchProgress = { sent: 0, failed: 0, total: 0, done: false, errors: [] as { code: string; error: string }[] };

// GET - Check batch progress
export async function GET() {
  return NextResponse.json({
    processing: batchProcessing,
    ...batchProgress,
  });
}

// POST - Start batch notification (returns immediately, processes in background)
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  if (batchProcessing) {
    return NextResponse.json({
      error: "Já existe um envio em lote em andamento. Aguarde a conclusão.",
      progress: batchProgress,
    }, { status: 409 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const month = body.month as string | undefined;

    // Find emitted payments that haven't been notified yet
    const where: any = {
      nossoNumero: { not: null },
      status: { in: ["PENDENTE", "ATRASADO"] },
    };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      where.dueDate = {
        gte: new Date(y, m - 1, 1),
        lte: new Date(y, m, 0, 23, 59, 59, 999),
      };
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        contract: { include: { property: { select: { title: true } } } },
        tenant: true,
        owner: true,
      },
    });

    if (payments.length === 0) {
      return NextResponse.json({
        sent: 0,
        failed: 0,
        total: 0,
        message: "Nenhum boleto emitido pendente de envio.",
      });
    }

    // Check which payments already have notifications
    const notified = await prisma.notification.findMany({
      where: {
        paymentId: { in: payments.map(p => p.id) },
        status: "ENVIADO",
      },
      select: { paymentId: true },
    });
    const notifiedIds = new Set(notified.map(n => n.paymentId));

    // Filter to only payments not yet notified
    const toNotify = payments.filter(p => !notifiedIds.has(p.id));

    if (toNotify.length === 0) {
      return NextResponse.json({
        sent: 0,
        failed: 0,
        total: payments.length,
        alreadyNotified: notifiedIds.size,
        message: "Todas as cobranças já foram enviadas.",
      });
    }

    // Start background processing
    batchProcessing = true;
    batchProgress = { sent: 0, failed: 0, total: toNotify.length, done: false, errors: [] };

    // Fire and forget - process in background
    processNotifications(toNotify).finally(() => {
      batchProcessing = false;
      batchProgress.done = true;
    });

    return NextResponse.json({
      message: `Enviando ${toNotify.length} cobrança(s) em segundo plano. Use GET /api/payments/notify/batch para acompanhar.`,
      total: toNotify.length,
      alreadyNotified: notifiedIds.size,
      processing: true,
    });
  } catch (error) {
    console.error("[Notify Batch] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao iniciar envio em lote" },
      { status: 500 }
    );
  }
}

async function processNotifications(payments: any[]) {
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    const tenant = payment.tenant;

    try {
      // Build message
      const dueDate = new Date(payment.dueDate);
      const now = new Date();
      const isOverdue = dueDate < now && payment.status !== "PAGO";
      const templateKey = isOverdue ? "payment_overdue" : "payment_reminder";
      const daysUntilDue = Math.max(0, Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      const fineValue = payment.fineValue || 0;
      const interestValue = payment.interestValue || 0;
      const totalValue = payment.value + fineValue + interestValue;

      const templateData = isOverdue
        ? {
            tenantName: tenant.name,
            value: formatCurrency(payment.value),
            propertyTitle: payment.contract?.property?.title || "N/A",
            dueDate: formatDateBR(dueDate),
            totalValue: formatCurrency(totalValue),
          }
        : {
            tenantName: tenant.name,
            value: formatCurrency(payment.value),
            propertyTitle: payment.contract?.property?.title || "N/A",
            daysUntilDue,
            dueDate: formatDateBR(dueDate),
          };

      const rendered = renderTemplate(templateKey, templateData);

      let fullMessage = rendered.message;
      if (payment.pixCopiaECola) {
        fullMessage += `\n\n*PIX Copia e Cola:*\n${payment.pixCopiaECola}`;
      } else {
        const pixKey = process.env.PIX_KEY;
        const pixKeyType = process.env.PIX_KEY_TYPE || "Chave PIX";
        if (pixKey) {
          fullMessage += `\n\n*Pagamento via PIX:*\n${pixKeyType}: ${pixKey}`;
          fullMessage += `\nValor: ${formatCurrency(isOverdue ? totalValue : payment.value)}`;
        }
      }
      if (payment.linhaDigitavel) {
        fullMessage += `\n\n*Linha digitavel do boleto:*\n${payment.linhaDigitavel}`;
      }
      fullMessage += `\n\n_Somma Imoveis_`;

      // Download PDF
      let pdfBuffer: Buffer | null = null;
      let pdfBase64: string | null = null;
      if (payment.linhaDigitavel) {
        try {
          pdfBuffer = await sicrediPrintBoleto(payment.linhaDigitavel);
          pdfBase64 = pdfBuffer.toString("base64");
        } catch (err) {
          console.error(`[Notify Batch] Erro PDF ${payment.code}:`, err);
        }
      }

      let whatsappSuccess = false;
      let emailSuccess = false;

      // Send WhatsApp
      if (tenant.phone) {
        const textResult = await sendWhatsAppMessage({ to: tenant.phone, message: fullMessage });
        if (textResult.success && pdfBase64) {
          try {
            await sendWhatsAppDocumentBase64({
              to: tenant.phone,
              fileBase64: pdfBase64,
              fileName: `boleto-${payment.code}.pdf`,
              caption: `Boleto ${payment.code} - Venc: ${formatDateBR(dueDate)}`,
            });
          } catch (err) {
            console.error(`[Notify Batch] Erro PDF WhatsApp ${payment.code}:`, err);
          }
        }
        whatsappSuccess = textResult.success;

        await prisma.notification.create({
          data: {
            type: "WHATSAPP",
            channel: "whatsapp",
            recipientName: tenant.name,
            recipientPhone: tenant.phone,
            templateKey,
            subject: rendered.subject,
            message: fullMessage,
            status: textResult.success ? "ENVIADO" : "FALHA",
            sentAt: textResult.success ? new Date() : null,
            errorMessage: textResult.error || null,
            paymentId: payment.id,
            contractId: payment.contractId,
            tenantId: tenant.id,
            metadata: JSON.stringify({ batch: true }),
          },
        });
      }

      // Send Email
      const tenantEmail = (tenant as any).email as string | undefined;
      if (tenantEmail) {
        const attachments = pdfBuffer
          ? [{ filename: `boleto-${payment.code}.pdf`, content: pdfBuffer }]
          : undefined;
        const emailResult = await sendEmailMessage({
          to: tenantEmail,
          subject: rendered.subject,
          message: fullMessage,
          attachments,
        });
        emailSuccess = emailResult.success;

        await prisma.notification.create({
          data: {
            type: "EMAIL",
            channel: "email",
            recipientName: tenant.name,
            recipientEmail: tenantEmail,
            templateKey,
            subject: rendered.subject,
            message: fullMessage,
            status: emailResult.success ? "ENVIADO" : "FALHA",
            sentAt: emailResult.success ? new Date() : null,
            errorMessage: emailResult.error || null,
            paymentId: payment.id,
            contractId: payment.contractId,
            tenantId: tenant.id,
            metadata: JSON.stringify({ batch: true }),
          },
        });
      }

      if (whatsappSuccess || emailSuccess) {
        batchProgress.sent++;
      } else {
        batchProgress.failed++;
        batchProgress.errors.push({ code: payment.code, error: "Falha no envio WhatsApp/Email" });
      }

      console.log(`[Notify Batch] ${i + 1}/${payments.length} - ${payment.code}: ${whatsappSuccess ? "WA✓" : "WA✗"} ${emailSuccess ? "EM✓" : "EM✗"}`);
    } catch (err) {
      batchProgress.failed++;
      batchProgress.errors.push({
        code: payment.code,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
      console.error(`[Notify Batch] Erro ${payment.code}:`, err);
    }

    // Delay de 15 segundos entre envios (~200 cobranças em ~50 min)
    if (i < payments.length - 1) {
      await new Promise(r => setTimeout(r, 15000));
    }
  }
}
