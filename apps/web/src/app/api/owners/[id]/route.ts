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
    const owner = await prisma.owner.findUnique({
      where: { id },
      include: {
        properties: true,
        contracts: {
          include: {
            property: true,
            tenant: true,
          },
        },
      },
    });
    if (!owner) {
      return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
    }
    return NextResponse.json(owner);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar proprietário" }, { status: 500 });
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
    if (body.birthDate) body.birthDate = new Date(body.birthDate);
    if (body.monthlyIncome) body.monthlyIncome = parseFloat(body.monthlyIncome);
    const owner = await prisma.owner.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(owner);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar proprietário" }, { status: 500 });
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
    await prisma.owner.delete({ where: { id } });
    return NextResponse.json({ message: "Proprietário excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
    }
    if (error?.code === "P2003") {
      return NextResponse.json({ error: "Proprietário possui imóveis ou contratos vinculados" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao excluir proprietário" }, { status: 500 });
  }
}
