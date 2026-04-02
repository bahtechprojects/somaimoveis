import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

// POST - Enviar cobranças em lote para todos os boletos emitidos que ainda não foram notificados
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const month = body.month as string | undefined; // YYYY-MM optional

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
      select: { id: true, code: true },
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

    let sent = 0;
    let failed = 0;
    const errors: { code: string; error: string }[] = [];

    // Call individual notify endpoint for each payment
    const baseUrl = request.nextUrl.origin;

    for (const payment of toNotify) {
      try {
        const res = await fetch(`${baseUrl}/api/payments/${payment.id}/notify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: request.headers.get("cookie") || "",
          },
          body: JSON.stringify({ channels: ["whatsapp", "email"] }),
        });

        if (res.ok) {
          sent++;
        } else {
          const data = await res.json().catch(() => ({}));
          failed++;
          errors.push({ code: payment.code, error: data.error || `HTTP ${res.status}` });
        }
      } catch (err) {
        failed++;
        errors.push({
          code: payment.code,
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }

      // Delay between sends to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    }

    return NextResponse.json({
      sent,
      failed,
      total: payments.length,
      alreadyNotified: notifiedIds.size,
      errors: errors.length > 0 ? errors : undefined,
      message: `${sent} cobrança(s) enviada(s).${failed > 0 ? ` ${failed} falha(s).` : ""}${notifiedIds.size > 0 ? ` ${notifiedIds.size} já enviada(s).` : ""}`,
    });
  } catch (error) {
    console.error("[Notify Batch] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao enviar cobranças em lote" },
      { status: 500 }
    );
  }
}
