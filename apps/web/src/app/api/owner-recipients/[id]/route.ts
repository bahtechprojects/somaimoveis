import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * PUT /api/owner-recipients/[id] — atualiza
 * DELETE /api/owner-recipients/[id] — remove (soft via active=false)
 *                                     ou hard com ?hard=true
 */
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
    if (body.name !== undefined) data.name = body.name;
    if (body.cpfCnpj !== undefined) data.cpfCnpj = body.cpfCnpj || null;
    if (body.bankPix !== undefined) data.bankPix = body.bankPix || null;
    if (body.bankPixType !== undefined) data.bankPixType = body.bankPixType || null;
    if (body.bankName !== undefined) data.bankName = body.bankName || null;
    if (body.bankAgency !== undefined) data.bankAgency = body.bankAgency || null;
    if (body.bankAccount !== undefined) data.bankAccount = body.bankAccount || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.active !== undefined) data.active = !!body.active;
    if (body.sharePercent !== undefined) {
      const pct = parseFloat(body.sharePercent);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        return NextResponse.json(
          { error: "sharePercent deve ser > 0 e ≤ 100" },
          { status: 400 }
        );
      }
      data.sharePercent = pct;
    }

    const updated = await prisma.ownerRecipient.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[Recipient PUT]", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Recebedor nao encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar recebedor" },
      { status: 500 }
    );
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
    const { searchParams } = new URL(request.url);
    const hard = searchParams.get("hard") === "true";

    if (hard) {
      await prisma.ownerRecipient.delete({ where: { id } });
    } else {
      await prisma.ownerRecipient.update({
        where: { id },
        data: { active: false },
      });
    }

    return NextResponse.json({ message: "Recebedor removido" });
  } catch (error: any) {
    console.error("[Recipient DELETE]", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Recebedor nao encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error?.message || "Erro ao remover" },
      { status: 500 }
    );
  }
}
