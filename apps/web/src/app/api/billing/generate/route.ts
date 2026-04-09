import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { calculateIRRF } from "@/lib/fiscal";
import { nextBusinessDay } from "@/lib/business-days";

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

    // Find active contracts (status ATIVO, started before target month, not ended before it)
    const contracts = await prisma.contract.findMany({
      where: {
        status: "ATIVO",
        startDate: { lte: monthEnd },
        NOT: {
          endDate: { lt: monthStart },
        },
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

    // Get the highest payment code number to continue sequence
    const allCodes = await prisma.payment.findMany({
      select: { code: true },
    });
    let nextNumber = 1;
    for (const p of allCodes) {
      const match = p.code.match(/PAG-(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= nextNumber) nextNumber = num + 1;
      }
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

      // Contrato que começa no mês alvo: primeira cobrança é no mês seguinte
      const contractStartDate = new Date(contract.startDate);
      const csYearCheck = contractStartDate.getUTCFullYear();
      const csMonthCheck = contractStartDate.getUTCMonth();
      if (csYearCheck === targetYear && csMonthCheck === targetMonth) {
        skipped++;
        console.log(`[Billing] ${contract.code}: pulando mês de início do contrato. Primeira cobrança será no mês seguinte.`);
        continue;
      }

      try {
        // Calculate due date using paymentDay
        let paymentDay = contract.paymentDay || 10;
        // Clamp to last day of month if needed
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        if (paymentDay > lastDayOfMonth) paymentDay = lastDayOfMonth;

        // Se vencimento cair em final de semana ou feriado, mover para proximo dia util
        const rawDueDate = new Date(targetYear, targetMonth, paymentDay, 12, 0, 0);
        const dueDate = nextBusinessDay(rawDueDate);

        // Pro-rata: calcular aluguel proporcional se contrato começa ou termina no meio do mês
        const contractStart = new Date(contract.startDate);
        const contractEnd = contract.endDate ? new Date(contract.endDate) : null;
        // Normalizar para evitar problemas de timezone (usar UTC)
        const csYear = contractStart.getUTCFullYear();
        const csMonth = contractStart.getUTCMonth();
        const csDay = contractStart.getUTCDate();
        const monthLastDay = new Date(targetYear, targetMonth + 1, 0);
        const daysInMonth = monthLastDay.getDate();

        let prorataDays = 30; // padrão: mês cheio (base 30)
        let isProrata = false;

        // Primeiro mês do contrato: início no meio do mês
        if (csYear === targetYear && csMonth === targetMonth && csDay > 1) {
          prorataDays = daysInMonth - csDay + 1;
          isProrata = true;
        }

        // Último mês do contrato: término no meio do mês
        if (contractEnd) {
          const ceYear = contractEnd.getUTCFullYear();
          const ceMonth = contractEnd.getUTCMonth();
          const ceDay = contractEnd.getUTCDate();
          if (ceYear === targetYear && ceMonth === targetMonth && ceDay < daysInMonth) {
            if (isProrata) {
              // Começou e terminou no mesmo mês
              prorataDays = ceDay - csDay + 1;
            } else {
              prorataDays = ceDay;
              isProrata = true;
            }
          }
        }

        const dailyRate = contract.rentalValue / 30;
        const prorataRentalValue = isProrata
          ? Math.round(dailyRate * prorataDays * 100) / 100
          : contract.rentalValue;

        if (isProrata) {
          console.log(`[Billing] Pro-rata ${contract.code}: início=${csDay}/${csMonth + 1}/${csYear}, dias=${prorataDays}, aluguel=${contract.rentalValue} → ${prorataRentalValue}`);
        }

        // Calculate condominium and IPTU values
        const condoFee = contract.property?.condoFee || 0;
        const iptuMonthly = contract.property?.iptuValue
          ? Math.round((contract.property.iptuValue / 12) * 100) / 100
          : 0;

        // Check for pending tenant entries (CREDITO = discount, DEBITO = extra charge)
        // Include entries with dueDate in target month OR entries without dueDate (applied to next billing)
        const tenantEntries = await prisma.tenantEntry.findMany({
          where: {
            tenantId: contract.tenantId,
            status: "PENDENTE",
            OR: [
              {
                dueDate: {
                  gte: new Date(targetYear, targetMonth, 1),
                  lt: new Date(targetYear, targetMonth + 1, 1),
                },
              },
              { dueDate: null },
            ],
          },
        });
        const discountEntries = tenantEntries.filter(e => e.type === "CREDITO");
        const chargeEntries = tenantEntries.filter(e => e.type === "DEBITO");
        const totalCredits = discountEntries.reduce((sum, e) => sum + e.value, 0);
        const totalDebits = chargeEntries.reduce((sum, e) => sum + e.value, 0);

        // Total = aluguel (proporcional se pro-rata) + condominio + IPTU + seguro + taxa bancaria + debitos - creditos
        const bankFee = contract.bankFee || 0;
        const insuranceFee = contract.insuranceFee || 0;
        const totalValue = Math.max(0, Math.round((prorataRentalValue + condoFee + iptuMonthly + bankFee + insuranceFee + totalDebits - totalCredits) * 100) / 100);

        // Calculate split values (admin fee applies to rental value proporcional)
        const adminFee = contract.adminFeePercent || 10;
        let splitAdminValue = Math.round(prorataRentalValue * (adminFee / 100) * 100) / 100;

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
            const totalIntermediationValue = prorataRentalValue * (contract.intermediationFee / 100);
            intermediationInstallmentValue = Math.round(
              (totalIntermediationValue / contract.intermediationInstallments) * 100
            ) / 100;
            splitAdminValue = Math.round((splitAdminValue + intermediationInstallmentValue) * 100) / 100;
            intermediationNote = `Intermediação parcela ${contractMonthNumber}/${contract.intermediationInstallments}: R$ ${intermediationInstallmentValue.toFixed(2)}`;
          }
        }

        const splitOwnerValue = Math.round((prorataRentalValue - splitAdminValue) * 100) / 100;

        // Calculate IRRF on owner's gross income (rental - admin fee).
        // IRRF is calculated ONLY on the rental value (aluguel) minus admin fee.
        // Condominio, IPTU and other fees are NOT included in the IRRF base,
        // since grossToOwner = rentalValue - adminFee (does not include condoFee or iptuMonthly).
        const grossToOwner = splitOwnerValue;
        const irrf = calculateIRRF(grossToOwner);
        const irrfValue = irrf.irrfValue;
        const irrfRate = irrf.rate;
        const netToOwner = Math.round((grossToOwner - irrfValue) * 100) / 100;

        const code = `PAG-${String(nextNumber).padStart(3, "0")}`;
        nextNumber++;

        // Build description with breakdown
        const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;
        const descParts = [
          isProrata
            ? `Aluguel ${mLabel} (${prorataDays} dias) - ${contract.code}`
            : `Aluguel ${mLabel} - ${contract.code}`,
        ];
        if (isProrata) descParts.push(`Pro-rata: R$ ${prorataRentalValue.toFixed(2)} (${prorataDays}/30 dias)`);
        if (totalCredits > 0) descParts.push(`Créditos: -R$ ${totalCredits.toFixed(2)}`);
        if (totalDebits > 0) descParts.push(`Débitos: +R$ ${totalDebits.toFixed(2)}`);
        if (condoFee > 0) descParts.push(`Condominio: R$ ${condoFee.toFixed(2)}`);
        if (iptuMonthly > 0) descParts.push(`IPTU: R$ ${iptuMonthly.toFixed(2)}`);
        if (insuranceFee > 0) descParts.push(`Seguro Fianca: R$ ${insuranceFee.toFixed(2)}`);
        if (bankFee > 0) descParts.push(`Taxa Bancaria: R$ ${bankFee.toFixed(2)}`);
        if (intermediationNote) descParts.push(intermediationNote);

        // Store structured breakdown in notes for programmatic access
        const breakdown: Record<string, unknown> = {
          aluguel: isProrata ? prorataRentalValue : contract.rentalValue,
          aluguelOriginal: isProrata ? contract.rentalValue : undefined,
          isProrata,
          prorataDias: isProrata ? prorataDays : undefined,
          creditos: totalCredits,
          debitos: totalDebits,
          condominio: condoFee,
          iptu: iptuMonthly,
          seguroFianca: insuranceFee,
          taxaBancaria: bankFee,
          total: totalValue,
        };
        if (intermediationInstallmentValue > 0) {
          breakdown.intermediacao = intermediationInstallmentValue;
        }
        // Detail of each tenant entry applied
        if (tenantEntries.length > 0) {
          breakdown.lancamentos = tenantEntries.map(e => ({
            id: e.id,
            tipo: e.type,
            categoria: e.category,
            descricao: e.description,
            valor: e.value,
          }));
        }

        await prisma.payment.create({
          data: {
            code,
            contractId: contract.id,
            tenantId: contract.tenantId!,
            ownerId: contract.ownerId,
            value: totalValue,
            discountValue: totalCredits > 0 ? totalCredits : null,
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

        // Lançamentos NÃO são marcados como PAGO aqui.
        // Serão marcados quando o pagamento for confirmado (status PAGO).
        // Para entries sem dueDate, definir o dueDate para o mês alvo para evitar dupla aplicação.
        const nullDateEntries = tenantEntries.filter(e => !e.dueDate);
        if (nullDateEntries.length > 0) {
          await prisma.tenantEntry.updateMany({
            where: { id: { in: nullDateEntries.map(e => e.id) } },
            data: { dueDate: new Date(targetYear, targetMonth, 1, 12, 0, 0) },
          });
        }

        // Create owner entry records split by PropertyOwner percentages
        // Buscar shares de proprietários (usado para repasse e créditos do locatário)
        const ownerShares = contract.property?.id
          ? await prisma.propertyOwner.findMany({ where: { propertyId: contract.property.id } })
          : [];

        // Notes com valores TOTAIS do contrato + porcentagem do proprietário
        // Taxa adm é sobre o valor total, depois divide pela porcentagem
        const baseAluguel = isProrata ? prorataRentalValue : contract.rentalValue;
        const totalAdminFeeValue = Math.round(prorataRentalValue * (adminFee / 100) * 100) / 100;

        const buildOwnerNotes = (sharePercent: number) => {
          return JSON.stringify({
            aluguelBruto: baseAluguel,
            adminFeePercent: adminFee,
            adminFeeValue: totalAdminFeeValue,
            sharePercent: sharePercent < 100 ? sharePercent : undefined,
            intermediacao: intermediationInstallmentValue > 0 ? intermediationInstallmentValue : undefined,
            intermediacaoNota: intermediationNote || undefined,
            irrfValue: irrfValue > 0 ? irrfValue : undefined,
            irrfRate: irrfValue > 0 ? irrfRate : undefined,
            netToOwner,
          });
        };

        const ownerEntryNotes = buildOwnerNotes(100);

        if (contract.property?.id) {

          if (ownerShares.length > 0) {
            // Multiple owners: create split entries for each
            const totalSharePercent = ownerShares.reduce((s, sh) => s + sh.percentage, 0);

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
                  notes: buildOwnerNotes(share.percentage),
                },
              });
            }

            // Se a soma das porcentagens não dá 100%, o proprietário do contrato recebe o restante
            const contractOwnerInShares = ownerShares.some(s => s.ownerId === contract.ownerId);
            if (totalSharePercent < 100 && !contractOwnerInShares) {
              const remainingPercent = Math.round((100 - totalSharePercent) * 100) / 100;
              const remainingValue = Math.round(splitOwnerValue * (remainingPercent / 100) * 100) / 100;
              await prisma.ownerEntry.create({
                data: {
                  type: "CREDITO",
                  category: "REPASSE",
                  description: `Repasse aluguel ${mLabel} - ${contract.code} (${remainingPercent}%)`,
                  value: remainingValue,
                  dueDate,
                  status: "PENDENTE",
                  ownerId: contract.ownerId,
                  contractId: contract.id,
                  propertyId: contract.property.id,
                  notes: buildOwnerNotes(remainingPercent),
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
                notes: ownerEntryNotes,
              },
            });
          }
        }

        // Criar créditos no proprietário para lançamentos do locatário com destino=PROPRIETARIO
        // Ex: IPTU cobrado do locatário que deve ser repassado ao proprietário
        const ownerCreditEntries = chargeEntries.filter(
          (e) => e.destination === "PROPRIETARIO"
        );
        for (const tenantEntry of ownerCreditEntries) {
          const categoryMap: Record<string, string> = {
            IPTU: "IPTU",
            CONDOMINIO: "CONDOMINIO",
          };
          const ownerCategory = categoryMap[tenantEntry.category] || tenantEntry.category;
          const installmentLabel = tenantEntry.installmentNumber && tenantEntry.installmentTotal
            ? ` ${tenantEntry.installmentNumber}/${tenantEntry.installmentTotal}`
            : "";

          if (ownerShares && ownerShares.length > 0) {
            const totalSharePctCredits = ownerShares.reduce((s, sh) => s + sh.percentage, 0);

            for (const share of ownerShares) {
              const portion = Math.round(tenantEntry.value * (share.percentage / 100) * 100) / 100;
              await prisma.ownerEntry.create({
                data: {
                  type: "CREDITO",
                  category: ownerCategory,
                  description: `${tenantEntry.category}${installmentLabel} ${mLabel} - ${contract.code} (${share.percentage}%)`,
                  value: portion,
                  dueDate,
                  status: "PENDENTE",
                  ownerId: share.ownerId,
                  contractId: contract.id,
                  propertyId: contract.property?.id,
                  notes: JSON.stringify({
                    tenantEntryId: tenantEntry.id,
                    originalDescription: tenantEntry.description,
                    destination: "PROPRIETARIO",
                  }),
                },
              });
            }

            // Proprietário principal recebe o restante se soma < 100%
            const contractOwnerInSharesCredits = ownerShares.some(s => s.ownerId === contract.ownerId);
            if (totalSharePctCredits < 100 && !contractOwnerInSharesCredits) {
              const remainPct = Math.round((100 - totalSharePctCredits) * 100) / 100;
              const remainVal = Math.round(tenantEntry.value * (remainPct / 100) * 100) / 100;
              await prisma.ownerEntry.create({
                data: {
                  type: "CREDITO",
                  category: ownerCategory,
                  description: `${tenantEntry.category}${installmentLabel} ${mLabel} - ${contract.code} (${remainPct}%)`,
                  value: remainVal,
                  dueDate,
                  status: "PENDENTE",
                  ownerId: contract.ownerId,
                  contractId: contract.id,
                  propertyId: contract.property?.id,
                  notes: JSON.stringify({
                    tenantEntryId: tenantEntry.id,
                    originalDescription: tenantEntry.description,
                    destination: "PROPRIETARIO",
                  }),
                },
              });
            }
          } else {
            await prisma.ownerEntry.create({
              data: {
                type: "CREDITO",
                category: ownerCategory,
                description: `${tenantEntry.category}${installmentLabel} ${mLabel} - ${contract.code}`,
                value: tenantEntry.value,
                dueDate,
                status: "PENDENTE",
                ownerId: contract.ownerId,
                contractId: contract.id,
                propertyId: contract.property?.id,
                notes: JSON.stringify({
                  tenantEntryId: tenantEntry.id,
                  originalDescription: tenantEntry.description,
                  destination: "PROPRIETARIO",
                }),
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
