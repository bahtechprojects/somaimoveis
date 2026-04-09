import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-unsplit-credits
 * Lista créditos IPTU/CONDOMINIO sem split (%) em imóveis com co-proprietários.
 *
 * POST /api/audit/fix-unsplit-credits
 * Corrige: ajusta o valor para a porcentagem do proprietário e adiciona (%) na descrição.
 * Cria entries faltantes para os outros co-proprietários.
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // Entries de crédito IPTU/CONDOMINIO sem (%) na descrição
    const entries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
        propertyId: { not: null },
      },
      orderBy: { dueDate: "asc" },
    });

    const unsplitEntries = entries.filter(e => !/\(\d+(?:[.,]\d+)?%\)/.test(e.description));

    // Buscar PropertyOwner para cada imóvel
    const propertyIds = [...new Set(unsplitEntries.map(e => e.propertyId).filter(Boolean))] as string[];
    const allShares = await prisma.propertyOwner.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { owner: { select: { name: true } } },
    });
    const sharesByProperty: Record<string, typeof allShares> = {};
    for (const s of allShares) {
      if (!sharesByProperty[s.propertyId]) sharesByProperty[s.propertyId] = [];
      sharesByProperty[s.propertyId].push(s);
    }

    // Buscar contratos para saber o ownerId principal
    const contractIds = [...new Set(unsplitEntries.map(e => e.contractId).filter(Boolean))] as string[];
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, ownerId: true, propertyId: true },
    });
    const contractMap: Record<string, typeof contracts[0]> = {};
    for (const c of contracts) contractMap[c.id] = c;

    const problems = [];

    for (const entry of unsplitEntries) {
      if (!entry.propertyId) continue;
      const shares = sharesByProperty[entry.propertyId];
      if (!shares || shares.length === 0) continue; // Sem co-proprietários, ok

      // Achar a porcentagem deste proprietário
      const ownerShare = shares.find(s => s.ownerId === entry.ownerId);

      // Se não está no PropertyOwner, pode ser o proprietário principal (restante)
      const contract = entry.contractId ? contractMap[entry.contractId] : null;
      const totalSharePct = shares.reduce((s, sh) => s + sh.percentage, 0);

      let ownerPct: number;
      if (ownerShare) {
        ownerPct = ownerShare.percentage;
      } else if (contract && contract.ownerId === entry.ownerId && totalSharePct < 100) {
        ownerPct = Math.round((100 - totalSharePct) * 100) / 100;
      } else {
        continue; // Não conseguimos determinar o %
      }

      const expectedValue = Math.round(entry.value * (ownerPct / 100) * 100) / 100;

      // Verificar quais co-owners estão faltando entries
      const missingOwners = [];
      for (const share of shares) {
        if (share.ownerId === entry.ownerId) continue;
        // Verificar se já existe entry com (%) para este co-owner no mesmo mês/contrato
        const existing = entries.find(e =>
          e.ownerId === share.ownerId &&
          e.contractId === entry.contractId &&
          e.category === entry.category &&
          e.dueDate?.getTime() === entry.dueDate?.getTime() &&
          /\(\d+(?:[.,]\d+)?%\)/.test(e.description)
        );
        if (!existing) {
          missingOwners.push({
            ownerId: share.ownerId,
            ownerName: share.owner.name,
            percentage: share.percentage,
            expectedValue: Math.round(entry.value * (share.percentage / 100) * 100) / 100,
          });
        }
      }

      // Proprietário principal (restante)
      if (contract && totalSharePct < 100) {
        const remainPct = Math.round((100 - totalSharePct) * 100) / 100;
        const isContractOwnerInShares = shares.some(s => s.ownerId === contract.ownerId);
        if (!isContractOwnerInShares && contract.ownerId !== entry.ownerId) {
          const existing = entries.find(e =>
            e.ownerId === contract.ownerId &&
            e.contractId === entry.contractId &&
            e.category === entry.category &&
            e.dueDate?.getTime() === entry.dueDate?.getTime()
          );
          if (!existing) {
            missingOwners.push({
              ownerId: contract.ownerId,
              ownerName: "Proprietário principal",
              percentage: remainPct,
              expectedValue: Math.round(entry.value * (remainPct / 100) * 100) / 100,
            });
          }
        }
      }

      problems.push({
        entryId: entry.id,
        description: entry.description,
        currentValue: entry.value,
        ownerPct,
        correctedValue: expectedValue,
        missingOwners,
      });
    }

    return NextResponse.json({
      totalUnsplit: unsplitEntries.length,
      problems: problems.length,
      entries: problems,
    });
  } catch (error) {
    console.error("[fix-unsplit-credits GET]", error);
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
        propertyId: { not: null },
      },
      orderBy: { dueDate: "asc" },
    });

    const unsplitEntries = entries.filter(e => !/\(\d+(?:[.,]\d+)?%\)/.test(e.description));

    const propertyIds = [...new Set(unsplitEntries.map(e => e.propertyId).filter(Boolean))] as string[];
    const allShares = await prisma.propertyOwner.findMany({
      where: { propertyId: { in: propertyIds } },
    });
    const sharesByProperty: Record<string, typeof allShares> = {};
    for (const s of allShares) {
      if (!sharesByProperty[s.propertyId]) sharesByProperty[s.propertyId] = [];
      sharesByProperty[s.propertyId].push(s);
    }

    const contractIds = [...new Set(unsplitEntries.map(e => e.contractId).filter(Boolean))] as string[];
    const contracts = await prisma.contract.findMany({
      where: { id: { in: contractIds } },
      select: { id: true, ownerId: true, propertyId: true },
    });
    const contractMap: Record<string, typeof contracts[0]> = {};
    for (const c of contracts) contractMap[c.id] = c;

    let updated = 0;
    let created = 0;
    const errors: string[] = [];

    for (const entry of unsplitEntries) {
      if (!entry.propertyId) continue;
      const shares = sharesByProperty[entry.propertyId];
      if (!shares || shares.length === 0) continue;

      const ownerShare = shares.find(s => s.ownerId === entry.ownerId);
      const contract = entry.contractId ? contractMap[entry.contractId] : null;
      const totalSharePct = shares.reduce((s, sh) => s + sh.percentage, 0);

      let ownerPct: number;
      if (ownerShare) {
        ownerPct = ownerShare.percentage;
      } else if (contract && contract.ownerId === entry.ownerId && totalSharePct < 100) {
        ownerPct = Math.round((100 - totalSharePct) * 100) / 100;
      } else {
        continue;
      }

      const originalValue = entry.value;
      const correctedValue = Math.round(originalValue * (ownerPct / 100) * 100) / 100;

      // Atualizar o entry: valor corrigido + adicionar (%) na descrição
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

      // Criar entries faltantes para outros co-owners
      for (const share of shares) {
        if (share.ownerId === entry.ownerId) continue;

        // Verificar se já existe
        const existing = entries.find(e =>
          e.ownerId === share.ownerId &&
          e.contractId === entry.contractId &&
          e.category === entry.category &&
          e.dueDate?.getTime() === entry.dueDate?.getTime() &&
          e.status !== "CANCELADO"
        );
        if (existing) continue;

        const portion = Math.round(originalValue * (share.percentage / 100) * 100) / 100;
        try {
          let baseNotes: Record<string, unknown> = {};
          if (entry.notes) {
            try { baseNotes = JSON.parse(entry.notes); } catch {}
          }

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
                ...baseNotes,
                createdFromSplit: entry.id,
                splitPercent: share.percentage,
                fixedUnsplitAt: new Date().toISOString(),
              }),
            },
          });
          created++;
        } catch (err) {
          errors.push(`create for ${share.ownerId}: ${err instanceof Error ? err.message : "?"}`);
        }
      }

      // Proprietário principal (restante)
      if (contract && totalSharePct < 100) {
        const isContractOwnerInShares = shares.some(s => s.ownerId === contract.ownerId);
        if (!isContractOwnerInShares && contract.ownerId !== entry.ownerId) {
          const existing = entries.find(e =>
            e.ownerId === contract.ownerId &&
            e.contractId === entry.contractId &&
            e.category === entry.category &&
            e.dueDate?.getTime() === entry.dueDate?.getTime() &&
            e.status !== "CANCELADO"
          );
          if (!existing) {
            const remainPct = Math.round((100 - totalSharePct) * 100) / 100;
            const remainVal = Math.round(originalValue * (remainPct / 100) * 100) / 100;
            try {
              await prisma.ownerEntry.create({
                data: {
                  type: "CREDITO",
                  category: entry.category,
                  description: `${entry.description} (${remainPct}%)`,
                  value: remainVal,
                  dueDate: entry.dueDate,
                  status: "PENDENTE",
                  ownerId: contract.ownerId,
                  contractId: entry.contractId,
                  propertyId: entry.propertyId,
                  notes: JSON.stringify({
                    createdFromSplit: entry.id,
                    splitPercent: remainPct,
                    fixedUnsplitAt: new Date().toISOString(),
                  }),
                },
              });
              created++;
            } catch (err) {
              errors.push(`create remaining: ${err instanceof Error ? err.message : "?"}`);
            }
          }
        }
      }
    }

    return NextResponse.json({
      updated,
      created,
      errors,
      message: `${updated} entry(s) corrigido(s), ${created} novo(s) criado(s) para co-proprietários. ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-unsplit-credits POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
