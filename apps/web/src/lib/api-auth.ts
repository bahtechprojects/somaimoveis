import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthResult {
  user: SessionUser;
}

/**
 * Verifica se o usuário está autenticado.
 * Retorna o user da sessão ou uma NextResponse de erro (401).
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  return {
    user: session.user as SessionUser,
  };
}

/**
 * Verifica se o usuário é ADMIN.
 * Retorna o user ou NextResponse de erro (401/403).
 */
export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();

  if (result instanceof NextResponse) return result;

  if (result.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  return result;
}

/**
 * Helper para checar se o resultado é um erro (NextResponse)
 */
export function isAuthError(result: AuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
