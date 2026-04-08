import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/payments/guarantee
 * Garante aluguel por contrato+mês: busca o pagamento atrasado/pendente
 * e cria um CREDITO/GARANTIA na conta do proprietário.
 * Body: { contractId, month: "YYYY-MM" }
 *   OU: { ownerId, month: "YYYY-MM" } (garante TODOS os pagamentos atrasados do proprietário no mês)
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

  // Buscar pagamentos atrasados/pendentes vencidos deste proprietário no mês
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const payments = await prisma.payment.findMany({
    where: {
      ownerId,
      dueDate: { gte: monthStart, lt: today },
      status: { in: ["PENDENTE", "ATRASADO"] },
    },
    include: {
      contract: { select: { code: true, property: { select: { id: true } } } },
    },
  });

  if (payments.length === 0) {
    return NextResponse.json({ error: "Nenhum pagamento atrasado encontrado para este proprietário no mês" }, { status: 404 });
  }

  const entries = [];

  for (const payment of payments) {
    // Verificar se já existe garantia para este pagamento
    const existing = await prisma.ownerEntry.findFirst({
      where: {
        category: "GARANTIA",
        notes: { contains: payment.id },
        ownerId: payment.ownerId,
      },
    });

    if (existing) continue; // Já garantido

    const guaranteeValue = payment.netToOwner ?? payment.splitOwnerValue ?? payment.value;
    const dueDate = new Date(payment.dueDate);
    const mLabel = `${String(dueDate.getMonth() + 1).padStart(2, "0")}/${dueDate.getFullYear()}`;
    const propertyId = payment.contract?.property?.id;

    const entry = await prisma.ownerEntry.create({
      data: {
        type: "CREDITO",
        category: "GARANTIA",
        description: `Garantia aluguel ${mLabel} - ${payment.contract?.code || payment.code}`,
        value: guaranteeValue,
        dueDate: new Date(),
        status: "PENDENTE",
        ownerId: payment.ownerId,
        contractId: payment.contractId,
        propertyId,
        notes: JSON.stringify({
          paymentId: payment.id,
          paymentCode: payment.code,
          guaranteedAt: new Date().toISOString(),
          originalValue: payment.value,
          ownerValue: guaranteeValue,
        }),
      },
    });
    entries.push(entry);
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "Todos os pagamentos deste proprietário já possuem garantia" }, { status: 409 });
  }

  const totalValue = entries.reduce((s, e) => s + e.value, 0);

  return NextResponse.json({
    message: `${entries.length} garantia(s) criada(s) - Total: R$ ${totalValue.toFixed(2)}`,
    entries,
  }, { status: 201 });
}
