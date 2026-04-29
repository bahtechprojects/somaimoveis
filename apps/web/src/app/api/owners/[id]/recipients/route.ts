import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/owners/[id]/recipients
 * Lista todos os recebedores ativos do proprietario.
 *
 * POST /api/owners/[id]/recipients
 * Cria um novo recebedor.
 * Body: { name, cpfCnpj?, bankPix?, bankPixType?, bankName?, bankAgency?,
 *         bankAccount?, sharePercent }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const recipients = await prisma.ownerRecipient.findMany({
    where: { ownerId: id, active: true },
    orderBy: { createdAt: "asc" },
  });

  const totalShare = recipients.reduce((s, r) => s + r.sharePercent, 0);
  return NextResponse.json({
    recipients,
    totalShare: Math.round(totalShare * 100) / 100,
    valid: Math.abs(totalShare - 100) < 0.01 || recipients.length === 0,
  });
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
    const { name, sharePercent } = body;

    if (!name || sharePercent == null) {
      return NextResponse.json(
        { error: "Campos obrigatorios: name, sharePercent" },
        { status: 400 }
      );
    }

    const pct = parseFloat(sharePercent);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      return NextResponse.json(
        { error: "sharePercent deve ser > 0 e ≤ 100" },
        { status: 400 }
      );
    }

    // Verificar se o proprietario existe
    const owner = await prisma.owner.findUnique({ where: { id } });
    if (!owner) {
      return NextResponse.json({ error: "Proprietario nao encontrado" }, { status: 404 });
    }

    const recipient = await prisma.ownerRecipient.create({
      data: {
        ownerId: id,
        name,
        cpfCnpj: body.cpfCnpj || null,
        bankPix: body.bankPix || null,
        bankPixType: body.bankPixType || null,
        bankName: body.bankName || null,
        bankAgency: body.bankAgency || null,
        bankAccount: body.bankAccount || null,
        sharePercent: pct,
        notes: body.notes || null,
      },
    });

    return NextResponse.json(recipient, { status: 201 });
  } catch (error: any) {
    console.error("[Recipient POST]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao criar recebedor" },
      { status: 500 }
    );
  }
}
