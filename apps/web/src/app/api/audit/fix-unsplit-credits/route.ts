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
    // Buscar TUDO (incluindo CANCELADO para restaurar)
    const allEntries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
      },
      orderBy: { dueDate: "asc" },
    });

    // PASSO 1: Restaurar cancelados com tenantEntryId
    let restored = 0;
    for (const entry of allEntries) {
      if (entry.status !== "CANCELADO") continue;
      if (entry.notes) {
        try {
          const n = JSON.parse(entry.notes);
          if (n.tenantEntryId) {
            await prisma.ownerEntry.update({
              where: { id: entry.id },
              data: { status: "PENDENTE" },
            });
            entry.status = "PENDENTE"; // atualizar em memória
            restored++;
          }
        } catch {}
      }
    }

    // Filtrar ativos
    const activeEntries = allEntries.filter(e => e.status !== "CANCELADO");

    // PropertyOwner
    const propertyIds = [...new Set(activeEntries.map(e => e.propertyId).filter(Boolean))] as string[];
    const allShares = await prisma.propertyOwner.findMany({
      where: { propertyId: { in: propertyIds } },
    });
    const sharesByProperty: Record<string, typeof allShares> = {};
    for (const s of allShares) {
      if (!sharesByProperty[s.propertyId]) sharesByProperty[s.propertyId] = [];
      sharesByProperty[s.propertyId].push(s);
    }

    // Entries sem (%) em imóveis com co-proprietários
    const unsplitEntries = activeEntries.filter(e =>
      !/\(\d+(?:[.,]\d+)?%\)/.test(e.description) &&
      e.propertyId &&
      sharesByProperty[e.propertyId]?.length > 0
    );

    let updated = 0;
    let created = 0;
    const errors: string[] = [];
    const debug: string[] = [];

    debug.push(`activeEntries: ${activeEntries.length}, propertyIds: ${propertyIds.length}, sharesFound: ${allShares.length}, unsplitEntries: ${unsplitEntries.length}`);

    for (const entry of unsplitEntries) {
      const shares = sharesByProperty[entry.propertyId!];
      const totalSharePct = shares.reduce((s, sh) => s + sh.percentage, 0);

      // Determinar a % deste owner
      const ownerShare = shares.find(s => s.ownerId === entry.ownerId);
      let ownerPct: number;
      if (ownerShare) {
        ownerPct = ownerShare.percentage;
      } else if (totalSharePct < 100) {
        ownerPct = Math.round((100 - totalSharePct) * 100) / 100;
      } else {
        ownerPct = Math.round((100 / (shares.length + 1)) * 100) / 100;
      }

      const originalValue = entry.value;
      const correctedValue = Math.round(originalValue * (ownerPct / 100) * 100) / 100;

      debug.push(`${entry.description} val=${originalValue} pct=${ownerPct} → ${correctedValue}`);

      // Atualizar entry
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

      // Criar entries faltantes para co-owners
      for (const share of shares) {
        if (share.ownerId === entry.ownerId) continue;

        // Verificar se já existe
        const alreadyExists = activeEntries.some(e =>
          e.ownerId === share.ownerId &&
          e.contractId === entry.contractId &&
          e.category === entry.category &&
          e.propertyId === entry.propertyId &&
          e.dueDate?.getTime() === entry.dueDate?.getTime()
        );
        if (alreadyExists) continue;

        const portion = Math.round(originalValue * (share.percentage / 100) * 100) / 100;
        try {
          await prisma.ownerEntry.create({
            data: {
              type: "CREDITO",
              category: entry.category,
              description: `${entry.description} (${share.percentage}%)`,
              value: portion,
              dueDate: entry.dueDate,
              status: "PENDENTE",
              ownerId: share.ownerId,
              contractId: entry.contractId,
              propertyId: entry.propertyId,
              notes: JSON.stringify({
                createdFromSplit: entry.id,
                splitPercent: share.percentage,
              }),
            },
          });
          created++;
        } catch (err) {
          errors.push(`create: ${err instanceof Error ? err.message : "?"}`);
        }
      }
    }

    return NextResponse.json({
      restored,
      updated,
      created,
      errors,
      debug,
      message: `${restored} restaurado(s), ${updated} corrigido(s), ${created} criado(s). ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-unsplit-credits POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

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
