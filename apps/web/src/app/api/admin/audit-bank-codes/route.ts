import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/api-auth";
import { resolveBankCode } from "@/lib/bank-codes";

/**
 * GET /api/admin/audit-bank-codes
 *
 * Lista owners cujo `bankName` (ou `thirdPartyBank`) NAO pode ser
 * resolvido pra um codigo COMPE de 3 digitos.
 *
 * Causa raiz: campo "Banco" no cadastro de proprietario e texto
 * livre. Admin digita "Banco do Brasil", "Sicredi", "Itaú" — mas
 * Sicredi exige codigo COMPE no CNAB ("001", "748", "341"). Quando
 * nao resolve, o CNAB grava "000" e Sicredi rejeita com "AZ: codigo
 * de banco depositario invalido".
 *
 * Use pra detectar owners afetados antes de gerar CNAB.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const owners = await prisma.owner.findMany({
      select: {
        id: true,
        name: true,
        bankName: true,
        bankAgency: true,
        bankAccount: true,
        bankPix: true,
        bankPixType: true,
        thirdPartyName: true,
        thirdPartyBank: true,
        thirdPartyAgency: true,
        thirdPartyAccount: true,
        thirdPartyPix: true,
        thirdPartyPixKeyType: true,
      },
    });

    const invalidos: {
      ownerId: string;
      name: string;
      campo: "bankName" | "thirdPartyBank";
      valorAtual: string | null;
      usaTed: boolean;
      sugestao?: string;
    }[] = [];

    for (const o of owners) {
      const useThird = !!o.thirdPartyName;
      const bancoRaw = useThird ? o.thirdPartyBank : o.bankName;
      const code = resolveBankCode(bancoRaw);
      if (code) continue;

      // Se o owner so usa PIX por chave (CPF/CNPJ/Email/Telefone/Aleatoria),
      // o banco e ignorado pelo Sicredi. So reporta se tem dados bancarios
      // (agencia/conta) — sinal de TED ou PIX por dados bancarios.
      const agencia = useThird ? o.thirdPartyAgency : o.bankAgency;
      const conta = useThird ? o.thirdPartyAccount : o.bankAccount;
      const temDadosBancarios = !!(agencia && conta);

      if (!temDadosBancarios) continue; // PIX puro, banco nao usado

      invalidos.push({
        ownerId: o.id,
        name: o.name,
        campo: useThird ? "thirdPartyBank" : "bankName",
        valorAtual: bancoRaw,
        usaTed: temDadosBancarios,
      });
    }

    return NextResponse.json({
      total: invalidos.length,
      invalidos,
      dica: "Cadastre o codigo COMPE (3 digitos) ou o nome exato (Sicredi, Banco do Brasil, etc).",
    });
  } catch (error) {
    console.error("[audit-bank-codes] Erro:", error);
    return NextResponse.json(
      { error: "Erro", details: error instanceof Error ? error.message : "desconhecido" },
      { status: 500 }
    );
  }
}
