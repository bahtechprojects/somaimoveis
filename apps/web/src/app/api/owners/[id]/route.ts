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
    const data: Record<string, unknown> = {
      name: body.name || undefined,
      cpfCnpj: body.cpfCnpj || undefined,
      personType: body.personType || undefined,
      email: body.email || null,
      phone: body.phone || null,
      stateRegistration: body.stateRegistration || null,
      birthDate: body.birthDate ? new Date(body.birthDate + "T12:00:00") : null,
      rgIssuer: body.rgIssuer || null,
      street: body.street || null,
      number: body.number || null,
      complement: body.complement || null,
      neighborhood: body.neighborhood || null,
      city: body.city || null,
      state: body.state || null,
      zipCode: body.zipCode || null,
      bankName: body.bankName || null,
      bankAgency: body.bankAgency || null,
      bankAccount: body.bankAccount || null,
      bankPix: body.bankPix || null,
      bankPixType: body.bankPixType || null,
      thirdPartyName: body.thirdPartyName || null,
      thirdPartyDocument: body.thirdPartyDocument || null,
      thirdPartyBank: body.thirdPartyBank || null,
      thirdPartyAgency: body.thirdPartyAgency || null,
      thirdPartyAccount: body.thirdPartyAccount || null,
      thirdPartyPixKeyType: body.thirdPartyPixKeyType || null,
      thirdPartyPix: body.thirdPartyPix || null,
      paymentDay: body.paymentDay ? parseInt(body.paymentDay) : undefined,
      notes: body.notes || null,
    };
    // Remove undefined keys
    Object.keys(data).forEach(k => { if (data[k] === undefined) delete data[k]; });
    const owner = await prisma.owner.update({
      where: { id },
      data,
    });
    return NextResponse.json(owner);
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 404 });
    }
    console.error("Owner update error:", error);
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
