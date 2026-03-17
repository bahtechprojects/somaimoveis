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
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        contracts: {
          include: {
            property: true,
            owner: true,
          },
        },
        payments: {
          include: {
            contract: { select: { code: true } },
          },
          orderBy: { dueDate: "desc" },
        },
      },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Locatário não encontrado" }, { status: 404 });
    }
    return NextResponse.json(tenant);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar locatário" }, { status: 500 });
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
    const tenant = await prisma.tenant.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(tenant);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Locatário não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar locatário" }, { status: 500 });
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
    await prisma.tenant.delete({ where: { id } });
    return NextResponse.json({ message: "Locatário excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Locatário não encontrado" }, { status: 404 });
    }
    if (error?.code === "P2003") {
      return NextResponse.json({ error: "Locatário possui contratos vinculados" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao excluir locatário" }, { status: 500 });
  }
}
