import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signPortalToken } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, cpfCnpj, token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Token de acesso e obrigatorio" },
        { status: 400 }
      );
    }

    if (!email && !cpfCnpj) {
      return NextResponse.json(
        { error: "Email ou CPF/CNPJ e obrigatorio" },
        { status: 400 }
      );
    }

    // Buscar proprietario por email ou cpfCnpj com token valido e portal ativo
    const whereConditions: Record<string, unknown>[] = [];

    if (email) {
      whereConditions.push({
        email,
        portalToken: token,
        portalActive: true,
      });
    }

    if (cpfCnpj) {
      whereConditions.push({
        cpfCnpj,
        portalToken: token,
        portalActive: true,
      });
    }

    const owner = await prisma.owner.findFirst({
      where: {
        OR: whereConditions,
      },
      select: {
        id: true,
        name: true,
        email: true,
        portalActive: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Credenciais invalidas ou portal nao ativado" },
        { status: 401 }
      );
    }

    // Gerar JWT do portal
    const jwt = await signPortalToken({
      ownerId: owner.id,
      ownerName: owner.name,
    });

    return NextResponse.json({
      token: jwt,
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
      },
    });
  } catch (error) {
    console.error("Erro na autenticacao do portal:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar autenticacao" },
      { status: 500 }
    );
  }
}
