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
      include: { property: true, owner: true, tenant: true, payments: true },
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
    const contract = await prisma.contract.update({
      where: { id },
      data: body,
      include: { property: true, owner: true, tenant: true },
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
    if (error?.code === "P2003") {
      return NextResponse.json({ error: "Contrato possui pagamentos vinculados" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao excluir contrato" }, { status: 500 });
  }
}
