import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { ownerId } = body;

    if (!ownerId) {
      return NextResponse.json(
        { error: "ownerId é obrigatório" },
        { status: 400 }
      );
    }

    // Verify owner exists
    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Proprietario nao encontrado" },
        { status: 404 }
      );
    }

    // Generate a random token
    const token = crypto.randomBytes(32).toString("hex");

    // Update the owner with the new token and activate portal
    await prisma.owner.update({
      where: { id: ownerId },
      data: {
        portalToken: token,
        portalActive: true,
      },
    });

    const portalUrl = `/portal/login?token=${token}`;

    return NextResponse.json({
      token,
      portalUrl,
    });
  } catch (error) {
    console.error("Erro ao gerar token do portal:", error);
    return NextResponse.json(
      { error: "Erro ao gerar token do portal" },
      { status: 500 }
    );
  }
}
