import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/contracts/[id]/apply-adjustment
 * Aplica reajuste no contrato:
 * - Multiplica rentalValue por (1 + percent/100)
 * - Atualiza lastAdjustmentDate para hoje
 * - Salva lastAdjustmentPercent
 *
 * Body: { percent: number, applyDate?: string (YYYY-MM-DD) }
 *
 * - Aceita percent ZERO (deflacao/IGPM negativo: aluguel mantem)
 * - Aceita percent negativo (deflacao real)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { percent, applyDate } = body;

    if (percent == null || isNaN(parseFloat(percent))) {
      return NextResponse.json(
        { error: "Percentual eh obrigatorio (pode ser 0 para deflacao)" },
        { status: 400 }
      );
    }

    const pct = parseFloat(percent);
    if (pct < -50 || pct > 100) {
      return NextResponse.json(
        { error: "Percentual fora do intervalo razoavel (-50% a 100%)" },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      select: { id: true, code: true, rentalValue: true, status: true },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contrato nao encontrado" }, { status: 404 });
    }

    const oldValue = contract.rentalValue;
    // pct = 0 → aluguel mantem (multiplicador 1)
    // pct = 5 → aluguel * 1.05
    // pct = -3 → aluguel * 0.97
    const multiplier = 1 + pct / 100;
    const newValue = Math.round(oldValue * multiplier * 100) / 100;

    const adjustDate = applyDate
      ? new Date(`${applyDate}T12:00:00`)
      : new Date();

    const updated = await prisma.contract.update({
      where: { id },
      data: {
        rentalValue: newValue,
        lastAdjustmentDate: adjustDate,
        lastAdjustmentPercent: pct,
      },
      select: {
        id: true,
        code: true,
        rentalValue: true,
        lastAdjustmentDate: true,
        lastAdjustmentPercent: true,
      },
    });

    return NextResponse.json({
      contract: updated,
      adjustment: {
        oldValue,
        newValue,
        percent: pct,
        delta: Math.round((newValue - oldValue) * 100) / 100,
      },
      mensagem:
        pct === 0
          ? `Reajuste 0% aplicado: aluguel mantido em R$ ${oldValue.toFixed(2)} (${updated.code})`
          : pct > 0
          ? `Reajuste de +${pct}% aplicado: R$ ${oldValue.toFixed(2)} → R$ ${newValue.toFixed(2)}`
          : `Reajuste (deflacao) de ${pct}% aplicado: R$ ${oldValue.toFixed(2)} → R$ ${newValue.toFixed(2)}`,
    });
  } catch (error: any) {
    console.error("[Apply Adjustment]", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Contrato nao encontrado" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error?.message || "Erro ao aplicar reajuste" },
      { status: 500 }
    );
  }
}
