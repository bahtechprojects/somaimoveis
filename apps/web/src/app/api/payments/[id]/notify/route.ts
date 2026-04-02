import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { renderTemplate } from "@/lib/whatsapp-templates";
import { sendWhatsAppMessage, sendEmailMessage } from "@/lib/whatsapp-sender";

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

// POST - Enviar cobranca manual para um pagamento especifico
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const channels: string[] = body.channels || ["whatsapp", "email"];

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        contract: { include: { property: { select: { title: true } } } },
        tenant: { select: { id: true, name: true, phone: true, email: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento nao encontrado" },
        { status: 404 }
      );
    }

    if (!payment.tenant) {
      return NextResponse.json(
        { error: "Pagamento sem locatario associado" },
        { status: 400 }
      );
    }

    const tenant = payment.tenant;
    const dueDate = new Date(payment.dueDate);
    const now = new Date();
    const isOverdue = dueDate < now && payment.status !== "PAGO";

    // Choose template based on status
    const templateKey = isOverdue ? "payment_overdue" : "payment_reminder";
    const daysUntilDue = Math.max(
      0,
      Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    const fineValue = payment.fineValue || 0;
    const interestValue = payment.interestValue || 0;
    const totalValue = payment.value + fineValue + interestValue;

    const templateData = isOverdue
      ? {
          tenantName: tenant.name,
          value: formatCurrency(payment.value),
          propertyTitle: payment.contract.property?.title || "N/A",
          dueDate: formatDate(dueDate),
          totalValue: formatCurrency(totalValue),
        }
      : {
          tenantName: tenant.name,
          value: formatCurrency(payment.value),
          propertyTitle: payment.contract.property?.title || "N/A",
          daysUntilDue,
          dueDate: formatDate(dueDate),
        };

    const rendered = renderTemplate(templateKey, templateData);

    const results: { channel: string; success: boolean; error?: string }[] = [];

    // Send WhatsApp
    if (channels.includes("whatsapp")) {
      if (!tenant.phone) {
        results.push({
          channel: "whatsapp",
          success: false,
          error: "Locatario sem telefone cadastrado",
        });
      } else {
        const sendResult = await sendWhatsAppMessage({
          to: tenant.phone,
          message: rendered.message,
        });

        await prisma.notification.create({
          data: {
            type: "WHATSAPP",
            channel: "whatsapp",
            recipientName: tenant.name,
            recipientPhone: tenant.phone,
            templateKey,
            subject: rendered.subject,
            message: rendered.message,
            status: sendResult.success ? "ENVIADO" : "FALHA",
            sentAt: sendResult.success ? new Date() : null,
            errorMessage: sendResult.error || null,
            paymentId: payment.id,
            contractId: payment.contractId,
            tenantId: tenant.id,
            metadata: JSON.stringify({
              messageId: sendResult.messageId,
              manual: true,
            }),
          },
        });

        results.push({
          channel: "whatsapp",
          success: sendResult.success,
          error: sendResult.error,
        });
      }
    }

    // Send Email
    if (channels.includes("email")) {
      const tenantEmail = (tenant as any).email as string | undefined;
      if (!tenantEmail) {
        results.push({
          channel: "email",
          success: false,
          error: "Locatario sem email cadastrado",
        });
      } else {
        const emailResult = await sendEmailMessage({
          to: tenantEmail,
          subject: rendered.subject,
          message: rendered.message,
        });

        await prisma.notification.create({
          data: {
            type: "EMAIL",
            channel: "email",
            recipientName: tenant.name,
            recipientEmail: tenantEmail,
            templateKey,
            subject: rendered.subject,
            message: rendered.message,
            status: emailResult.success ? "ENVIADO" : "FALHA",
            sentAt: emailResult.success ? new Date() : null,
            errorMessage: emailResult.error || null,
            paymentId: payment.id,
            contractId: payment.contractId,
            tenantId: tenant.id,
            metadata: JSON.stringify({
              messageId: emailResult.messageId,
              manual: true,
            }),
          },
        });

        results.push({
          channel: "email",
          success: emailResult.success,
          error: emailResult.error,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      message: rendered.message,
      templateKey,
      summary: `${successCount} enviado(s), ${failCount} falha(s)`,
    });
  } catch (error) {
    console.error("[Notify] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao enviar notificacao" },
      { status: 500 }
    );
  }
}
