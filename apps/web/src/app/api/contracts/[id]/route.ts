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
        owner: { select: { id: true, name: true, paymentDay: true } },
        tenant: { select: { id: true, name: true, paymentDay: true } },
        tenant2: { select: { id: true, name: true } },
        guarantors: {
          select: { guarantor: { select: { id: true, name: true, cpfCnpj: true } } },
        },
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
    if (data.bankFee !== undefined) data.bankFee = parseFloat(data.bankFee as string);
    if (data.intermediationFee !== undefined) data.intermediationFee = data.intermediationFee ? parseFloat(data.intermediationFee as string) : null;
    if (data.startDate !== undefined) {
      const sd = data.startDate as string;
      data.startDate = new Date(sd.includes("T") ? sd : sd + "T12:00:00");
    }
    if (data.endDate !== undefined) {
      const ed = data.endDate as string;
      data.endDate = new Date(ed.includes("T") ? ed : ed + "T12:00:00");
    }
    if (data.paymentDay !== undefined) data.paymentDay = parseInt(data.paymentDay as string);
    if (data.tenant2Id !== undefined) data.tenant2Id = data.tenant2Id || null;
    if (data.guaranteeValue !== undefined) data.guaranteeValue = data.guaranteeValue ? parseFloat(data.guaranteeValue as string) : null;
    if (data.adjustmentMonth !== undefined) data.adjustmentMonth = data.adjustmentMonth ? parseInt(data.adjustmentMonth as string) : null;
    if (data.intermediationInstallments !== undefined) data.intermediationInstallments = data.intermediationInstallments ? parseInt(data.intermediationInstallments as string) : 1;
    if (data.lastAdjustmentPercent !== undefined) data.lastAdjustmentPercent = data.lastAdjustmentPercent ? parseFloat(data.lastAdjustmentPercent as string) : null;
    if (data.lastAdjustmentDate !== undefined) data.lastAdjustmentDate = data.lastAdjustmentDate ? new Date(data.lastAdjustmentDate as string) : null;

    // Handle many-to-many guarantors
    const guarantorIds: string[] | undefined = data.guarantorIds as string[] | undefined;
    delete data.guarantorIds;
    // Remove legacy guarantorId if present
    delete data.guarantorId;

    const guarantorsUpdate = data.guaranteeType === "FIADOR" && Array.isArray(guarantorIds)
      ? {
          deleteMany: {},
          create: guarantorIds.map((gId: string) => ({ guarantorId: gId })),
        }
      : data.guaranteeType !== "FIADOR"
        ? { deleteMany: {} }
        : undefined;

    if (guarantorsUpdate) {
      data.guarantors = guarantorsUpdate;
    }

    const contract = await prisma.contract.update({
      where: { id },
      data,
      include: {
        property: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
        tenant: { select: { id: true, name: true } },
        tenant2: { select: { id: true, name: true } },
        guarantors: {
          select: { guarantor: { select: { id: true, name: true, cpfCnpj: true } } },
        },
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
