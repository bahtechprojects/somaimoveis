import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/relatorios/reajustes?month=YYYY-MM
 * Lista contratos ativos cujo aniversario de reajuste cai no mes alvo.
 *
 * Regra: o "aniversario" eh o mes/dia do startDate (ou lastAdjustmentDate se houver),
 * considerando que reajuste eh anual.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    let targetYear: number, targetMonth: number;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
    }

    const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    // Buscar todos os contratos ativos
    const contracts = await prisma.contract.findMany({
      where: {
        status: { in: ["ATIVO", "PENDENTE_RENOVACAO"] },
      },
      include: {
        owner: { select: { id: true, name: true, cpfCnpj: true } },
        tenant: { select: { id: true, name: true, cpfCnpj: true } },
        property: { select: { id: true, title: true } },
      },
      orderBy: { startDate: "asc" },
    });

    // Filtrar os que fazem aniversario no mes alvo
    // Prioridade: lastAdjustmentDate > startDate
    const rows = contracts
      .map((c) => {
        const reference = c.lastAdjustmentDate || c.startDate;
        const refDate = new Date(reference);
        const refMonth = refDate.getMonth();
        // Considerar adjustmentMonth se configurado no contrato
        const adjustmentMonthField = (c as any).adjustmentMonth as number | null | undefined;

        // O mes efetivo do aniversario
        const effectiveMonth =
          typeof adjustmentMonthField === "number" && adjustmentMonthField >= 1 && adjustmentMonthField <= 12
            ? adjustmentMonthField - 1
            : refMonth;

        if (effectiveMonth !== targetMonth) return null;

        // Calcular data de aniversario no ano alvo
        const aniversarioDate = new Date(targetYear, targetMonth, refDate.getDate(), 12, 0, 0);

        // Tempo desde ultimo reajuste
        const mesesDesdeUltimoReajuste = c.lastAdjustmentDate
          ? Math.round(
              (aniversarioDate.getTime() - new Date(c.lastAdjustmentDate).getTime()) /
                (1000 * 60 * 60 * 24 * 30)
            )
          : Math.round(
              (aniversarioDate.getTime() - new Date(c.startDate).getTime()) /
                (1000 * 60 * 60 * 24 * 30)
            );

        // So considerar se passou pelo menos 11 meses desde o ultimo
        if (mesesDesdeUltimoReajuste < 11) return null;

        return {
          contractId: c.id,
          code: c.code,
          status: c.status,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate?.toISOString() || null,
          aniversarioDate: aniversarioDate.toISOString(),
          lastAdjustmentDate: c.lastAdjustmentDate?.toISOString() || null,
          lastAdjustmentPercent: c.lastAdjustmentPercent || null,
          adjustmentIndex: c.adjustmentIndex || null,
          mesesDesdeUltimoReajuste,
          rentalValue: c.rentalValue,
          property: c.property,
          owner: c.owner,
          tenant: c.tenant,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totais = {
      total: rows.length,
      totalAluguelAtual: round2(rows.reduce((s, r) => s + r.rentalValue, 0)),
    };

    return NextResponse.json({
      month: mLabel,
      totais,
      reajustes: rows,
    });
  } catch (error) {
    console.error("[Reajustes]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
