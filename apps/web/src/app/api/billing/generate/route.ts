import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { calculateIRRF } from "@/lib/fiscal";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const monthStr = body.month as string | undefined;

    // Determine target month
    let targetYear: number;
    let targetMonth: number; // 0-indexed

    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      // Default: next month
      const now = new Date();
      targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      targetMonth = (now.getMonth() + 1) % 12;
    }

    // Month range for duplicate check
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // Find active contracts that cover the target month
    const contracts = await prisma.contract.findMany({
      where: {
        status: "ATIVO",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            condoFee: true,
            iptuValue: true,
          },
        },
        tenant: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    if (contracts.length === 0) {
      return NextResponse.json({
        generated: 0,
        skipped: 0,
        errors: [],
        message: "Nenhum contrato ativo encontrado para este periodo.",
      });
    }

    // Find existing payments for this month to avoid duplicates
    const existingPayments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: { contractId: true },
    });
    const existingContractIds = new Set(existingPayments.map((p) => p.contractId));

    // Get the last payment code to continue sequence
    const lastPayment = await prisma.payment.findFirst({
      orderBy: { code: "desc" },
      select: { code: true },
    });
    let nextNumber = 1;
    if (lastPayment?.code) {
      const match = lastPayment.code.match(/PAG-(\d+)/);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }

    let generated = 0;
    let skipped = 0;
    const errors: { contract: string; message: string }[] = [];

    for (const contract of contracts) {
      // Skip contracts without tenant (e.g. ADMINISTRACAO, VISTORIA)
      if (!contract.tenantId) {
        skipped++;
        continue;
      }
      // Skip if payment already exists for this contract+month
      if (existingContractIds.has(contract.id)) {
        skipped++;
        continue;
      }

      try {
        // Calculate due date using paymentDay
        let paymentDay = contract.paymentDay || 10;
        // Clamp to last day of month if needed
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        if (paymentDay > lastDayOfMonth) paymentDay = lastDayOfMonth;

        const dueDate = new Date(targetYear, targetMonth, paymentDay, 12, 0, 0);

        // Calculate condominium and IPTU values
        const condoFee = contract.property?.condoFee || 0;
        const iptuMonthly = contract.property?.iptuValue
          ? Math.round((contract.property.iptuValue / 12) * 100) / 100
          : 0;

        // Total value charged to tenant = rent + condo + IPTU
        const totalValue = Math.round((contract.rentalValue + condoFee + iptuMonthly) * 100) / 100;

        // Calculate split values (admin fee applies only to rental value)
        const adminFee = contract.adminFeePercent || 10;
        let splitAdminValue = Math.round(contract.rentalValue * (adminFee / 100) * 100) / 100;

        // Calculate intermediation fee installment if applicable
        let intermediationInstallmentValue = 0;
        let intermediationNote = "";
        if (
          contract.intermediationFee != null &&
          contract.intermediationFee > 0 &&
          contract.intermediationInstallments != null &&
          contract.intermediationInstallments > 1
        ) {
          // Determine which month of the contract this payment falls in (1-indexed)
          const contractStartDate = new Date(contract.startDate);
          const contractMonthNumber =
            (targetYear - contractStartDate.getFullYear()) * 12 +
            (targetMonth - contractStartDate.getMonth()) + 1;

          if (contractMonthNumber >= 1 && contractMonthNumber <= contract.intermediationInstallments) {
            // intermediationFee is a percentage of the rental value
            const totalIntermediationValue = contract.rentalValue * (contract.intermediationFee / 100);
            intermediationInstallmentValue = Math.round(
              (totalIntermediationValue / contract.intermediationInstallments) * 100
            ) / 100;
            splitAdminValue = Math.round((splitAdminValue + intermediationInstallmentValue) * 100) / 100;
            intermediationNote = `Intermediacao parcela ${contractMonthNumber}/${contract.intermediationInstallments}: R$ ${intermediationInstallmentValue.toFixed(2)}`;
          }
        }

        const splitOwnerValue = Math.round((contract.rentalValue - splitAdminValue) * 100) / 100;

        // Calculate IRRF on owner's gross income (rental - admin fee)
        const grossToOwner = splitOwnerValue;
        const irrf = calculateIRRF(grossToOwner);
        const irrfValue = irrf.irrfValue;
        const irrfRate = irrf.rate;
        const netToOwner = Math.round((grossToOwner - irrfValue) * 100) / 100;

        const code = `PAG-${String(nextNumber).padStart(3, "0")}`;
        nextNumber++;

        // Build description with breakdown
        const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;
        const descParts = [`Aluguel ${mLabel} - ${contract.code}`];
        if (condoFee > 0) descParts.push(`Condominio: R$ ${condoFee.toFixed(2)}`);
        if (iptuMonthly > 0) descParts.push(`IPTU: R$ ${iptuMonthly.toFixed(2)}`);
        if (intermediationNote) descParts.push(intermediationNote);

        // Store structured breakdown in notes for programmatic access
        const breakdown: Record<string, unknown> = {
          aluguel: contract.rentalValue,
          condominio: condoFee,
          iptu: iptuMonthly,
          total: totalValue,
        };
        if (intermediationInstallmentValue > 0) {
          breakdown.intermediacao = intermediationInstallmentValue;
        }

        await prisma.payment.create({
          data: {
            code,
            contractId: contract.id,
            tenantId: contract.tenantId!,
            ownerId: contract.ownerId,
            value: totalValue,
            dueDate,
            status: "PENDENTE",
            splitAdminValue,
            splitOwnerValue,
            intermediationFee: intermediationInstallmentValue > 0 ? intermediationInstallmentValue : null,
            grossToOwner,
            irrfValue: irrfValue > 0 ? irrfValue : null,
            irrfRate: irrfValue > 0 ? irrfRate : null,
            netToOwner,
            description: descParts.join(" | "),
            notes: JSON.stringify(breakdown),
          },
        });

        // Create owner entry records split by PropertyOwner percentages
        if (contract.property?.id) {
          const ownerShares = await prisma.propertyOwner.findMany({
            where: { propertyId: contract.property.id },
          });

          if (ownerShares.length > 0) {
            // Multiple owners: create split entries for each
            for (const share of ownerShares) {
              const ownerPortion = Math.round(splitOwnerValue * (share.percentage / 100) * 100) / 100;
              await prisma.ownerEntry.create({
                data: {
                  type: "CREDITO",
                  category: "REPASSE",
                  description: `Repasse aluguel ${mLabel} - ${contract.code} (${share.percentage}%)`,
                  value: ownerPortion,
                  dueDate,
                  status: "PENDENTE",
                  ownerId: share.ownerId,
                  contractId: contract.id,
                  propertyId: contract.property.id,
                },
              });
            }
          } else {
            // Single owner (no PropertyOwner records): create one entry
            await prisma.ownerEntry.create({
              data: {
                type: "CREDITO",
                category: "REPASSE",
                description: `Repasse aluguel ${mLabel} - ${contract.code}`,
                value: splitOwnerValue,
                dueDate,
                status: "PENDENTE",
                ownerId: contract.ownerId,
                contractId: contract.id,
                propertyId: contract.property.id,
              },
            });
          }
        }

        generated++;
      } catch (err) {
        errors.push({
          contract: contract.code,
          message: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    const monthLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    return NextResponse.json({
      generated,
      skipped,
      errors,
      month: monthLabel,
      message: generated > 0
        ? `${generated} cobranca(s) gerada(s) para ${monthLabel}.${skipped > 0 ? ` ${skipped} ja existiam.` : ""}`
        : `Nenhuma cobranca gerada. ${skipped} ja existiam para ${monthLabel}.`,
    });
  } catch (error) {
    console.error("Erro ao gerar cobrancas:", error);
    return NextResponse.json(
      { error: "Erro ao gerar cobrancas" },
      { status: 500 }
    );
  }
}

// GET: Preview - shows which contracts would generate charges
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    let targetYear: number;
    let targetMonth: number;

    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      targetMonth = (now.getMonth() + 1) % 12;
    }

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const contracts = await prisma.contract.findMany({
      where: {
        status: "ATIVO",
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: {
        property: {
          select: {
            title: true,
            condoFee: true,
            iptuValue: true,
          },
        },
        tenant: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    const existingPayments = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: { contractId: true },
    });
    const existingContractIds = new Set(existingPayments.map((p) => p.contractId));

    const preview = contracts.filter(c => c.tenantId).map((c) => {
      const condoFee = c.property?.condoFee || 0;
      const iptuMonthly = c.property?.iptuValue
        ? Math.round((c.property.iptuValue / 12) * 100) / 100
        : 0;
      const totalValue = Math.round((c.rentalValue + condoFee + iptuMonthly) * 100) / 100;

      return {
        contractCode: c.code,
        property: c.property?.title || "N/A",
        tenant: c.tenant?.name || "N/A",
        owner: c.owner.name,
        rentalValue: c.rentalValue,
        condoFee,
        iptuMonthly,
        value: totalValue,
        paymentDay: c.paymentDay,
        alreadyExists: existingContractIds.has(c.id),
      };
    });

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      total: contracts.length,
      pending: contracts.length - existingContractIds.size,
      existing: existingContractIds.size,
      contracts: preview,
    });
  } catch (error) {
    console.error("Erro ao carregar preview:", error);
    return NextResponse.json(
      { error: "Erro ao carregar preview" },
      { status: 500 }
    );
  }
}
