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
    const entry = await prisma.ownerEntry.findUnique({
      where: { id },
      include: { owner: true },
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
    if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate as string) : null;
    if (data.paidAt !== undefined) data.paidAt = data.paidAt ? new Date(data.paidAt as string) : null;
    if (data.recurringDay !== undefined) data.recurringDay = data.recurringDay ? parseInt(data.recurringDay as string) : null;
    if (data.installmentNumber !== undefined) data.installmentNumber = data.installmentNumber ? parseInt(data.installmentNumber as string) : null;
    if (data.installmentTotal !== undefined) data.installmentTotal = data.installmentTotal ? parseInt(data.installmentTotal as string) : null;

    const entry = await prisma.ownerEntry.update({
      where: { id },
      data,
      include: { owner: true },
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
    await prisma.ownerEntry.delete({ where: { id } });
    return NextResponse.json({ message: "Lançamento excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao excluir lançamento" }, { status: 500 });
  }
}
