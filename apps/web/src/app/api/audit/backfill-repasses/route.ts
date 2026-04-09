import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/backfill-repasses?month=2026-04
 * Lista pagamentos que NÃO têm OwnerEntry REPASSE correspondente.
 *
 * POST /api/audit/backfill-repasses
 * Cria OwnerEntry REPASSE para cada pagamento que não tem.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    // Default: mês atual
    let targetYear: number;
    let targetMonth: number;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
    }

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // Buscar todos os pagamentos do mês
    const payments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      include: {
        contract: {
          select: {
            id: true,
            code: true,
            ownerId: true,
            propertyId: true,
            rentalValue: true,
            adminFeePercent: true,
          },
        },
      },
    });

    // Para cada pagamento, verificar se existe OwnerEntry REPASSE correspondente
    const missing = [];
    const ok = [];

    for (const payment of payments) {
      if (!payment.contract) continue;

      const repasseEntries = await prisma.ownerEntry.findMany({
        where: {
          contractId: payment.contractId,
          type: "CREDITO",
          category: { in: ["REPASSE", "GARANTIA"] },
          dueDate: { gte: monthStart, lte: monthEnd },
          status: { not: "CANCELADO" },
        },
      });

      if (repasseEntries.length === 0) {
        missing.push({
          paymentId: payment.id,
          paymentCode: payment.code,
          contractCode: payment.contract.code,
          contractId: payment.contractId,
          ownerId: payment.contract.ownerId,
          propertyId: payment.contract.propertyId,
          rentalValue: payment.contract.rentalValue,
          adminFeePercent: payment.contract.adminFeePercent,
          splitOwnerValue: payment.splitOwnerValue,
          netToOwner: payment.netToOwner,
          dueDate: payment.dueDate,
        });
      } else {
        ok.push(payment.code);
      }
    }

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      totalPayments: payments.length,
      missing: missing.length,
      ok: ok.length,
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
    const monthStr = body.month as string | undefined;

    let targetYear: number;
    let targetMonth: number;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
    }

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    const payments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      include: {
        contract: {
          select: {
            id: true,
            code: true,
            ownerId: true,
            propertyId: true,
            rentalValue: true,
            adminFeePercent: true,
          },
        },
      },
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const payment of payments) {
      if (!payment.contract) {
        skipped++;
        continue;
      }

      // Verificar se já existe REPASSE
      const existingRepasse = await prisma.ownerEntry.findFirst({
        where: {
          contractId: payment.contractId,
          type: "CREDITO",
          category: { in: ["REPASSE", "GARANTIA"] },
          dueDate: { gte: monthStart, lte: monthEnd },
          status: { not: "CANCELADO" },
        },
      });

      if (existingRepasse) {
        skipped++;
        continue;
      }

      const contract = payment.contract;
      const adminFeePercent = contract.adminFeePercent || 10;
      const splitOwnerValue = payment.splitOwnerValue ||
        Math.round(contract.rentalValue * (1 - adminFeePercent / 100) * 100) / 100;

      // Verificar co-proprietários
      const ownerShares = contract.propertyId
        ? await prisma.propertyOwner.findMany({ where: { propertyId: contract.propertyId } })
        : [];

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

          // Proprietário principal recebe o restante
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
          // Proprietário único
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
