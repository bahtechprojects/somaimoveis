import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-unsplit-credits
 * Diagnóstico: lista créditos IPTU/CONDOMINIO que precisam de correção.
 * Inclui entries canceladas indevidamente e entries sem split correto.
 *
 * POST /api/audit/fix-unsplit-credits
 * Correção completa:
 * 1. Restaura entries CANCELADAS que foram canceladas por fix-duplicate-credits
 * 2. Para cada imóvel com co-proprietários: garante que cada entry tem (X%) e valor proporcional
 * 3. Cria entries faltantes para co-owners que não têm
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // Buscar TODAS entries IPTU/CONDOMINIO (incluindo CANCELADO para restaurar)
    const allEntries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
      },
      orderBy: { dueDate: "asc" },
    });

    // Entries canceladas indevidamente (têm fixedUnsplitAt ou foram canceladas recentemente)
    const cancelledToRestore = allEntries.filter(e => {
      if (e.status !== "CANCELADO") return false;
      // Verificar se foi cancelada pelo fix-duplicate-credits
      // Essas entries não têm (%) na descrição e o status é CANCELADO
      if (e.notes) {
        try {
          const n = JSON.parse(e.notes);
          // Se tem tenantEntryId, é um crédito legítimo que foi cancelado
          if (n.tenantEntryId) return true;
        } catch {}
      }
      return false;
    });

    // Entries ativas sem (%) em imóveis com co-proprietários
    const activeEntries = allEntries.filter(e => e.status !== "CANCELADO");
    const unsplit = activeEntries.filter(e => !/\(\d+(?:[.,]\d+)?%\)/.test(e.description));

    // Buscar PropertyOwner
    const propertyIds = [...new Set(allEntries.map(e => e.propertyId).filter(Boolean))] as string[];
    const allShares = await prisma.propertyOwner.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { owner: { select: { name: true } } },
    });
    const sharesByProperty: Record<string, typeof allShares> = {};
    for (const s of allShares) {
      if (!sharesByProperty[s.propertyId]) sharesByProperty[s.propertyId] = [];
      sharesByProperty[s.propertyId].push(s);
    }

    const unsplitInCoOwnerProps = unsplit.filter(e =>
      e.propertyId && sharesByProperty[e.propertyId]?.length > 0
    );

    return NextResponse.json({
      totalEntries: allEntries.length,
      cancelledToRestore: cancelledToRestore.length,
      unsplitInCoOwnerProperties: unsplitInCoOwnerProps.length,
      cancelledEntries: cancelledToRestore.map(e => ({
        id: e.id, description: e.description, value: e.value, ownerId: e.ownerId,
      })),
      unsplitEntries: unsplitInCoOwnerProps.map(e => ({
        id: e.id, description: e.description, value: e.value, ownerId: e.ownerId,
        propertyShares: sharesByProperty[e.propertyId!]?.map(s => ({
          ownerId: s.ownerId, ownerName: s.owner.name, pct: s.percentage,
        })),
      })),
    });
  } catch (error) {
    console.error("[fix-unsplit-credits GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

function monthKey(date: Date | null): string {
  if (!date) return "sem-data";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // ==========================================
    // PASSO 1: Restaurar entries canceladas indevidamente
    // ==========================================
    const cancelledEntries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: "CANCELADO",
      },
    });

    let restored = 0;
    for (const entry of cancelledEntries) {
      let hasLegitSource = false;
      if (entry.notes) {
        try {
          const n = JSON.parse(entry.notes);
          if (n.tenantEntryId) hasLegitSource = true;
        } catch {}
      }
      if (hasLegitSource) {
        await prisma.ownerEntry.update({
          where: { id: entry.id },
          data: { status: "PENDENTE" },
        });
        restored++;
      }
    }

    // ==========================================
    // PASSO 2: Buscar TODOS os créditos ativos (após restauração)
    // ==========================================
    const allEntries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
      },
      orderBy: { dueDate: "asc" },
    });

    // PropertyOwner e contratos
    const propertyIds = [...new Set(allEntries.map(e => e.propertyId).filter(Boolean))] as string[];
    const allShares = await prisma.propertyOwner.findMany({
      where: { propertyId: { in: propertyIds } },
    });
    const sharesByProperty: Record<string, typeof allShares> = {};
    for (const s of allShares) {
      if (!sharesByProperty[s.propertyId]) sharesByProperty[s.propertyId] = [];
      sharesByProperty[s.propertyId].push(s);
    }

    const contractIds = [...new Set(allEntries.map(e => e.contractId).filter(Boolean))] as string[];
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, ownerId: true, propertyId: true },
    });
    const contractMap: Record<string, typeof contracts[0]> = {};
    for (const c of contracts) contractMap[c.id] = c;

    // ==========================================
    // PASSO 3: Para cada entry sem (%), em imóvel com co-owners:
    // - Ajustar valor para a % do owner
    // - Adicionar (%) na descrição
    // - Criar entries faltantes para outros co-owners
    // ==========================================
    let updated = 0;
    let created = 0;
    const errors: string[] = [];

    // Agrupar entries por owner+contract+month+categoria para detectar o que já existe
    const entryIndex: Record<string, typeof allEntries> = {};
    for (const e of allEntries) {
      const key = `${e.ownerId}_${e.contractId}_${monthKey(e.dueDate)}_${e.category}`;
      if (!entryIndex[key]) entryIndex[key] = [];
      entryIndex[key].push(e);
    }

    // Entries sem (%) em imóveis com co-proprietários
    const unsplitEntries = allEntries.filter(e =>
      !/\(\d+(?:[.,]\d+)?%\)/.test(e.description) &&
      e.propertyId &&
      sharesByProperty[e.propertyId]?.length > 0
    );

    const processedEntryIds = new Set<string>();

    for (const entry of unsplitEntries) {
      if (processedEntryIds.has(entry.id)) continue;
      processedEntryIds.add(entry.id);

      if (!entry.propertyId) continue;
      const shares = sharesByProperty[entry.propertyId];
      if (!shares || shares.length === 0) continue;

      const contract = entry.contractId ? contractMap[entry.contractId] : null;
      const totalSharePct = shares.reduce((s, sh) => s + sh.percentage, 0);

      // Determinar a % deste owner
      const ownerShare = shares.find(s => s.ownerId === entry.ownerId);
      let ownerPct: number;
      if (ownerShare) {
        ownerPct = ownerShare.percentage;
      } else if (contract && contract.ownerId === entry.ownerId && totalSharePct < 100) {
        ownerPct = Math.round((100 - totalSharePct) * 100) / 100;
      } else {
        continue;
      }

      const originalValue = entry.value; // Valor cheio (sem split)
      const correctedValue = Math.round(originalValue * (ownerPct / 100) * 100) / 100;

      // Atualizar este entry com valor corrigido + (%)
      try {
        let existingNotes: Record<string, unknown> = {};
        if (entry.notes) {
          try { existingNotes = JSON.parse(entry.notes); } catch {}
        }

        await prisma.ownerEntry.update({
          where: { id: entry.id },
          data: {
            value: correctedValue,
            description: `${entry.description} (${ownerPct}%)`,
            notes: JSON.stringify({
              ...existingNotes,
              originalValueBeforeSplit: originalValue,
              splitPercent: ownerPct,
              fixedUnsplitAt: new Date().toISOString(),
            }),
          },
        });
        updated++;
      } catch (err) {
        errors.push(`update ${entry.id}: ${err instanceof Error ? err.message : "?"}`);
        continue;
      }

      // Criar entries para co-owners que não têm
      const allOwnersNeedingEntry: { ownerId: string; pct: number }[] = [];
      for (const share of shares) {
        if (share.ownerId === entry.ownerId) continue;
        allOwnersNeedingEntry.push({ ownerId: share.ownerId, pct: share.percentage });
      }
      // Proprietário principal (restante)
      if (contract && totalSharePct < 100) {
        const isContractOwnerInShares = shares.some(s => s.ownerId === contract.ownerId);
        if (!isContractOwnerInShares && contract.ownerId !== entry.ownerId) {
          allOwnersNeedingEntry.push({
            ownerId: contract.ownerId,
            pct: Math.round((100 - totalSharePct) * 100) / 100,
          });
        }
      }

      for (const needed of allOwnersNeedingEntry) {
        // Verificar se já existe entry para este co-owner (com ou sem %)
        const existKey = `${needed.ownerId}_${entry.contractId}_${monthKey(entry.dueDate)}_${entry.category}`;
        const existingEntries = entryIndex[existKey] || [];

        // Se já tem entry com valor proporcional, pular
        const expectedVal = Math.round(originalValue * (needed.pct / 100) * 100) / 100;
        const alreadyHasCorrect = existingEntries.some(e =>
          Math.abs(e.value - expectedVal) < 0.02 ||
          /\(\d+(?:[.,]\d+)?%\)/.test(e.description)
        );
        if (alreadyHasCorrect) continue;

        // Se tem entry sem split com valor cheio, também pular (será corrigida pelo próximo loop)
        const hasUnsplit = existingEntries.some(e =>
          Math.abs(e.value - originalValue) < 0.02 &&
          !/\(\d+(?:[.,]\d+)?%\)/.test(e.description)
        );
        if (hasUnsplit) continue;

        try {
          const newEntry = await prisma.ownerEntry.create({
            data: {
              type: "CREDITO",
              category: entry.category,
              description: `${entry.description} (${needed.pct}%)`,
              value: expectedVal,
              dueDate: entry.dueDate,
              status: "PENDENTE",
              ownerId: needed.ownerId,
              contractId: entry.contractId,
              propertyId: entry.propertyId,
              notes: JSON.stringify({
                createdFromSplit: entry.id,
                splitPercent: needed.pct,
                fixedUnsplitAt: new Date().toISOString(),
              }),
            },
          });
          created++;
          // Adicionar ao index
          if (!entryIndex[existKey]) entryIndex[existKey] = [];
          entryIndex[existKey].push(newEntry);
        } catch (err) {
          errors.push(`create for ${needed.ownerId}: ${err instanceof Error ? err.message : "?"}`);
        }
      }
    }

    return NextResponse.json({
      restored,
      updated,
      created,
      errors,
      message: `${restored} restaurado(s), ${updated} corrigido(s), ${created} criado(s) para co-proprietários. ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-unsplit-credits POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
