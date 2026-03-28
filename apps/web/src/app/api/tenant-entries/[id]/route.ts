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
    const entry = await prisma.tenantEntry.findUnique({
      where: { id },
      include: { tenant: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json(entry);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar lançamento" }, { status: 500 });
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
    if (data.value !== undefined) data.value = parseFloat(data.value as string);
    if (data.dueDate !== undefined) {
      const d = String(data.dueDate);
      data.dueDate = data.dueDate ? new Date(d.includes("T") ? d : d + "T12:00:00") : null;
    }
    if (data.paidAt !== undefined) {
      const d = String(data.paidAt);
      data.paidAt = data.paidAt ? new Date(d.includes("T") ? d : d + "T12:00:00") : null;
    }

    const entry = await prisma.tenantEntry.update({
      where: { id },
      data,
      include: { tenant: true },
    });
    return NextResponse.json(entry);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar lançamento" }, { status: 500 });
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
    await prisma.tenantEntry.delete({ where: { id } });
    return NextResponse.json({ message: "Lançamento excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao excluir lançamento" }, { status: 500 });
  }
}
