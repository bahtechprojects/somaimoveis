import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-owner-splits
 * Lista repasses que pertencem a imóveis com co-proprietários (PropertyOwner),
 * mas onde apenas um proprietário recebeu o repasse (faltam entries para os outros).
 *
 * POST /api/audit/fix-owner-splits
 * Corrige: para cada repasse com split faltando, cria entries para os co-proprietários
 * e ajusta os valores proporcionalmente.
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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

  if (splitProperties.length === 0) {
    return NextResponse.json({ message: "Nenhum imóvel com co-proprietários encontrado.", fixes: [] });
  }

  const fixes = [];

  for (const [propertyId, shares] of splitProperties) {
    const ownerIds = shares.map(s => s.ownerId);

    // Buscar todos os REPASSE/GARANTIA entries CREDITO para este imóvel
    const entries = await prisma.ownerEntry.findMany({
      where: {
        propertyId,
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA"] },
        status: { not: "CANCELADO" },
      },
      orderBy: { dueDate: "asc" },
    });

    // Agrupar entries por contractId + dueDate (mesmo período)
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

    // Verificar quais grupos NÃO têm entries para TODOS os co-proprietários
    for (const [key, groupEntries] of Object.entries(groups)) {
      const entryOwnerIds = new Set(groupEntries.map(e => e.ownerId));
      const missingOwners = shares.filter(s => !entryOwnerIds.has(s.ownerId));

      if (missingOwners.length > 0) {
        // Existe entry para alguns owners mas não todos
        const existingEntry = groupEntries[0];
        // Verificar se o entry existente tem valor de 100% (não foi splitado)
        const totalExistingValue = groupEntries.reduce((sum, e) => sum + e.value, 0);

        fixes.push({
          propertyId,
          propertyTitle: shares[0].property.title,
          category: existingEntry.category,
          contractId: existingEntry.contractId,
          dueDate: existingEntry.dueDate,
          description: existingEntry.description,
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
          totalExistingValue,
        });
      }
    }

    // Também verificar créditos IPTU/CONDOMINIO
    const creditEntries = await prisma.ownerEntry.findMany({
      where: {
        propertyId,
        type: "CREDITO",
        category: { in: ["IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
      },
      orderBy: { dueDate: "asc" },
    });

    const creditGroups: Record<string, typeof creditEntries> = {};
    for (const e of creditEntries) {
      const k = `${e.contractId || "sem-contrato"}_${e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 7) : "sem-data"}_${e.category}_${e.description}`;
      if (!creditGroups[k]) creditGroups[k] = [];
      creditGroups[k].push(e);
    }

    for (const [key, groupEntries] of Object.entries(creditGroups)) {
      const entryOwnerIds = new Set(groupEntries.map(e => e.ownerId));
      const missingOwners = shares.filter(s => !entryOwnerIds.has(s.ownerId));

      if (missingOwners.length > 0) {
        const existingEntry = groupEntries[0];
        fixes.push({
          propertyId,
          propertyTitle: shares[0].property.title,
          category: existingEntry.category,
          contractId: existingEntry.contractId,
          dueDate: existingEntry.dueDate,
          description: existingEntry.description,
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
          totalExistingValue: groupEntries.reduce((sum, e) => sum + e.value, 0),
        });
      }
    }
  }

  return NextResponse.json({
    splitProperties: splitProperties.map(([pid, shares]) => ({
      propertyId: pid,
      propertyTitle: shares[0].property.title,
      owners: shares.map(s => ({ name: s.owner.name, percentage: s.percentage })),
    })),
    fixesNeeded: fixes.length,
    fixes,
  });
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Mesma lógica do GET para identificar fixes
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
  let created = 0;
  let adjusted = 0;
  const errors: string[] = [];

  for (const [propertyId, shares] of splitProperties) {
    const totalPercentage = shares.reduce((sum, s) => sum + s.percentage, 0);

    // Buscar REPASSE/GARANTIA/IPTU/CONDOMINIO entries para este imóvel
    const entries = await prisma.ownerEntry.findMany({
      where: {
        propertyId,
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA", "IPTU", "CONDOMINIO"] },
        status: { not: "CANCELADO" },
      },
      orderBy: { dueDate: "asc" },
    });

    // Agrupar por período + categoria
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

      // Calcular o valor total original (antes do split)
      // Se existe apenas 1 entry e seu owner tem X%, o total original = value / (X/100)
      let originalTotal: number;
      if (groupEntries.length === 1 && totalPercentage >= 99) {
        const ownerShare = shares.find(s => s.ownerId === existingEntry.ownerId);
        if (ownerShare && ownerShare.percentage < 100) {
          // Entry com valor de 100% mas deveria ser splitado
          originalTotal = existingEntry.value;
        } else {
          originalTotal = existingEntry.value;
        }
      } else {
        originalTotal = groupEntries.reduce((sum, e) => sum + e.value, 0);
      }

      // Recalcular: se o entry existente tem o valor CHEIO (100%), precisamos ajustá-lo
      // e criar entries para os missing owners
      if (groupEntries.length === 1) {
        const ownerShare = shares.find(s => s.ownerId === existingEntry.ownerId);
        if (ownerShare && ownerShare.percentage < 100) {
          // Ajustar o entry existente para a porcentagem correta
          const correctValue = Math.round(originalTotal * (ownerShare.percentage / 100) * 100) / 100;
          if (Math.abs(existingEntry.value - correctValue) > 0.01) {
            try {
              // Atualizar descrição para incluir porcentagem
              let newDesc = existingEntry.description;
              if (!newDesc.includes("%")) {
                newDesc = newDesc.replace(
                  /( - CTR-\d+)/,
                  `$1 (${ownerShare.percentage}%)`
                );
              }
              await prisma.ownerEntry.update({
                where: { id: existingEntry.id },
                data: {
                  value: correctValue,
                  description: newDesc,
                },
              });
              adjusted++;
            } catch (err) {
              errors.push(`Erro ao ajustar ${existingEntry.id}: ${err instanceof Error ? err.message : "?"}`);
            }
          }
        }
      }

      // Criar entries para os co-proprietários faltando
      for (const missing of missingOwners) {
        const portion = Math.round(originalTotal * (missing.percentage / 100) * 100) / 100;
        // Gerar descrição baseada no existente, trocando nome/porcentagem
        let desc = existingEntry.description;
        // Adicionar porcentagem se não tiver
        if (!desc.includes("%")) {
          desc = desc.replace(
            /( - CTR-\d+)/,
            `$1 (${missing.percentage}%)`
          );
        } else {
          // Trocar porcentagem existente
          desc = desc.replace(/\(\d+%\)/, `(${missing.percentage}%)`);
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
              propertyId,
              notes: existingEntry.notes,
            },
          });
          created++;
        } catch (err) {
          errors.push(`Erro ao criar entry para ${missing.owner.name}: ${err instanceof Error ? err.message : "?"}`);
        }
      }
    }
  }

  return NextResponse.json({
    created,
    adjusted,
    errors,
    message: `${created} entry(ies) criado(s) para co-proprietários faltando. ${adjusted} entry(ies) ajustado(s) com valor proporcional. ${errors.length} erro(s).`,
  });
}
