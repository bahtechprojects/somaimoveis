import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // Fetch the existing contract
    const existing = await prisma.contract.findUnique({
      where: { id },
      include: {
        property: { select: { id: true } },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Contrato nao encontrado" },
        { status: 404 }
      );
    }

    // Only allow renewal for ATIVO or PENDENTE_RENOVACAO contracts
    if (existing.status !== "ATIVO" && existing.status !== "PENDENTE_RENOVACAO") {
      return NextResponse.json(
        { error: "Somente contratos ativos ou pendentes de renovacao podem ser renovados." },
        { status: 400 }
      );
    }

    // Determine renewal parameters
    const renewalMonths = body.renewalMonths ?? existing.renewalMonths ?? 12;
    const newRentalValue = body.rentalValue != null
      ? parseFloat(body.rentalValue)
      : existing.rentalValue;

    // New start date = old end date + 1 day
    const oldEndDate = new Date(existing.endDate);
    const newStartDate = new Date(oldEndDate);
    newStartDate.setDate(newStartDate.getDate() + 1);

    // New end date = new start date + renewalMonths
    const newEndDate = new Date(newStartDate);
    newEndDate.setMonth(newEndDate.getMonth() + renewalMonths);

    // Generate new contract code
    const lastContract = await prisma.contract.findFirst({
      orderBy: { code: "desc" },
      select: { code: true },
    });
    let nextNumber = 1;
    if (lastContract?.code) {
      const match = lastContract.code.match(/CTR-(\d+)/);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }
    const newCode = `CTR-${String(nextNumber).padStart(3, "0")}`;

    // Create the new contract and update old one in a transaction
    const [newContract] = await prisma.$transaction([
      prisma.contract.create({
        data: {
          code: newCode,
          type: existing.type,
          status: "ATIVO",
          propertyId: existing.propertyId,
          ownerId: existing.ownerId,
          tenantId: existing.tenantId,
          rentalValue: newRentalValue,
          adminFeePercent: existing.adminFeePercent,
          paymentDay: existing.paymentDay,
          startDate: newStartDate,
          endDate: newEndDate,
          renewalMonths: renewalMonths,
          penaltyPercent: existing.penaltyPercent,
          intermediationFee: existing.intermediationFee,
          intermediationInstallments: existing.intermediationInstallments,
          guaranteeType: existing.guaranteeType,
          guaranteeValue: existing.guaranteeValue,
          guaranteeNotes: existing.guaranteeNotes,
          adjustmentIndex: existing.adjustmentIndex,
          adjustmentMonth: existing.adjustmentMonth,
          notes: `Renovação do contrato ${existing.code}`,
        },
      }),
      prisma.contract.update({
        where: { id: existing.id },
        data: { status: "ENCERRADO" },
      }),
    ]);

    return NextResponse.json(newContract, { status: 201 });
  } catch (error) {
    console.error("Erro ao renovar contrato:", error);
    return NextResponse.json(
      { error: "Erro ao renovar contrato" },
      { status: 500 }
    );
  }
}
