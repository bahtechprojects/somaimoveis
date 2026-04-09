import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

function parseMonth(monthStr: string | null) {
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    const [y, m] = monthStr.split("-").map(Number);
    return { targetYear: y, targetMonth: m - 1 };
  }
  const now = new Date();
  return { targetYear: now.getFullYear(), targetMonth: now.getMonth() };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const { targetYear, targetMonth } = parseMonth(searchParams.get("month"));
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // 1 query: todos pagamentos do mês
    const payments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: {
        id: true, code: true, contractId: true, splitOwnerValue: true, netToOwner: true, dueDate: true,
        contract: { select: { id: true, code: true, ownerId: true, propertyId: true, rentalValue: true, adminFeePercent: true } },
      },
    });

    // 1 query: todos owner entries REPASSE/GARANTIA do mês
    const allRepasses = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA"] },
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: { contractId: true },
    });
    const contractsWithRepasse = new Set(allRepasses.map(r => r.contractId).filter(Boolean));

    const missing = [];
    for (const p of payments) {
      if (!p.contract) continue;
      if (contractsWithRepasse.has(p.contractId)) continue;
      missing.push({
        paymentCode: p.code,
        contractCode: p.contract.code,
        ownerId: p.contract.ownerId,
        rentalValue: p.contract.rentalValue,
        adminFeePercent: p.contract.adminFeePercent,
        splitOwnerValue: p.splitOwnerValue,
      });
    }

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      totalPayments: payments.length,
      missing: missing.length,
      ok: payments.length - missing.length,
      missingEntries: missing,
    });
  } catch (error) {
    console.error("[backfill-repasses GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const { targetYear, targetMonth } = parseMonth(body.month);
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    // 1 query: pagamentos
    const payments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: {
        id: true, code: true, contractId: true, splitOwnerValue: true, netToOwner: true, dueDate: true,
        contract: { select: { id: true, code: true, ownerId: true, propertyId: true, rentalValue: true, adminFeePercent: true } },
      },
    });

    // 1 query: repasses existentes
    const allRepasses = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA"] },
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: { contractId: true },
    });
    const contractsWithRepasse = new Set(allRepasses.map(r => r.contractId).filter(Boolean));

    // 1 query: todos os PropertyOwner
    const allPropertyOwners = await prisma.propertyOwner.findMany();
    const sharesByProperty: Record<string, typeof allPropertyOwners> = {};
    for (const po of allPropertyOwners) {
      if (!sharesByProperty[po.propertyId]) sharesByProperty[po.propertyId] = [];
      sharesByProperty[po.propertyId].push(po);
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const payment of payments) {
      if (!payment.contract) { skipped++; continue; }
      if (contractsWithRepasse.has(payment.contractId)) { skipped++; continue; }

      const contract = payment.contract;
      const adminFeePercent = contract.adminFeePercent || 10;
      const splitOwnerValue = payment.splitOwnerValue ||
        Math.round(contract.rentalValue * (1 - adminFeePercent / 100) * 100) / 100;

      const ownerShares = contract.propertyId ? (sharesByProperty[contract.propertyId] || []) : [];

      const notes = JSON.stringify({
        aluguelBruto: contract.rentalValue,
        adminFeePercent,
        adminFeeValue: Math.round(contract.rentalValue * (adminFeePercent / 100) * 100) / 100,
        netToOwner: payment.netToOwner || splitOwnerValue,
        backfilledAt: new Date().toISOString(),
      });

      try {
        if (ownerShares.length > 0) {
          const totalSharePct = ownerShares.reduce((s, sh) => s + sh.percentage, 0);

          for (const share of ownerShares) {
            const portion = Math.round(splitOwnerValue * (share.percentage / 100) * 100) / 100;
            await prisma.ownerEntry.create({
              data: {
                type: "CREDITO",
                category: "REPASSE",
                description: `Repasse aluguel ${mLabel} - ${contract.code} (${share.percentage}%)`,
                value: portion,
                dueDate: payment.dueDate,
                status: "PENDENTE",
                ownerId: share.ownerId,
                contractId: contract.id,
                propertyId: contract.propertyId,
                notes,
              },
            });
            created++;
          }

          const contractOwnerInShares = ownerShares.some(s => s.ownerId === contract.ownerId);
          if (totalSharePct < 100 && !contractOwnerInShares) {
            const remainPct = Math.round((100 - totalSharePct) * 100) / 100;
            const remainVal = Math.round(splitOwnerValue * (remainPct / 100) * 100) / 100;
            await prisma.ownerEntry.create({
              data: {
                type: "CREDITO",
                category: "REPASSE",
                description: `Repasse aluguel ${mLabel} - ${contract.code} (${remainPct}%)`,
                value: remainVal,
                dueDate: payment.dueDate,
                status: "PENDENTE",
                ownerId: contract.ownerId,
                contractId: contract.id,
                propertyId: contract.propertyId,
                notes,
              },
            });
            created++;
          }
        } else {
          await prisma.ownerEntry.create({
            data: {
              type: "CREDITO",
              category: "REPASSE",
              description: `Repasse aluguel ${mLabel} - ${contract.code}`,
              value: splitOwnerValue,
              dueDate: payment.dueDate,
              status: "PENDENTE",
              ownerId: contract.ownerId,
              contractId: contract.id,
              propertyId: contract.propertyId,
              notes,
            },
          });
          created++;
        }
      } catch (err) {
        errors.push(`${contract.code}: ${err instanceof Error ? err.message : "?"}`);
      }
    }

    return NextResponse.json({
      month: mLabel,
      created,
      skipped,
      errors,
      message: `${created} repasse(s) criado(s) para ${mLabel}. ${skipped} já existiam. ${errors.length} erro(s).`,
    });
  } catch (error) {
    console.error("[backfill-repasses POST]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro" }, { status: 500 });
  }
}
