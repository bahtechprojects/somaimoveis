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

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const repasseEntries = await prisma.ownerEntry.findMany({
    where: {
      type: "CREDITO",
      category: { in: ["REPASSE", "GARANTIA"] },
      status: { not: "CANCELADO" },
    },
  });

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of repasseEntries) {
    // Verificar se já tem dados de admin fee
    let hasAdminFee = false;
    let existingNotes: Record<string, unknown> = {};
    if (entry.notes) {
      try {
        existingNotes = JSON.parse(entry.notes);
        if (existingNotes.adminFeePercent !== undefined && existingNotes.adminFeeValue !== undefined) {
          hasAdminFee = true;
        }
      } catch {}
    }

    if (hasAdminFee) {
      skipped++;
      continue;
    }

    // Buscar contrato para obter taxa adm
    let contract: {
      rentalValue: number;
      adminFeePercent: number;
      code: string;
    } | null = null;

    if (entry.contractId) {
      contract = await prisma.contract.findUnique({
        where: { id: entry.contractId },
        select: { rentalValue: true, adminFeePercent: true, code: true },
      });
    }

    // Se não tem contractId, tentar via owner + propriedade
    if (!contract && entry.ownerId) {
      const contracts = await prisma.contract.findMany({
        where: {
          ownerId: entry.ownerId,
          status: "ATIVO",
          ...(entry.propertyId ? { propertyId: entry.propertyId } : {}),
        },
        select: { rentalValue: true, adminFeePercent: true, code: true },
        take: 1,
      });
      if (contracts.length > 0) {
        contract = contracts[0];
      }
    }

    if (!contract) {
      errors.push(`${entry.id}: sem contrato encontrado`);
      continue;
    }

    const adminFeePercent = contract.adminFeePercent || 10;
    const aluguelBruto = contract.rentalValue;
    const adminFeeValue = Math.round(aluguelBruto * (adminFeePercent / 100) * 100) / 100;

    // Merge com notes existentes (preservar dados como originalCategory, guaranteedAt)
    const newNotes = {
      ...existingNotes,
      aluguelBruto,
      adminFeePercent,
      adminFeeValue,
      netToOwner: entry.value,
      backfilledAdminFeeAt: new Date().toISOString(),
    };

    await prisma.ownerEntry.update({
      where: { id: entry.id },
      data: {
        notes: JSON.stringify(newNotes),
      },
    });
    updated++;
  }

  return NextResponse.json({
    updated,
    skipped,
    errors,
    message: `${updated} repasse(s) atualizado(s) com taxa adm. ${skipped} já tinham. ${errors.length} erro(s).`,
  });
}
