import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin, getUserAllowedPages } from "@/lib/rbac";

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions?: string | null;
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

/**
 * Verifica se o usuario tem permissao para uma pagina especifica.
 * Aplicado em APIs que mutam dados (POST/PUT/DELETE) para garantir que
 * usuarios sem acesso a pagina nao consigam burlar via chamada direta a API.
 *
 * Regras:
 * - ADMIN sempre passa
 * - Senao: usa getUserAllowedPages para checar se pageKey esta na lista
 *   (considera customPermissions OU defaults do role)
 *
 * Uso:
 *   const auth = await requirePagePermission("contratos");
 *   if (isAuthError(auth)) return auth;
 */
export async function requirePagePermission(
  pageKey: string
): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  const role = result.user.role;
  if (isAdmin(role)) return result; // admin sempre passa

  const allowed = getUserAllowedPages(role, result.user.permissions ?? null);
  if (!allowed.includes(pageKey)) {
    return NextResponse.json(
      {
        error: `Voce nao tem permissao para acessar essa funcionalidade (${pageKey}). Solicite ao administrador.`,
      },
      { status: 403 }
    );
  }

  return result;
}
