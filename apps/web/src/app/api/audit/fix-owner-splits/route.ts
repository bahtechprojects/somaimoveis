import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-owner-splits
 * Lista repasses onde co-proprietários estão faltando.
 *
 * POST /api/audit/fix-owner-splits
 * Cria entries faltantes e ajusta valores.
 */

async function findFixes() {
  // Buscar todos os PropertyOwner (imóveis com co-proprietários)
  const allPropertyOwners = await prisma.propertyOwner.findMany({
    include: {
      owner: { select: { id: true, name: true } },
      property: { select: { id: true, title: true } },
    },
  });

  // Agrupar por propertyId
  const sharesByProperty: Record<string, typeof allPropertyOwners> = {};
  for (const po of allPropertyOwners) {
    if (!sharesByProperty[po.propertyId]) sharesByProperty[po.propertyId] = [];
    sharesByProperty[po.propertyId].push(po);
  }

  // Apenas imóveis com 2+ co-proprietários
  const splitProperties = Object.entries(sharesByProperty).filter(([, shares]) => shares.length >= 2);

  // Buscar contratos vinculados a essas propriedades
  const propertyIds = splitProperties.map(([pid]) => pid);
  const contracts = await prisma.contract.findMany({
    where: { propertyId: { in: propertyIds }, status: "ATIVO" },
    select: { id: true, propertyId: true, ownerId: true, rentalValue: true, adminFeePercent: true },
    // include owner name for display
  });
  const contractsByProperty: Record<string, typeof contracts> = {};
  for (const c of contracts) {
    if (!c.propertyId) continue;
    if (!contractsByProperty[c.propertyId]) contractsByProperty[c.propertyId] = [];
    contractsByProperty[c.propertyId].push(c);
  }

  // Garantir que o proprietário do contrato está na lista de shares
  // Se PropertyOwner só tem co-proprietário mas não o principal, incluir com o restante
  for (const [propertyId, shares] of splitProperties) {
    const propContracts = contractsByProperty[propertyId] || [];
    for (const contract of propContracts) {
      const ownerInShares = shares.some(s => s.ownerId === contract.ownerId);
      if (!ownerInShares) {
        const totalPct = shares.reduce((s, sh) => s + sh.percentage, 0);
        if (totalPct < 100) {
          const remainingPct = Math.round((100 - totalPct) * 100) / 100;
          // Buscar dados do owner
          const owner = await prisma.owner.findUnique({
            where: { id: contract.ownerId },
            select: { id: true, name: true },
          });
          if (owner) {
            shares.push({
              id: `virtual-${contract.ownerId}`,
              propertyId,
              ownerId: contract.ownerId,
              percentage: remainingPct,
              owner,
              property: shares[0].property,
            } as any);
          }
        }
      }
    }
  }

  const fixes = [];

  for (const [propertyId, shares] of splitProperties) {
    const ownerIds = shares.map(s => s.ownerId);
    const propContracts = contractsByProperty[propertyId] || [];
    const contractIds = propContracts.map(c => c.id);

    // Buscar TODOS entries CREDITO relevantes: por propertyId OU por contractId OU por ownerId dos co-proprietários
    const entries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA", "IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
        OR: [
          { propertyId },
          ...(contractIds.length > 0 ? [{ contractId: { in: contractIds } }] : []),
          { ownerId: { in: ownerIds }, contractId: { in: contractIds } },
        ],
      },
      orderBy: { dueDate: "asc" },
    });

    // Agrupar por período + categoria + contrato
    const groupKey = (e: typeof entries[0]) => {
      const d = e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 7) : "sem-data";
      return `${e.contractId || "sem-contrato"}_${d}_${e.category}`;
    };
    const groups: Record<string, typeof entries> = {};
    for (const e of entries) {
      const k = groupKey(e);
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    }

    for (const [, groupEntries] of Object.entries(groups)) {
      const entryOwnerIds = new Set(groupEntries.map(e => e.ownerId));
      const missingOwners = shares.filter(s => !entryOwnerIds.has(s.ownerId));

      if (missingOwners.length === 0) continue;

      const existingEntry = groupEntries[0];

      // Calcular valor total original:
      // Se 1 entry e owner tem X% < 100 → entry tem valor cheio (100%), originalTotal = entry.value
      // Se 1 entry e owner tem 100% → valor é o total
      // Se múltiplos entries → somar e calcular proporcionalmente
      const existingOwnerShare = shares.find(s => s.ownerId === existingEntry.ownerId);
      let originalTotal: number;

      if (groupEntries.length === 1 && existingOwnerShare) {
        if (existingOwnerShare.percentage < 100) {
          // Entry provavelmente tem valor de 100% (criado antes do split)
          // OU já tem valor proporcional (se já foi ajustado)
          // Verificar pela descrição se já tem porcentagem
          const hasPercentInDesc = existingEntry.description.includes("%");
          if (hasPercentInDesc) {
            // Já foi ajustado, extrapolar o total
            originalTotal = Math.round(existingEntry.value / (existingOwnerShare.percentage / 100) * 100) / 100;
          } else {
            // Valor de 100%, é o total original
            originalTotal = existingEntry.value;
          }
        } else {
          originalTotal = existingEntry.value;
        }
      } else {
        // Múltiplos entries - calcular total baseado nas proporções
        let sumValues = groupEntries.reduce((sum, e) => sum + e.value, 0);
        let sumPercent = groupEntries.reduce((sum, e) => {
          const s = shares.find(s => s.ownerId === e.ownerId);
          return sum + (s?.percentage || 0);
        }, 0);
        originalTotal = sumPercent > 0 ? Math.round(sumValues / (sumPercent / 100) * 100) / 100 : sumValues;
      }

      fixes.push({
        propertyId,
        propertyTitle: shares[0].property.title,
        category: existingEntry.category,
        contractId: existingEntry.contractId,
        dueDate: existingEntry.dueDate,
        description: existingEntry.description,
        originalTotal,
        existingEntries: groupEntries.map(e => ({
          id: e.id,
          ownerId: e.ownerId,
          ownerName: shares.find(s => s.ownerId === e.ownerId)?.owner.name || "?",
          value: e.value,
          percentage: shares.find(s => s.ownerId === e.ownerId)?.percentage || 0,
        })),
        missingOwners: missingOwners.map(s => ({
          ownerId: s.ownerId,
          ownerName: s.owner.name,
          percentage: s.percentage,
        })),
      });
    }
  }

  return { splitProperties, fixes };
}

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { splitProperties, fixes } = await findFixes();

    return NextResponse.json({
      splitProperties: splitProperties.map(([pid, shares]) => ({
        propertyId: pid,
        propertyTitle: shares[0].property.title,
        owners: shares.map(s => ({ name: s.owner.name, percentage: s.percentage })),
      })),
      fixesNeeded: fixes.length,
      fixes,
    });
  } catch (error) {
    console.error("[fix-owner-splits GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const allPropertyOwners = await prisma.propertyOwner.findMany({
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, title: true } },
      },
    });

    const sharesByProperty: Record<string, typeof allPropertyOwners> = {};
    for (const po of allPropertyOwners) {
      if (!sharesByProperty[po.propertyId]) sharesByProperty[po.propertyId] = [];
      sharesByProperty[po.propertyId].push(po);
    }

    const splitProperties = Object.entries(sharesByProperty).filter(([, shares]) => shares.length >= 2);

    const propertyIds = splitProperties.map(([pid]) => pid);
    const contractsForPost = await prisma.contract.findMany({
      where: { propertyId: { in: propertyIds }, status: "ATIVO" },
      select: { id: true, propertyId: true, ownerId: true },
    });
    const contractsByProperty: Record<string, string[]> = {};
    for (const c of contractsForPost) {
      if (!c.propertyId) continue;
      if (!contractsByProperty[c.propertyId]) contractsByProperty[c.propertyId] = [];
      contractsByProperty[c.propertyId].push(c.id);
    }

    // Incluir proprietário do contrato nos shares se não está em PropertyOwner
    for (const [propertyId, shares] of splitProperties) {
      const propContracts = contractsForPost.filter(c => c.propertyId === propertyId);
      for (const contract of propContracts) {
        const ownerInShares = shares.some(s => s.ownerId === contract.ownerId);
        if (!ownerInShares) {
          const totalPct = shares.reduce((s, sh) => s + sh.percentage, 0);
          if (totalPct < 100) {
            const remainingPct = Math.round((100 - totalPct) * 100) / 100;
            const owner = await prisma.owner.findUnique({
              where: { id: contract.ownerId },
              select: { id: true, name: true },
            });
            if (owner) {
              shares.push({
                id: `virtual-${contract.ownerId}`,
                propertyId,
                ownerId: contract.ownerId,
                percentage: remainingPct,
                owner,
                property: shares[0].property,
              } as any);
            }
          }
        }
      }
    }

    let created = 0;
    let adjusted = 0;
    const errors: string[] = [];

    for (const [propertyId, shares] of splitProperties) {
      const ownerIds = shares.map(s => s.ownerId);
      const contractIds = contractsByProperty[propertyId] || [];

      const entries = await prisma.ownerEntry.findMany({
        where: {
          type: "CREDITO",
          category: { in: ["REPASSE", "GARANTIA", "IPTU", "CONDOMINIO"] },
          status: { not: "CANCELADO" },
          OR: [
            { propertyId },
            ...(contractIds.length > 0 ? [{ contractId: { in: contractIds } }] : []),
            { ownerId: { in: ownerIds }, contractId: { in: contractIds } },
          ],
        },
        orderBy: { dueDate: "asc" },
      });

      const groupKey = (e: typeof entries[0]) => {
        const d = e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 7) : "sem-data";
        return `${e.contractId || "sem-contrato"}_${d}_${e.category}`;
      };
      const groups: Record<string, typeof entries> = {};
      for (const e of entries) {
        const k = groupKey(e);
        if (!groups[k]) groups[k] = [];
        groups[k].push(e);
      }

      for (const [, groupEntries] of Object.entries(groups)) {
        const entryOwnerIds = new Set(groupEntries.map(e => e.ownerId));
        const missingOwners = shares.filter(s => !entryOwnerIds.has(s.ownerId));

        if (missingOwners.length === 0) continue;

        const existingEntry = groupEntries[0];
        const existingOwnerShare = shares.find(s => s.ownerId === existingEntry.ownerId);

        // Calcular valor total original
        let originalTotal: number;
        if (groupEntries.length === 1 && existingOwnerShare) {
          if (existingOwnerShare.percentage < 100) {
            const hasPercentInDesc = existingEntry.description.includes("%");
            if (hasPercentInDesc) {
              originalTotal = Math.round(existingEntry.value / (existingOwnerShare.percentage / 100) * 100) / 100;
            } else {
              originalTotal = existingEntry.value;
            }
          } else {
            originalTotal = existingEntry.value;
          }
        } else {
          let sumValues = groupEntries.reduce((sum, e) => sum + e.value, 0);
          let sumPercent = groupEntries.reduce((sum, e) => {
            const s = shares.find(sh => sh.ownerId === e.ownerId);
            return sum + (s?.percentage || 0);
          }, 0);
          originalTotal = sumPercent > 0 ? Math.round(sumValues / (sumPercent / 100) * 100) / 100 : sumValues;
        }

        // Ajustar entry existente se tem valor de 100% e deveria ter menos
        if (groupEntries.length === 1 && existingOwnerShare && existingOwnerShare.percentage < 100) {
          const hasPercentInDesc = existingEntry.description.includes("%");
          if (!hasPercentInDesc) {
            // Valor é 100%, precisa ajustar para a porcentagem correta
            const correctValue = Math.round(originalTotal * (existingOwnerShare.percentage / 100) * 100) / 100;
            try {
              let newDesc = existingEntry.description.replace(
                /( - CTR-\d+)/,
                `$1 (${existingOwnerShare.percentage}%)`
              );
              // Se não tem CTR- na descrição, adicionar no final
              if (newDesc === existingEntry.description) {
                newDesc = `${existingEntry.description} (${existingOwnerShare.percentage}%)`;
              }
              await prisma.ownerEntry.update({
                where: { id: existingEntry.id },
                data: { value: correctValue, description: newDesc },
              });
              adjusted++;
            } catch (err) {
              errors.push(`Ajustar ${existingEntry.id}: ${err instanceof Error ? err.message : "?"}`);
            }
          }
        }

        // Criar entries para os co-proprietários faltando
        for (const missing of missingOwners) {
          const portion = Math.round(originalTotal * (missing.percentage / 100) * 100) / 100;
          let desc = existingEntry.description;
          if (!desc.includes("%")) {
            const replaced = desc.replace(/( - CTR-\d+)/, `$1 (${missing.percentage}%)`);
            desc = replaced !== desc ? replaced : `${desc} (${missing.percentage}%)`;
          } else {
            desc = desc.replace(/\(\d+(?:[.,]\d+)?%\)/, `(${missing.percentage}%)`);
          }

          try {
            await prisma.ownerEntry.create({
              data: {
                type: "CREDITO",
                category: existingEntry.category,
                description: desc,
                value: portion,
                dueDate: existingEntry.dueDate,
                status: existingEntry.status,
                ownerId: missing.ownerId,
                contractId: existingEntry.contractId,
                propertyId: existingEntry.propertyId || propertyId,
                notes: existingEntry.notes,
              },
            });
            created++;
          } catch (err) {
            errors.push(`Criar para ${missing.owner.name}: ${err instanceof Error ? err.message : "?"}`);
          }
        }
      }
    }

    return NextResponse.json({
      created,
      adjusted,
      errors,
      message: `${created} entry(ies) criado(s). ${adjusted} ajustado(s). ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-owner-splits POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
