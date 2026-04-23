import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signPortalToken } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, cpfCnpj, token, password } = body;

    if (!token && !password) {
      return NextResponse.json(
        { error: "Token ou senha é obrigatório" },
        { status: 400 }
      );
    }

    if (!email && !cpfCnpj) {
      return NextResponse.json(
        { error: "Email ou CPF/CNPJ é obrigatório" },
        { status: 400 }
      );
    }

    // Buscar proprietario por email ou cpfCnpj com portal ativo
    const whereConditions: Record<string, unknown>[] = [];
    if (email) whereConditions.push({ email, portalActive: true });
    if (cpfCnpj) whereConditions.push({ cpfCnpj, portalActive: true });

    const owner = await prisma.owner.findFirst({
      where: { OR: whereConditions },
      select: {
        id: true,
        name: true,
        email: true,
        portalActive: true,
        portalToken: true,
        portalPassword: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Credenciais invalidas ou portal nao ativado" },
        { status: 401 }
      );
    }

    // Validar: senha tem prioridade sobre token (se o proprietario ja definiu senha)
    let authenticated = false;
    let usedToken = false;
    if (password && owner.portalPassword) {
      authenticated = await bcrypt.compare(password, owner.portalPassword);
    } else if (token && owner.portalToken === token) {
      authenticated = true;
      usedToken = true;
    } else if (password && !owner.portalPassword && owner.portalToken === password) {
      // Fallback: se o proprietario digitou o token no campo de senha
      authenticated = true;
      usedToken = true;
    }

    if (!authenticated) {
      return NextResponse.json(
        { error: "Credenciais invalidas" },
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
      // Sinaliza se o usuario precisa definir senha (entrou com token e ainda nao tem senha)
      mustSetPassword: usedToken && !owner.portalPassword,
    });
  } catch (error) {
    console.error("Erro na autenticacao do portal:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar autenticacao" },
      { status: 500 }
    );
  }
}
