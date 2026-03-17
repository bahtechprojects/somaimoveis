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
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        owner: true,
        photos: { orderBy: { order: "asc" } },
        contracts: { include: { tenant: true }, orderBy: { startDate: "desc" } },
      },
    });
    if (!property) {
      return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }
    return NextResponse.json(property);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar imóvel" }, { status: 500 });
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
    const property = await prisma.property.update({
      where: { id },
      data: body,
      include: { owner: true },
    });
    return NextResponse.json(property);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar imóvel" }, { status: 500 });
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
    await prisma.property.delete({ where: { id } });
    return NextResponse.json({ message: "Imóvel excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }
    if (error?.code === "P2003") {
      return NextResponse.json({ error: "Imóvel possui contratos vinculados" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao excluir imóvel" }, { status: 500 });
  }
}
