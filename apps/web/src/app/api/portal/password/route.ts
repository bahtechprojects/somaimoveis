import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyPortalToken } from "@/lib/portal-auth";

/**
 * POST /api/portal/password
 * Proprietario logado define ou altera sua senha de acesso ao portal.
 * Body: { currentPassword?: string, newPassword: string }
 *
 * - Se for primeira definicao: currentPassword NAO eh exigido
 * - Se ja tem senha definida: currentPassword eh obrigatorio e validado
 */
export async function POST(request: NextRequest) {
  const auth = await verifyPortalToken(request);
  if (!auth) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Nova senha invalida (minimo 6 caracteres)" },
        { status: 400 }
      );
    }

    const owner = await prisma.owner.findUnique({
      where: { id: auth.ownerId },
      select: { portalPassword: true, portalToken: true, portalActive: true },
    });

    if (!owner || !owner.portalActive) {
      return NextResponse.json(
        { error: "Portal nao ativado" },
        { status: 403 }
      );
    }

    // Se ja tem senha, exigir a atual
    if (owner.portalPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Senha atual eh obrigatoria" },
          { status: 400 }
        );
      }
      const validCurrent = await bcrypt.compare(currentPassword, owner.portalPassword);
      if (!validCurrent) {
        return NextResponse.json(
          { error: "Senha atual incorreta" },
          { status: 401 }
        );
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.owner.update({
      where: { id: auth.ownerId },
      data: { portalPassword: hash },
    });

    return NextResponse.json({
      success: true,
      message: owner.portalPassword
        ? "Senha alterada com sucesso"
        : "Senha definida com sucesso",
    });
  } catch (error) {
    console.error("[Portal Password]", error);
    return NextResponse.json(
      { error: "Erro ao processar senha" },
      { status: 500 }
    );
  }
}
