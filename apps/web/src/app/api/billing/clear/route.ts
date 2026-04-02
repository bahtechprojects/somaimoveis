import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { sicrediCancelBoleto } from "@/lib/sicredi-client";

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
      return NextResponse.json({ error: "Parâmetro month é obrigatório (YYYY-MM)" }, { status: 400 });
    }

    const [y, m] = monthStr.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

    // Find all PENDENTE payments for this month (not paid, not cancelled)
    const payments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: "PENDENTE",
      },
      select: { id: true, contractId: true, dueDate: true, nossoNumero: true },
    });

    if (payments.length === 0) {
      return NextResponse.json({
        deleted: 0,
        message: "Nenhuma cobrança pendente encontrada para este mês.",
      });
    }

    let deleted = 0;
    const errors: string[] = [];

    for (const payment of payments) {
      try {
        // Cancel boleto if emitted
        if (payment.nossoNumero) {
          try {
            await sicrediCancelBoleto(payment.nossoNumero);
          } catch (err) {
            console.error(`[Billing Clear] Erro ao cancelar boleto ${payment.nossoNumero}:`, err);
          }
        }

        // Delete notifications
        await prisma.notification.deleteMany({
          where: { paymentId: payment.id },
        });

        // Delete owner entries
        await prisma.ownerEntry.deleteMany({
          where: {
            contractId: payment.contractId,
            dueDate: payment.dueDate,
            category: "REPASSE",
            status: "PENDENTE",
          },
        });

        // Delete payment
        await prisma.payment.delete({ where: { id: payment.id } });
        deleted++;
      } catch (err) {
        errors.push(payment.id);
      }
    }

    return NextResponse.json({
      deleted,
      errors: errors.length,
      message: `${deleted} cobrança(s) pendente(s) excluída(s).${errors.length > 0 ? ` ${errors.length} erro(s).` : ""}`,
    });
  } catch (error) {
    console.error("Erro ao limpar cobranças:", error);
    return NextResponse.json(
      { error: "Erro ao limpar cobranças" },
      { status: 500 }
    );
  }
}
