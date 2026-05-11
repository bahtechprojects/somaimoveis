import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/admin/revert-batch-pago
 *
 * Reverte OwnerEntries marcadas como PAGO recentemente (PAGO -> PENDENTE).
 * Util quando o admin gerou CNAB com sequencial errado e clicou OK no
 * confirm "marcar como pago" — agora quer voltar atras pra refazer.
 *
 * Body: {
 *   minutesAgo?: number,    // padrao 60 - reverte PAGOs marcados nos ultimos N minutos
 *   month?: "YYYY-MM",      // limita ao mes (default: nao filtra mes)
 *   ownerIds?: string[],    // limita aos owners
 *   dryRun?: boolean        // default false
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const minutesAgo = typeof body.minutesAgo === "number" && body.minutesAgo > 0
      ? body.minutesAgo
      : 60;
    const monthStr = typeof body.month === "string" ? body.month : null;
    const ownerIds: string[] | undefined = Array.isArray(body.ownerIds) && body.ownerIds.length > 0
      ? body.ownerIds.filter((s: unknown) => typeof s === "string")
      : undefined;
    const dryRun = body.dryRun === true;

    const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000);

    const where: Record<string, unknown> = {
      status: "PAGO",
      paidAt: { gte: cutoff },
    };
    if (ownerIds && ownerIds.length > 0) {
      where.ownerId = { in: ownerIds };
    }
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      where.dueDate = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    }

    const candidates = await prisma.ownerEntry.findMany({
      where,
      select: {
        id: true,
        type: true,
        category: true,
        description: true,
        value: true,
        paidAt: true,
        ownerId: true,
      },
      orderBy: { paidAt: "desc" },
    });

    if (!dryRun && candidates.length > 0) {
      await prisma.ownerEntry.updateMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        data: { status: "PENDENTE", paidAt: null },
      });
    }

    return NextResponse.json({
      mode: dryRun ? "DRY_RUN" : "APPLIED",
      cutoff: cutoff.toISOString(),
      total: candidates.length,
      creditos: candidates.filter((c) => c.type === "CREDITO").length,
      debitos: candidates.filter((c) => c.type === "DEBITO").length,
      somaValor: Math.round(candidates.reduce((s, c) => s + c.value, 0) * 100) / 100,
      sample: candidates.slice(0, 20).map((c) => ({
        type: c.type,
        cat: c.category,
        desc: c.description,
        value: c.value,
        paidAt: c.paidAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[revert-batch-pago] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao reverter", details: error instanceof Error ? error.message : "desconhecido" },
      { status: 500 }
    );
  }
}
