import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/fix-prorata-repasses
 * Lista REPASSE entries cujo valor não bate com o pro-rata do Payment vinculado.
 * Usa payment.notes.aluguel (valor real do aluguel, já com pro-rata) como fonte de verdade.
 *
 * POST /api/audit/fix-prorata-repasses
 * Corrige valores e notes dos entries + splitOwnerValue do Payment.
 */

interface PaymentNotes {
  aluguel?: number;
  aluguelOriginal?: number;
  isProrata?: boolean;
  prorataDias?: number;
}

export async function GET() {
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
      orderBy: { dueDate: "asc" },
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

    // Index payments by contractId + month
    const paymentIndex: Record<string, typeof payments[0]> = {};
    for (const p of payments) {
      if (!p.contractId || !p.dueDate) continue;
      const d = new Date(p.dueDate);
      const key = `${p.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      paymentIndex[key] = p;
    }

    const mismatches = [];

    for (const entry of entries) {
      if (!entry.contractId || !entry.dueDate) continue;
      const d = new Date(entry.dueDate);
      const key = `${entry.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const payment = paymentIndex[key];
      if (!payment || !payment.contract) continue;

      // Ler notes do payment para pegar o aluguel real (com pro-rata)
      let pNotes: PaymentNotes = {};
      if (payment.notes) {
        try { pNotes = JSON.parse(payment.notes); } catch {}
      }

      // Se não é pro-rata, pular
      if (!pNotes.isProrata || !pNotes.aluguel) continue;

      const adminFeePercent = payment.contract.adminFeePercent || 10;
      const prorataAluguel = pNotes.aluguel; // valor real do aluguel pro-rata

      // splitOwnerValue correto = aluguel pro-rata - taxa adm
      const correctSplitOwner = Math.round(prorataAluguel * (1 - adminFeePercent / 100) * 100) / 100;

      // Detectar sharePercent do entry
      const pctMatch = entry.description.match(/\((\d+(?:[.,]\d+)?)%\)/);
      const sharePercent = pctMatch ? parseFloat(pctMatch[1].replace(",", ".")) : null;
      const shareFactor = sharePercent ? sharePercent / 100 : 1;

      // Valor correto do entry
      const expectedValue = Math.round(correctSplitOwner * shareFactor * 100) / 100;

      if (Math.abs(entry.value - expectedValue) > 0.02) {
        mismatches.push({
          entryId: entry.id,
          paymentId: payment.id,
          description: entry.description,
          contractId: entry.contractId,
          dueDate: entry.dueDate,
          currentValue: entry.value,
          expectedValue,
          prorataAluguel,
          originalAluguel: pNotes.aluguelOriginal || payment.contract.rentalValue,
          prorataDias: pNotes.prorataDias,
          adminFeePercent,
          sharePercent,
          currentSplitOwner: payment.splitOwnerValue,
          correctSplitOwner,
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

    // Track quais payments precisam de fix no splitOwnerValue
    const paymentFixes: Record<string, number> = {};

    let fixed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      if (!entry.contractId || !entry.dueDate) { skipped++; continue; }
      const d = new Date(entry.dueDate);
      const key = `${entry.contractId}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const payment = paymentIndex[key];
      if (!payment || !payment.contract) { skipped++; continue; }

      let pNotes: PaymentNotes = {};
      if (payment.notes) {
        try { pNotes = JSON.parse(payment.notes); } catch {}
      }

      if (!pNotes.isProrata || !pNotes.aluguel) { skipped++; continue; }

      const adminFeePercent = payment.contract.adminFeePercent || 10;
      const prorataAluguel = pNotes.aluguel;
      const correctSplitOwner = Math.round(prorataAluguel * (1 - adminFeePercent / 100) * 100) / 100;

      const pctMatch = entry.description.match(/\((\d+(?:[.,]\d+)?)%\)/);
      const sharePercent = pctMatch ? parseFloat(pctMatch[1].replace(",", ".")) : null;
      const shareFactor = sharePercent ? sharePercent / 100 : 1;

      const expectedValue = Math.round(correctSplitOwner * shareFactor * 100) / 100;

      if (Math.abs(entry.value - expectedValue) <= 0.02) { skipped++; continue; }

      // Recalcular notes
      const aluguelBruto = prorataAluguel;
      const adminFeeValue = Math.round(aluguelBruto * (adminFeePercent / 100) * 100) / 100;

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
        isProrata: true,
        prorataDias: pNotes.prorataDias,
        aluguelOriginal: pNotes.aluguelOriginal,
        fixedProrata: true,
      });

      try {
        await prisma.ownerEntry.update({
          where: { id: entry.id },
          data: { value: expectedValue, notes: newNotes },
        });
        fixed++;

        // Marcar payment para fix do splitOwnerValue
        if (payment.splitOwnerValue && Math.abs(payment.splitOwnerValue - correctSplitOwner) > 0.02) {
          paymentFixes[payment.id] = correctSplitOwner;
        }
      } catch (err) {
        errors.push(`${entry.id}: ${err instanceof Error ? err.message : "?"}`);
      }
    }

    // Corrigir splitOwnerValue nos payments também
    let paymentFixed = 0;
    for (const [paymentId, correctValue] of Object.entries(paymentFixes)) {
      try {
        await prisma.payment.update({
          where: { id: paymentId },
          data: { splitOwnerValue: correctValue },
        });
        paymentFixed++;
      } catch (err) {
        errors.push(`payment ${paymentId}: ${err instanceof Error ? err.message : "?"}`);
      }
    }

    return NextResponse.json({
      fixed,
      skipped,
      paymentFixed,
      errors,
      message: `${fixed} repasse(s) corrigido(s). ${paymentFixed} payment(s) corrigido(s). ${skipped} já estavam ok. ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[fix-prorata-repasses POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
