import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/api-auth";
import { consolidateIRRFByOwnerMonth } from "@/lib/fiscal-consolidate";

/**
 * POST /api/admin/migrate-irrf
 *
 * Reconsolida o IRRF para TODOS os meses que tem Payments cadastrados, em
 * batch. Isso e a forma de migrar dados gerados antes da consolidacao por
 * CPF/mes (Fase 2 do plano IRRF) — a funcao e idempotente, entao rodar
 * sobre meses ja consolidados nao causa efeito.
 *
 * Body: { dryRun?: boolean, fromMonth?: "YYYY-MM", toMonth?: "YYYY-MM" }
 *
 * Recomendado:
 *   1. Rodar com dryRun=true para ver quantos grupos serao afetados
 *   2. Conferir 1 ou 2 meses no audit-irrf antes
 *   3. Rodar com dryRun=false
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const fromMonth: string | undefined = body.fromMonth;
    const toMonth: string | undefined = body.toMonth;

    // Descobrir todos os meses com Payments. Em SQLite o groupBy nativo do
    // Prisma sobre date com truncamento de mes e chato — fazemos manual.
    const allDates = await prisma.payment.findMany({
      where: { status: { not: "CANCELADO" } },
      select: { dueDate: true },
    });

    const monthsSet = new Set<string>();
    for (const p of allDates) {
      const d = p.dueDate;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthsSet.add(key);
    }

    let months = [...monthsSet].sort();
    if (fromMonth && /^\d{4}-\d{2}$/.test(fromMonth)) months = months.filter((m) => m >= fromMonth);
    if (toMonth && /^\d{4}-\d{2}$/.test(toMonth)) months = months.filter((m) => m <= toMonth);

    const results: {
      month: string;
      grupos: number;
      pagamentos: number;
      irrfTotal: number;
    }[] = [];
    let totalIrrf = 0;
    let totalGroups = 0;
    let totalPayments = 0;

    for (const m of months) {
      const [y, mm] = m.split("-").map(Number);
      const refMonth = new Date(y, mm - 1, 1);
      const report = await consolidateIRRFByOwnerMonth(prisma, { refMonth, dryRun });
      results.push({
        month: m,
        grupos: report.totalGroups,
        pagamentos: report.totalPayments,
        irrfTotal: report.totalIrrf,
      });
      totalIrrf += report.totalIrrf;
      totalGroups += report.totalGroups;
      totalPayments += report.totalPayments;
    }

    return NextResponse.json({
      dryRun,
      monthsProcessed: months.length,
      totalGroups,
      totalPayments,
      totalIrrf: Math.round(totalIrrf * 100) / 100,
      results,
    });
  } catch (error) {
    console.error("[migrate-irrf] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao migrar IRRF", details: error instanceof Error ? error.message : "desconhecido" },
      { status: 500 }
    );
  }
}
