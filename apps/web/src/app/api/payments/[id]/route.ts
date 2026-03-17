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
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { contract: true, tenant: true, owner: true },
    });
    if (!payment) {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json(payment);
  } catch (error) {
    return NextResponse.json({ error: "Erro ao buscar pagamento" }, { status: 500 });
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
    const payment = await prisma.payment.update({
      where: { id },
      data: body,
      include: { contract: true, tenant: true, owner: true },
    });
    return NextResponse.json(payment);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar pagamento" }, { status: 500 });
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
    await prisma.payment.delete({ where: { id } });
    return NextResponse.json({ message: "Pagamento excluído com sucesso" });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao excluir pagamento" }, { status: 500 });
  }
}
