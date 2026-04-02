import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

// POST: Corrige lançamentos marcados como PAGO incorretamente pela geração de cobranças.
// Restaura para PENDENTE todos os lançamentos do locatário que estão PAGO
// mas cujo pagamento correspondente (mesmo locatário + mesmo mês) NÃO está PAGO.
export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // Find all PAGO tenant entries
    const pagoEntries = await prisma.tenantEntry.findMany({
      where: { status: "PAGO" },
      select: { id: true, tenantId: true, dueDate: true },
    });

    if (pagoEntries.length === 0) {
      return NextResponse.json({
        fixed: 0,
        message: "Nenhum lançamento PAGO encontrado.",
      });
    }

    const idsToRestore: string[] = [];

    for (const entry of pagoEntries) {
      if (!entry.dueDate) {
        // Entry without dueDate and PAGO - likely incorrect, restore it
        idsToRestore.push(entry.id);
        continue;
      }

      // Check if there's a PAGO payment for this tenant in the same month
      const monthStart = new Date(entry.dueDate.getFullYear(), entry.dueDate.getMonth(), 1);
      const monthEnd = new Date(entry.dueDate.getFullYear(), entry.dueDate.getMonth() + 1, 0, 23, 59, 59, 999);

      const paidPayment = await prisma.payment.findFirst({
        where: {
          tenantId: entry.tenantId,
          dueDate: { gte: monthStart, lte: monthEnd },
          status: "PAGO",
        },
        select: { id: true },
      });

      // If no PAGO payment exists, this entry was marked PAGO incorrectly
      if (!paidPayment) {
        idsToRestore.push(entry.id);
      }
    }

    if (idsToRestore.length === 0) {
      return NextResponse.json({
        fixed: 0,
        total: pagoEntries.length,
        message: "Todos os lançamentos PAGO estão corretos.",
      });
    }

    // Restore to PENDENTE
    await prisma.tenantEntry.updateMany({
      where: { id: { in: idsToRestore } },
      data: { status: "PENDENTE" },
    });

    return NextResponse.json({
      fixed: idsToRestore.length,
      total: pagoEntries.length,
      message: `${idsToRestore.length} lançamento(s) restaurado(s) para PENDENTE.`,
    });
  } catch (error) {
    console.error("Erro ao corrigir lançamentos:", error);
    return NextResponse.json(
      { error: "Erro ao corrigir lançamentos" },
      { status: 500 }
    );
  }
}
