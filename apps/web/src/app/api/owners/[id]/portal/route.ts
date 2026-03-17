import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET - Retorna o status do portal do proprietario
 */
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
      select: {
        id: true,
        name: true,
        email: true,
        portalToken: true,
        portalActive: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Proprietario nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ownerId: owner.id,
      ownerName: owner.name,
      ownerEmail: owner.email,
      portalActive: owner.portalActive,
      portalToken: owner.portalToken,
    });
  } catch (error) {
    console.error("Erro ao buscar status do portal:", error);
    return NextResponse.json(
      { error: "Erro ao buscar status do portal" },
      { status: 500 }
    );
  }
}

/**
 * POST - Gera um novo token do portal e ativa o acesso
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;

    // Verificar se o proprietario existe
    const existing = await prisma.owner.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Proprietario nao encontrado" },
        { status: 404 }
      );
    }

    // Gerar token aleatorio de 32 caracteres hex
    const portalToken = randomBytes(16).toString("hex");

    const owner = await prisma.owner.update({
      where: { id },
      data: {
        portalToken,
        portalActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        portalToken: true,
        portalActive: true,
      },
    });

    return NextResponse.json({
      message: "Portal ativado com sucesso",
      ownerId: owner.id,
      ownerName: owner.name,
      ownerEmail: owner.email,
      portalActive: owner.portalActive,
      portalToken: owner.portalToken,
    });
  } catch (error) {
    console.error("Erro ao ativar portal:", error);
    return NextResponse.json(
      { error: "Erro ao ativar portal do proprietario" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Revoga o acesso ao portal
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await params;

    // Verificar se o proprietario existe
    const existing = await prisma.owner.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Proprietario nao encontrado" },
        { status: 404 }
      );
    }

    await prisma.owner.update({
      where: { id },
      data: {
        portalToken: null,
        portalActive: false,
      },
    });

    return NextResponse.json({
      message: "Acesso ao portal revogado com sucesso",
    });
  } catch (error) {
    console.error("Erro ao revogar portal:", error);
    return NextResponse.json(
      { error: "Erro ao revogar acesso ao portal" },
      { status: 500 }
    );
  }
}
