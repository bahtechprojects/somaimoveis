import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-duplicate-credits
 * Lista créditos IPTU/CONDOMINIO duplicados para o mesmo proprietário/contrato/mês.
 *
 * POST /api/audit/fix-duplicate-credits
 * Cancela as duplicatas, mantendo apenas a entry correta (com split %).
 */

function monthKey(date: Date | null): string {
  if (!date) return "sem-data";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const entries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
      },
      orderBy: { createdAt: "asc" },
    });

    // Agrupar por owner + contract + mês + categoria
    const groups: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const key = `${entry.ownerId}_${entry.contractId || "none"}_${monthKey(entry.dueDate)}_${entry.category}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }

    const duplicates = [];
    for (const [key, group] of Object.entries(groups)) {
      if (group.length <= 1) continue;

      // Se tem entries com e sem (%), a sem % é a duplicata do backfill
      const withPct = group.filter(e => /\(\d+(?:[.,]\d+)?%\)/.test(e.description));
      const withoutPct = group.filter(e => !/\(\d+(?:[.,]\d+)?%\)/.test(e.description));

      if (withPct.length > 0 && withoutPct.length > 0) {
        // Manter as com %, marcar as sem % como duplicatas
        for (const dup of withoutPct) {
          duplicates.push({
            id: dup.id,
            description: dup.description,
            value: dup.value,
            dueDate: dup.dueDate,
            ownerId: dup.ownerId,
            reason: "Duplicata sem split % (backfill criou antes do billing)",
            keepEntries: withPct.map(e => ({ id: e.id, description: e.description, value: e.value })),
          });
        }
      } else if (withoutPct.length > 1) {
        // Múltiplas entries sem % - manter a primeira, remover as demais
        for (let i = 1; i < withoutPct.length; i++) {
          duplicates.push({
            id: withoutPct[i].id,
            description: withoutPct[i].description,
            value: withoutPct[i].value,
            dueDate: withoutPct[i].dueDate,
            ownerId: withoutPct[i].ownerId,
            reason: "Duplicata (múltiplas entries sem %)",
            keepEntries: [{ id: withoutPct[0].id, description: withoutPct[0].description, value: withoutPct[0].value }],
          });
        }
      }
    }

    return NextResponse.json({
      totalEntries: entries.length,
      duplicates: duplicates.length,
      entries: duplicates,
    });
  } catch (error) {
    console.error("[fix-duplicate-credits GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const entries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
      },
      orderBy: { createdAt: "asc" },
    });

    const groups: Record<string, typeof entries> = {};
    for (const entry of entries) {
      const key = `${entry.ownerId}_${entry.contractId || "none"}_${monthKey(entry.dueDate)}_${entry.category}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }

    let cancelled = 0;
    const errors: string[] = [];

    for (const [, group] of Object.entries(groups)) {
      if (group.length <= 1) continue;

      const withPct = group.filter(e => /\(\d+(?:[.,]\d+)?%\)/.test(e.description));
      const withoutPct = group.filter(e => !/\(\d+(?:[.,]\d+)?%\)/.test(e.description));

      let toCancelIds: string[] = [];

      if (withPct.length > 0 && withoutPct.length > 0) {
        toCancelIds = withoutPct.map(e => e.id);
      } else if (withoutPct.length > 1) {
        toCancelIds = withoutPct.slice(1).map(e => e.id);
      }

      if (toCancelIds.length > 0) {
        try {
          await prisma.ownerEntry.updateMany({
            where: { id: { in: toCancelIds } },
            data: { status: "CANCELADO" },
          });
          cancelled += toCancelIds.length;
        } catch (err) {
          errors.push(`${toCancelIds.join(",")}: ${err instanceof Error ? err.message : "?"}`);
        }
      }
    }

    return NextResponse.json({
      cancelled,
      errors,
      message: `${cancelled} duplicata(s) cancelada(s). ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-duplicate-credits POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

/**
 * PUT /api/audit/fix-duplicate-credits
 * DESFAZER: Restaura TODOS os créditos IPTU/CONDOMINIO que foram cancelados.
 * Útil para reverter cancelamentos incorretos do POST.
 */
export async function PUT() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const cancelled = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: "CANCELADO",
      },
    });

    let restored = 0;
    for (const entry of cancelled) {
      await prisma.ownerEntry.update({
        where: { id: entry.id },
        data: { status: "PENDENTE" },
      });
      restored++;
    }

    return NextResponse.json({
      restored,
      message: `${restored} crédito(s) IPTU/CONDOMINIO restaurado(s) de CANCELADO para PENDENTE.`,
    });
  } catch (error) {
    console.error("[fix-duplicate-credits PUT]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
