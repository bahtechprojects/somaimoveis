import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ownerId: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id, ownerId } = await params;
    const body = await request.json();
    const { percentage } = body;

    if (percentage == null) {
      return NextResponse.json(
        { error: "Campo obrigatorio: percentage" },
        { status: 400 }
      );
    }

    if (typeof percentage !== "number" || percentage <= 0 || percentage > 100) {
      return NextResponse.json(
        { error: "Percentual deve ser entre 0 e 100" },
        { status: 400 }
      );
    }

    // Check record exists
    const existing = await prisma.propertyOwner.findUnique({
      where: { propertyId_ownerId: { propertyId: id, ownerId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vinculo proprietario-imovel nao encontrado" },
        { status: 404 }
      );
    }

    // Validate total percentage won't exceed 100% (excluding current record)
    const otherOwners = await prisma.propertyOwner.findMany({
      where: { propertyId: id, NOT: { ownerId } },
      select: { percentage: true },
    });
    const othersTotal = otherOwners.reduce((sum, o) => sum + o.percentage, 0);
    if (othersTotal + percentage > 100) {
      return NextResponse.json(
        {
          error: `Percentual total excede 100%. Outros proprietarios: ${othersTotal}%, tentando definir: ${percentage}%`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.propertyOwner.update({
      where: { propertyId_ownerId: { propertyId: id, ownerId } },
      data: { percentage },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao atualizar percentual" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ownerId: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id, ownerId } = await params;

    const existing = await prisma.propertyOwner.findUnique({
      where: { propertyId_ownerId: { propertyId: id, ownerId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Vinculo proprietario-imovel nao encontrado" },
        { status: 404 }
      );
    }

    await prisma.propertyOwner.delete({
      where: { propertyId_ownerId: { propertyId: id, ownerId } },
    });

    return NextResponse.json({
      message: "Proprietario removido do imovel com sucesso",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao remover proprietario" },
      { status: 500 }
    );
  }
}
