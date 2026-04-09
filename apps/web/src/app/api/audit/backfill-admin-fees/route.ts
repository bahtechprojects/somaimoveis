import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/backfill-admin-fees
 * Lista REPASSE entries que NÃO têm info de taxa administrativa no campo notes.
 *
 * POST /api/audit/backfill-admin-fees
 * Atualiza o campo notes com dados da taxa adm baseado no contrato vinculado.
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const repasseEntries = await prisma.ownerEntry.findMany({
    where: {
      type: "CREDITO",
      category: { in: ["REPASSE", "GARANTIA"] },
      status: { not: "CANCELADO" },
    },
    orderBy: { createdAt: "desc" },
  });

  const missing = [];
  const alreadyOk = [];

  for (const entry of repasseEntries) {
    let hasAdminFee = false;
    if (entry.notes) {
      try {
        const n = JSON.parse(entry.notes);
        if (n.adminFeePercent !== undefined && n.adminFeeValue !== undefined) {
          hasAdminFee = true;
        }
      } catch {}
    }

    if (hasAdminFee) {
      alreadyOk.push(entry.id);
    } else {
      missing.push({
        id: entry.id,
        category: entry.category,
        description: entry.description,
        value: entry.value,
        dueDate: entry.dueDate,
        contractId: entry.contractId,
        ownerId: entry.ownerId,
        notes: entry.notes,
      });
    }
  }

  return NextResponse.json({
    total: repasseEntries.length,
    missing: missing.length,
    alreadyOk: alreadyOk.length,
    entries: missing,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const forceRecalc = body.force === true; // force=true recalcula TODOS

  const repasseEntries = await prisma.ownerEntry.findMany({
    where: {
      type: "CREDITO",
      category: { in: ["REPASSE", "GARANTIA"] },
      status: { not: "CANCELADO" },
    },
  });

  // Cache de contratos para evitar queries repetidas
  const contractCache: Record<string, { rentalValue: number; adminFeePercent: number } | null> = {};

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of repasseEntries) {
    let existingNotes: Record<string, unknown> = {};
    if (entry.notes) {
      try {
        existingNotes = JSON.parse(entry.notes);
      } catch {}
    }

    // Se não é force e já tem admin fee, pular
    if (!forceRecalc && existingNotes.adminFeePercent !== undefined && existingNotes.adminFeeValue !== undefined) {
      skipped++;
      continue;
    }

    // Buscar contrato para obter taxa adm %
    const cacheKey = entry.contractId || `owner-${entry.ownerId}-${entry.propertyId}`;
    if (!(cacheKey in contractCache)) {
      let contract: { rentalValue: number; adminFeePercent: number } | null = null;
      if (entry.contractId) {
        contract = await prisma.contract.findUnique({
          where: { id: entry.contractId },
          select: { rentalValue: true, adminFeePercent: true },
        });
      }
      if (!contract && entry.ownerId) {
        const contracts = await prisma.contract.findMany({
          where: {
            ownerId: entry.ownerId,
            status: "ATIVO",
            ...(entry.propertyId ? { propertyId: entry.propertyId } : {}),
          },
          select: { rentalValue: true, adminFeePercent: true },
          take: 1,
        });
        if (contracts.length > 0) contract = contracts[0];
      }
      contractCache[cacheKey] = contract;
    }

    const contract = contractCache[cacheKey];
    if (!contract) {
      errors.push(`${entry.id}: sem contrato encontrado`);
      continue;
    }

    const adminFeePercent = contract.adminFeePercent || 10;

    // Detectar sharePercent da descrição (co-proprietários)
    const pctMatch = entry.description.match(/\((\d+(?:[.,]\d+)?)%\)/);
    const sharePercent = pctMatch ? parseFloat(pctMatch[1].replace(",", ".")) : undefined;

    // Calcular aluguel bruto REVERSO a partir do entry.value (respeita pro-rata)
    // entry.value = aluguelBruto * (1 - adminFee/100) * (sharePercent/100)
    const adminPct = adminFeePercent / 100;
    const shareFactor = sharePercent ? sharePercent / 100 : 1;
    const aluguelBruto = Math.round(entry.value / ((1 - adminPct) * shareFactor) * 100) / 100;
    const adminFeeValue = Math.round(aluguelBruto * adminPct * 100) / 100;

    const newNotes = {
      ...existingNotes,
      aluguelBruto,
      adminFeePercent,
      adminFeeValue,
      sharePercent,
      netToOwner: entry.value,
      backfilledAdminFeeAt: new Date().toISOString(),
    };

    try {
      await prisma.ownerEntry.update({
        where: { id: entry.id },
        data: { notes: JSON.stringify(newNotes) },
      });
      updated++;
    } catch (err) {
      errors.push(`${entry.id}: ${err instanceof Error ? err.message : "?"}`);
    }
  }

  return NextResponse.json({
    updated,
    skipped,
    errors,
    message: `${updated} repasse(s) atualizado(s). ${skipped} já estavam ok. ${errors.length} erro(s).`,
  });
}
