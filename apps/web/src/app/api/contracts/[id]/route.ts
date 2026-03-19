import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        property: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
        tenant: { select: { id: true, name: true } },
        guarantor: { select: { id: true, name: true } },
        payments: { select: { id: true, code: true, value: true, status: true, dueDate: true } },
      },
    });
    if (!contract) {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    }
    return NextResponse.json(contract);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar contrato" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;
    const body = await request.json();

    // Parse numeric and date fields if present
    const data: Record<string, unknown> = { ...body };
    if (data.rentalValue !== undefined) data.rentalValue = parseFloat(data.rentalValue as string);
    if (data.adminFeePercent !== undefined) data.adminFeePercent = parseFloat(data.adminFeePercent as string);
    if (data.intermediationFee !== undefined) data.intermediationFee = data.intermediationFee ? parseFloat(data.intermediationFee as string) : null;
    if (data.startDate !== undefined) data.startDate = new Date(data.startDate as string);
    if (data.endDate !== undefined) data.endDate = new Date(data.endDate as string);
    if (data.paymentDay !== undefined) data.paymentDay = parseInt(data.paymentDay as string);
    if (data.guaranteeValue !== undefined) data.guaranteeValue = data.guaranteeValue ? parseFloat(data.guaranteeValue as string) : null;
    if (data.adjustmentMonth !== undefined) data.adjustmentMonth = data.adjustmentMonth ? parseInt(data.adjustmentMonth as string) : null;

    // guarantorId only when guaranteeType is FIADOR, else null
    if (data.guaranteeType !== undefined && data.guaranteeType !== "FIADOR") {
      data.guarantorId = null;
    }

    const contract = await prisma.contract.update({
      where: { id },
      data,
      include: {
        property: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
        tenant: { select: { id: true, name: true } },
        guarantor: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(contract);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar contrato" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;
    await prisma.contract.delete({ where: { id } });
    return NextResponse.json({ message: "Contrato excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao excluir contrato" }, { status: 500 });
  }
}
