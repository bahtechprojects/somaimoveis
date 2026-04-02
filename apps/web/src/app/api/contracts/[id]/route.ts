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

    // Parse numeric and date fields if present - only allow explicit fields (no mass assignment)
    const data: Record<string, unknown> = {};
    if (body.rentalValue !== undefined) data.rentalValue = parseFloat(body.rentalValue as string);
    if (body.adminFeePercent !== undefined) data.adminFeePercent = parseFloat(body.adminFeePercent as string);
    if (body.bankFee !== undefined) data.bankFee = parseFloat(body.bankFee as string);
    if (body.insuranceFee !== undefined) data.insuranceFee = body.insuranceFee ? parseFloat(body.insuranceFee as string) : null;
    if (body.intermediationFee !== undefined) data.intermediationFee = body.intermediationFee ? parseFloat(body.intermediationFee as string) : null;
    if (body.startDate !== undefined) {
      const sd = body.startDate as string;
      data.startDate = new Date(sd.includes("T") ? sd : sd + "T12:00:00");
    }
    if (body.endDate !== undefined) {
      const ed = body.endDate as string;
      data.endDate = new Date(ed.includes("T") ? ed : ed + "T12:00:00");
    }
    if (body.paymentDay !== undefined) data.paymentDay = parseInt(body.paymentDay as string);
    if (body.tenant2Id !== undefined) data.tenant2Id = body.tenant2Id || null;
    if (body.guaranteeValue !== undefined) data.guaranteeValue = body.guaranteeValue ? parseFloat(body.guaranteeValue as string) : null;
    if (body.adjustmentMonth !== undefined) data.adjustmentMonth = body.adjustmentMonth ? parseInt(body.adjustmentMonth as string) : null;
    if (body.intermediationInstallments !== undefined) data.intermediationInstallments = body.intermediationInstallments ? parseInt(body.intermediationInstallments as string) : 1;
    if (body.lastAdjustmentPercent !== undefined) data.lastAdjustmentPercent = body.lastAdjustmentPercent ? parseFloat(body.lastAdjustmentPercent as string) : null;
    if (body.lastAdjustmentDate !== undefined) {
      const d = String(body.lastAdjustmentDate);
      data.lastAdjustmentDate = body.lastAdjustmentDate ? new Date(d.includes("T") ? d : d + "T12:00:00") : null;
    }
    if (body.status !== undefined) data.status = body.status;
    if (body.propertyId !== undefined) data.propertyId = body.propertyId;
    if (body.ownerId !== undefined) data.ownerId = body.ownerId;
    if (body.tenantId !== undefined) data.tenantId = body.tenantId;
    if (body.guaranteeType !== undefined) data.guaranteeType = body.guaranteeType;
    if (body.adjustmentIndex !== undefined) data.adjustmentIndex = body.adjustmentIndex;
    if (body.notes !== undefined) data.notes = body.notes;

    // Handle many-to-many guarantors
    const guarantorIds: string[] | undefined = body.guarantorIds as string[] | undefined;

    const guarantorsUpdate = (body.guaranteeType ?? data.guaranteeType) === "FIADOR" && Array.isArray(guarantorIds)
      ? {
          deleteMany: {},
          create: guarantorIds.map((gId: string) => ({ guarantorId: gId })),
        }
      : body.guaranteeType !== undefined && body.guaranteeType !== "FIADOR"
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
