import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/payments/:id/guarantee
 * Garante o aluguel ao proprietário quando o inquilino não paga.
 * Cria um CREDITO/GARANTIA na conta do proprietário com o valor do repasse.
 * O pagamento do inquilino permanece como ATRASADO/PENDENTE.
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
    include: {
      contract: { select: { code: true, property: { select: { id: true } } } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
  }

  if (payment.status === "PAGO") {
    return NextResponse.json({ error: "Pagamento já está pago, não precisa de garantia" }, { status: 400 });
  }

  if (payment.status === "CANCELADO") {
    return NextResponse.json({ error: "Pagamento cancelado" }, { status: 400 });
  }

  // Verificar se já existe garantia para este pagamento
  const existing = await prisma.ownerEntry.findFirst({
    where: {
      category: "GARANTIA",
      notes: { contains: payment.id },
      ownerId: payment.ownerId,
    },
  });

  if (existing) {
    return NextResponse.json({ error: "Já existe garantia para este pagamento", existing }, { status: 409 });
  }

  // Valor do repasse ao proprietário (splitOwnerValue ou netToOwner se tem IRRF)
  const guaranteeValue = payment.netToOwner ?? payment.splitOwnerValue ?? payment.value;
  const dueDate = new Date(payment.dueDate);
  const mLabel = `${String(dueDate.getMonth() + 1).padStart(2, "0")}/${dueDate.getFullYear()}`;

  // Criar CREDITO/GARANTIA para o proprietário (split por PropertyOwner se múltiplos)
  const propertyId = payment.contract?.property?.id;
  const ownerShares = propertyId
    ? await prisma.propertyOwner.findMany({ where: { propertyId } })
    : [];

  const entries = [];

  if (ownerShares.length > 1) {
    for (const share of ownerShares) {
      const portion = Math.round(guaranteeValue * (share.percentage / 100) * 100) / 100;
      const entry = await prisma.ownerEntry.create({
        data: {
          type: "CREDITO",
          category: "GARANTIA",
          description: `Garantia aluguel ${mLabel} - ${payment.contract?.code || payment.code} (${share.percentage}%)`,
          value: portion,
          dueDate: new Date(),
          status: "PENDENTE",
          ownerId: share.ownerId,
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
  } else {
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

  return NextResponse.json({
    message: `Garantia criada: ${entries.length} entrada(s) no valor total de R$ ${guaranteeValue.toFixed(2)}`,
    entries,
  }, { status: 201 });
}
