import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/admin/dedupe-repasses-cross-month?dryRun=true
 *
 * Detecta REPASSEs duplicados onde a descricao tem mes diferente
 * (ex: "04/2026" e "05/2026") mas referem-se ao MESMO Payment.
 *
 * Cenario classico: o sync gera REPASSE pra um Payment que ja tinha
 * REPASSE manual de outro mes — 2 entries pro mesmo pagamento real.
 *
 * Heuristica: agrupa por (ownerId, contractId, value redondo) e detecta
 * pares onde dueDate diferem <= 35 dias. Mantem a entry com:
 *   1. bankConfirmed=true (preferida)
 *   2. paidAt mais recente
 *   3. createdAt mais recente
 *
 * Cancela as outras. Idempotente. Aceita ?dryRun=true (default false).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "true";

    const entries = await prisma.ownerEntry.findMany({
      where: {
        category: { in: ["REPASSE", "GARANTIA"] },
        status: { not: "CANCELADO" },
        contractId: { not: null },
      },
      select: {
        id: true, ownerId: true, contractId: true,
        description: true, value: true, dueDate: true,
        paidAt: true, status: true, notes: true, createdAt: true,
        owner: { select: { name: true } },
      },
    });

    // Agrupa por (ownerId, contractId, value arredondado)
    const groups: Record<string, typeof entries> = {};
    for (const e of entries) {
      const key = `${e.ownerId}|${e.contractId}|${Math.round(e.value)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }

    const toCancel: Array<{
      id: string; ownerName: string; desc: string;
      value: number; dueDate: string | null; status: string;
      keptId: string; keptDesc: string;
    }> = [];

    const MAX_DAYS_DIFF = 35;

    for (const list of Object.values(groups)) {
      if (list.length < 2) continue;
      // Ordena por dueDate asc
      const sorted = [...list].sort((a, b) => {
        const ad = a.dueDate?.getTime() ?? 0;
        const bd = b.dueDate?.getTime() ?? 0;
        return ad - bd;
      });

      // Detecta pares com diff <= MAX_DAYS_DIFF
      const usedIndices = new Set<number>();
      for (let i = 0; i < sorted.length; i++) {
        if (usedIndices.has(i)) continue;
        const grupo = [sorted[i]];
        usedIndices.add(i);
        for (let j = i + 1; j < sorted.length; j++) {
          if (usedIndices.has(j)) continue;
          const diff =
            ((sorted[j].dueDate?.getTime() ?? 0) -
              (sorted[i].dueDate?.getTime() ?? 0)) /
            (24 * 60 * 60 * 1000);
          if (Math.abs(diff) <= MAX_DAYS_DIFF) {
            grupo.push(sorted[j]);
            usedIndices.add(j);
          }
        }
        if (grupo.length < 2) continue;
        // Escolhe quem mantem: bankConfirmed > paidAt desc > createdAt desc
        const ranked = [...grupo].sort((a, b) => {
          const aConf = (() => { try { return JSON.parse(a.notes || "{}").bankConfirmed === true; } catch { return false; } })();
          const bConf = (() => { try { return JSON.parse(b.notes || "{}").bankConfirmed === true; } catch { return false; } })();
          if (aConf && !bConf) return -1;
          if (bConf && !aConf) return 1;
          const aPaid = a.paidAt?.getTime() ?? 0;
          const bPaid = b.paidAt?.getTime() ?? 0;
          if (aPaid !== bPaid) return bPaid - aPaid;
          return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        });
        const keep = ranked[0];
        for (const dup of ranked.slice(1)) {
          toCancel.push({
            id: dup.id,
            ownerName: dup.owner?.name || "?",
            desc: dup.description,
            value: dup.value,
            dueDate: dup.dueDate?.toISOString().slice(0, 10) || null,
            status: dup.status,
            keptId: keep.id,
            keptDesc: keep.description,
          });
        }
      }
    }

    if (!dryRun && toCancel.length > 0) {
      await prisma.ownerEntry.updateMany({
        where: { id: { in: toCancel.map((t) => t.id) } },
        data: { status: "CANCELADO" },
      });
    }

    return NextResponse.json({
      mode: dryRun ? "DRY_RUN" : "APPLIED",
      total: toCancel.length,
      somaValores: Math.round(toCancel.reduce((s, t) => s + t.value, 0) * 100) / 100,
      duplicatas: toCancel.slice(0, 100),
      truncated: toCancel.length > 100,
    });
  } catch (error) {
    console.error("[dedupe-repasses-cross-month] Erro:", error);
    return NextResponse.json(
      { error: "Erro", details: error instanceof Error ? error.message : "desconhecido" },
      { status: 500 }
    );
  }
}
