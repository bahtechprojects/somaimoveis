import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/payments/guarantee
 * Marca os repasses de um proprietário no mês como GARANTIA.
 * Não cria entries novos — apenas altera a categoria e descrição do repasse existente.
 * Body: { ownerId, month: "YYYY-MM" }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const { ownerId, month } = body;

  if (!ownerId || !month) {
    return NextResponse.json({ error: "ownerId e month são obrigatórios" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);

  // Buscar repasses PENDENTES deste proprietário no mês que ainda são REPASSE (não já garantidos)
  const repasseEntries = await prisma.ownerEntry.findMany({
    where: {
      ownerId,
      type: "CREDITO",
      category: "REPASSE",
      status: "PENDENTE",
      dueDate: { gte: monthStart, lte: monthEnd },
    },
  });

  if (repasseEntries.length === 0) {
    return NextResponse.json(
      { error: "Nenhum repasse pendente encontrado para garantir neste mês" },
      { status: 404 }
    );
  }

  // Verificar se os pagamentos vinculados estão realmente em atraso
  const contractIds = [...new Set(repasseEntries.map((e) => e.contractId).filter(Boolean))];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overduePayments = await prisma.payment.findMany({
    where: {
      contractId: { in: contractIds as string[] },
      dueDate: { gte: monthStart, lt: today },
      status: { in: ["PENDENTE", "ATRASADO"] },
    },
    select: { contractId: true },
  });
  const overdueContractIds = new Set(overduePayments.map((p) => p.contractId));

  // Marcar apenas os repasses cujo pagamento está atrasado
  let updated = 0;
  for (const entry of repasseEntries) {
    // Se tem contractId, verificar se está atrasado. Se não tem, garantir mesmo assim.
    if (entry.contractId && !overdueContractIds.has(entry.contractId)) {
      continue; // Pagamento não está atrasado, não garantir
    }

    const oldDesc = entry.description;
    const newDesc = oldDesc.replace("Repasse aluguel", "Garantia aluguel");

    await prisma.ownerEntry.update({
      where: { id: entry.id },
      data: {
        category: "GARANTIA",
        description: newDesc,
        notes: JSON.stringify({
          originalCategory: "REPASSE",
          guaranteedAt: new Date().toISOString(),
          originalDescription: oldDesc,
        }),
      },
    });
    updated++;
  }

  if (updated === 0) {
    return NextResponse.json(
      { error: "Nenhum pagamento atrasado encontrado para garantir" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    message: `${updated} repasse(s) marcado(s) como garantia`,
    updated,
  });
}
