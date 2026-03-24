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

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Imovel nao encontrado" },
        { status: 404 }
      );
    }

    const propertyOwners = await prisma.propertyOwner.findMany({
      where: { propertyId: id },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      propertyId: id,
      primaryOwnerId: property.ownerId,
      owners: propertyOwners,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao buscar proprietarios do imovel" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { ownerId, percentage } = body;

    if (!ownerId || percentage == null) {
      return NextResponse.json(
        { error: "Campos obrigatorios: ownerId, percentage" },
        { status: 400 }
      );
    }

    if (typeof percentage !== "number" || percentage <= 0 || percentage > 100) {
      return NextResponse.json(
        { error: "Percentual deve ser entre 0 e 100" },
        { status: 400 }
      );
    }

    // Verify property exists
    const property = await prisma.property.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Imovel nao encontrado" },
        { status: 404 }
      );
    }

    // Verify owner exists
    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json(
        { error: "Proprietario nao encontrado" },
        { status: 404 }
      );
    }

    // Check if owner already linked
    const existing = await prisma.propertyOwner.findUnique({
      where: { propertyId_ownerId: { propertyId: id, ownerId } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Proprietario ja vinculado a este imovel" },
        { status: 409 }
      );
    }

    // Validate total percentage won't exceed 100%
    const currentOwners = await prisma.propertyOwner.findMany({
      where: { propertyId: id },
      select: { percentage: true },
    });
    const currentTotal = currentOwners.reduce(
      (sum, o) => sum + o.percentage,
      0
    );
    if (currentTotal + percentage > 100) {
      return NextResponse.json(
        {
          error: `Percentual total excede 100%. Atual: ${currentTotal}%, tentando adicionar: ${percentage}%`,
        },
        { status: 400 }
      );
    }

    const propertyOwner = await prisma.propertyOwner.create({
      data: {
        propertyId: id,
        ownerId,
        percentage,
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    return NextResponse.json(propertyOwner, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao adicionar proprietario" },
      { status: 500 }
    );
  }
}
