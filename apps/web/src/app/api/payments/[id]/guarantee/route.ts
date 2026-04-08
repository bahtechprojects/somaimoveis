import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/payments/:id/guarantee
 * Marca o repasse vinculado a este pagamento como GARANTIA.
 * Não cria entry novo — altera a categoria do repasse existente.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { id: true, code: true, contractId: true, ownerId: true, status: true, dueDate: true },
  });

  if (!payment) {
    return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  }

  if (payment.status === "PAGO") {
    return NextResponse.json({ error: "Pagamento já está pago, não precisa de garantia" }, { status: 400 });
  }

  // Buscar repasse PENDENTE vinculado a este contrato no mesmo mês
  const dueDate = new Date(payment.dueDate);
  const monthStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
  const monthEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const repasseEntries = await prisma.ownerEntry.findMany({
    where: {
      contractId: payment.contractId,
      ownerId: payment.ownerId,
      type: "CREDITO",
      category: "REPASSE",
      status: "PENDENTE",
      dueDate: { gte: monthStart, lte: monthEnd },
    },
  });

  if (repasseEntries.length === 0) {
    // Verificar se já está garantido
    const alreadyGuaranteed = await prisma.ownerEntry.findFirst({
      where: {
        contractId: payment.contractId,
        ownerId: payment.ownerId,
        type: "CREDITO",
        category: "GARANTIA",
        dueDate: { gte: monthStart, lte: monthEnd },
      },
    });

    if (alreadyGuaranteed) {
      return NextResponse.json({ error: "Este repasse já está marcado como garantia" }, { status: 409 });
    }

    return NextResponse.json({ error: "Nenhum repasse pendente encontrado para este pagamento" }, { status: 404 });
  }

  let updated = 0;
  for (const entry of repasseEntries) {
    const newDesc = entry.description.replace("Repasse aluguel", "Garantia aluguel");
    await prisma.ownerEntry.update({
      where: { id: entry.id },
      data: {
        category: "GARANTIA",
        description: newDesc,
        notes: JSON.stringify({
          originalCategory: "REPASSE",
          guaranteedAt: new Date().toISOString(),
          paymentId: payment.id,
          paymentCode: payment.code,
          originalDescription: entry.description,
        }),
      },
    });
    updated++;
  }

  return NextResponse.json({
    message: `${updated} repasse(s) marcado(s) como garantia`,
    updated,
  });
}
