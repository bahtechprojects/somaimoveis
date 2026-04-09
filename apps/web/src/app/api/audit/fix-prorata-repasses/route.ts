import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-prorata-repasses
 * Lista REPASSE entries cujo valor não bate com o splitOwnerValue do Payment vinculado.
 *
 * POST /api/audit/fix-prorata-repasses
 * Corrige valores e notes dos entries com pro-rata incorreto.
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // Buscar todos REPASSE/GARANTIA entries com contractId
    const entries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA"] },
        status: { not: "CANCELADO" },
        contractId: { not: null },
      },
      orderBy: { dueDate: "asc" },
    });

    // Buscar todos payments com pro-rata info
    const payments = await prisma.payment.findMany({
      where: {
        status: { not: "CANCELADO" },
      },
      select: {
        id: true,
        contractId: true,
        dueDate: true,
        splitOwnerValue: true,
        notes: true,
        contract: {
          select: { rentalValue: true, adminFeePercent: true },
        },
      },
    });

    // Index payments by contractId + month
    const paymentIndex: Record<string, typeof payments[0]> = {};
    for (const p of payments) {
      if (!p.contractId || !p.dueDate) continue;
      const d = new Date(p.dueDate);
      const key = `${p.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      paymentIndex[key] = p;
    }

    // Buscar PropertyOwner para saber splits
    const allPropertyOwners = await prisma.propertyOwner.findMany();
    const sharesByProperty: Record<string, typeof allPropertyOwners> = {};
    for (const po of allPropertyOwners) {
      if (!sharesByProperty[po.propertyId]) sharesByProperty[po.propertyId] = [];
      sharesByProperty[po.propertyId].push(po);
    }

    const mismatches = [];

    for (const entry of entries) {
      if (!entry.contractId || !entry.dueDate) continue;
      const d = new Date(entry.dueDate);
      const key = `${entry.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const payment = paymentIndex[key];
      if (!payment || !payment.splitOwnerValue || !payment.contract) continue;

      // Detectar sharePercent
      const pctMatch = entry.description.match(/\((\d+(?:[.,]\d+)?)%\)/);
      const sharePercent = pctMatch ? parseFloat(pctMatch[1].replace(",", ".")) : null;
      const shareFactor = sharePercent ? sharePercent / 100 : 1;

      // Valor esperado: splitOwnerValue * shareFactor
      const expectedValue = Math.round(payment.splitOwnerValue * shareFactor * 100) / 100;

      if (Math.abs(entry.value - expectedValue) > 0.02) {
        // Verificar se payment é pro-rata
        let isProrata = false;
        if (payment.notes) {
          try {
            const n = JSON.parse(payment.notes);
            isProrata = n.isProrata === true;
          } catch {}
        }

        mismatches.push({
          entryId: entry.id,
          description: entry.description,
          contractId: entry.contractId,
          dueDate: entry.dueDate,
          currentValue: entry.value,
          expectedValue,
          splitOwnerValue: payment.splitOwnerValue,
          sharePercent,
          isProrata,
          rentalValue: payment.contract.rentalValue,
        });
      }
    }

    return NextResponse.json({
      totalEntries: entries.length,
      mismatches: mismatches.length,
      entries: mismatches,
    });
  } catch (error) {
    console.error("[fix-prorata-repasses GET]", error);
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
        category: { in: ["REPASSE", "GARANTIA"] },
        status: { not: "CANCELADO" },
        contractId: { not: null },
      },
    });

    const payments = await prisma.payment.findMany({
      where: { status: { not: "CANCELADO" } },
      select: {
        id: true,
        contractId: true,
        dueDate: true,
        splitOwnerValue: true,
        notes: true,
        contract: {
          select: { rentalValue: true, adminFeePercent: true },
        },
      },
    });

    const paymentIndex: Record<string, typeof payments[0]> = {};
    for (const p of payments) {
      if (!p.contractId || !p.dueDate) continue;
      const d = new Date(p.dueDate);
      const key = `${p.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      paymentIndex[key] = p;
    }

    let fixed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.contractId || !entry.dueDate) { skipped++; continue; }
      const d = new Date(entry.dueDate);
      const key = `${entry.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const payment = paymentIndex[key];
      if (!payment || !payment.splitOwnerValue || !payment.contract) { skipped++; continue; }

      const pctMatch = entry.description.match(/\((\d+(?:[.,]\d+)?)%\)/);
      const sharePercent = pctMatch ? parseFloat(pctMatch[1].replace(",", ".")) : null;
      const shareFactor = sharePercent ? sharePercent / 100 : 1;

      const expectedValue = Math.round(payment.splitOwnerValue * shareFactor * 100) / 100;

      if (Math.abs(entry.value - expectedValue) <= 0.02) { skipped++; continue; }

      // Recalcular notes com valores corretos
      const adminFeePercent = payment.contract.adminFeePercent || 10;
      const adminPct = adminFeePercent / 100;
      const aluguelBruto = Math.round(expectedValue / ((1 - adminPct) * shareFactor) * 100) / 100;
      const adminFeeValue = Math.round(aluguelBruto * adminPct * 100) / 100;

      let existingNotes: Record<string, unknown> = {};
      if (entry.notes) {
        try { existingNotes = JSON.parse(entry.notes); } catch {}
      }

      const newNotes = JSON.stringify({
        ...existingNotes,
        aluguelBruto,
        adminFeePercent,
        adminFeeValue,
        sharePercent: sharePercent || undefined,
        netToOwner: expectedValue,
        fixedProrata: true,
      });

      try {
        await prisma.ownerEntry.update({
          where: { id: entry.id },
          data: { value: expectedValue, notes: newNotes },
        });
        fixed++;
      } catch (err) {
        errors.push(`${entry.id}: ${err instanceof Error ? err.message : "?"}`);
      }
    }

    return NextResponse.json({
      fixed,
      skipped,
      errors,
      message: `${fixed} repasse(s) corrigido(s). ${skipped} já estavam ok. ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-prorata-repasses POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
