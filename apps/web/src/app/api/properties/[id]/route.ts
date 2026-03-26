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
    const data: Record<string, unknown> = {};
    // String fields
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.type !== undefined) data.type = body.type;
    if (body.status !== undefined) data.status = body.status;
    if (body.street !== undefined) data.street = body.street;
    if (body.number !== undefined) data.number = body.number;
    if (body.complement !== undefined) data.complement = body.complement;
    if (body.neighborhood !== undefined) data.neighborhood = body.neighborhood;
    if (body.city !== undefined) data.city = body.city;
    if (body.state !== undefined) data.state = body.state;
    if (body.zipCode !== undefined) data.zipCode = body.zipCode;
    if (body.notes !== undefined) data.notes = body.notes;
    // Numeric fields (parseFloat)
    if (body.area !== undefined) data.area = body.area ? parseFloat(body.area) : null;
    if (body.rentalValue !== undefined) data.rentalValue = body.rentalValue ? parseFloat(body.rentalValue) : null;
    if (body.saleValue !== undefined) data.saleValue = body.saleValue ? parseFloat(body.saleValue) : null;
    if (body.condoFee !== undefined) data.condoFee = body.condoFee ? parseFloat(body.condoFee) : null;
    if (body.iptuValue !== undefined) data.iptuValue = body.iptuValue ? parseFloat(body.iptuValue) : null;
    // Integer fields (parseInt)
    if (body.bedrooms !== undefined) data.bedrooms = body.bedrooms ? parseInt(body.bedrooms) : null;
    if (body.bathrooms !== undefined) data.bathrooms = body.bathrooms ? parseInt(body.bathrooms) : null;
    if (body.parkingSpaces !== undefined) data.parkingSpaces = body.parkingSpaces ? parseInt(body.parkingSpaces) : null;
    // ID fields
    if (body.ownerId !== undefined) data.ownerId = body.ownerId;
    // Boolean fields
    if (body.furnished !== undefined) data.furnished = Boolean(body.furnished);

    const property = await prisma.property.update({
      where: { id },
      data,
      include: { owner: true },
    });
    return NextResponse.json(property);
  } catch (error: any) {
    console.error("[Property PUT] Erro:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Erro ao atualizar imóvel", details: error?.message || String(error) }, { status: 500 });
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
