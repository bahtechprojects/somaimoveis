import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/api-auth";
import { consolidateIRRFByOwnerMonth } from "@/lib/fiscal-consolidate";

/**
 * POST /api/billing/consolidate-irrf
 * Body: { refMonth: "YYYY-MM", dryRun?: boolean, ownerCpfCnpj?: string }
 *
 * Agrupa Payments do mes alvo por CPF de proprietario (PF + locatario PJ),
 * aplica a tabela progressiva do IRRF sobre a soma de cada CPF e distribui
 * proporcionalmente o imposto retido entre os boletos. Idempotente.
 *
 * Use dryRun=true para gerar relatorio sem escrever no banco.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const refMonthStr = String(body.refMonth || "");
    if (!/^\d{4}-\d{2}$/.test(refMonthStr)) {
      return NextResponse.json(
        { error: "refMonth obrigatorio no formato YYYY-MM" },
        { status: 400 }
      );
    }
    const [y, m] = refMonthStr.split("-").map(Number);
    const refMonth = new Date(y, m - 1, 1);

    const dryRun = body.dryRun === true;
    const ownerCpfCnpj = body.ownerCpfCnpj ? String(body.ownerCpfCnpj) : undefined;

    const report = await consolidateIRRFByOwnerMonth(prisma, {
      refMonth,
      dryRun,
      ownerCpfCnpj,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("[consolidate-irrf] Erro:", error);
    return NextResponse.json(
      {
        error: "Erro ao consolidar IRRF",
        details: error instanceof Error ? error.message : "desconhecido",
      },
      { status: 500 }
    );
  }
}
