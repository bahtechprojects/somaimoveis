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

    // Find active contracts (status ATIVO ou PENDENTE_RENOVACAO,
    // started before target month, not ended before it).
    // PENDENTE_RENOVACAO: contrato em fim mas locatario continua pagando
    // ate definirem renovacao — deve gerar cobranca normalmente.
    const contracts = await prisma.contract.findMany({
      where: {
        status: { in: ["ATIVO", "PENDENTE_RENOVACAO"] },
        startDate: { lte: monthEnd },
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
    // Lista detalhada de contratos pulados com motivo
    const skippedDetails: {
      contract: string;
      tenant: string | null;
      reason: string;
    }[] = [];

    for (const contract of contracts) {
      const contractCode = contract.code;
      const tenantName = (contract as any).tenant?.name || null;

      // Skip contracts without tenant (e.g. ADMINISTRACAO, VISTORIA)
      if (!contract.tenantId) {
        skipped++;
        skippedDetails.push({
          contract: contractCode,
          tenant: null,
          reason: `Contrato sem locatario vinculado (tipo ${contract.type || "desconhecido"})`,
        });
        continue;
      }
      // Skip if payment already exists for this contract+month
      if (existingContractIds.has(contract.id)) {
        skipped++;
        skippedDetails.push({
          contract: contractCode,
          tenant: tenantName,
          reason: "Ja existe cobranca para este contrato neste mes",
        });
        continue;
      }

      // Contrato que comeca no mes alvo: pula este mes
      // (paymentDay provavelmente eh anterior ao inicio do contrato)
      // → o pro-rata sera incluido como CATCH-UP no boleto do mes seguinte
      const contractStartDateRaw = new Date(contract.startDate);
      const csYearCheck = contractStartDateRaw.getUTCFullYear();
      const csMonthCheck = contractStartDateRaw.getUTCMonth();
      if (csYearCheck === targetYear && csMonthCheck === targetMonth) {
        skipped++;
        skippedDetails.push({
          contract: contractCode,
          tenant: tenantName,
          reason: `Contrato comeca neste mes — pro-rata sera incluido na 1a cobranca do mes seguinte`,
        });
        console.log(`[Billing] ${contract.code}: pulando mes de inicio. Pro-rata sera adicionado como catch-up na primeira cobranca do proximo mes.`);
        continue;
      }

      try {
        // Detectar se eh a primeira cobranca deste contrato
        // (usado para incluir pro-rata retroativo do mes de inicio quando
        // o contrato comecou em mes anterior e nunca teve cobranca)
        const previousPaymentsCount = await prisma.payment.count({
          where: {
            contractId: contract.id,
            status: { not: "CANCELADO" },
          },
        });
        const isFirstBilling = previousPaymentsCount === 0;
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

        // CATCH-UP PRO-RATA: primeira cobranca do contrato que comecou
        // em mes anterior (mid-month) e nunca teve cobranca gerada.
        // Ex: contrato comecou 20/04, primeira cobranca eh em maio →
        // adiciona pro-rata de abril (dias 20-30) ao boleto de maio.
        let catchUpProrataDays = 0;
        let catchUpProrataValue = 0;
        let catchUpMonthLabel = "";
        const startedBeforeTarget =
          csYear < targetYear ||
          (csYear === targetYear && csMonth < targetMonth);
        if (
          isFirstBilling &&
          !isProrata &&
          startedBeforeTarget &&
          csDay > 1
        ) {
          const startMonthLastDay = new Date(csYear, csMonth + 1, 0).getDate();
          catchUpProrataDays = startMonthLastDay - csDay + 1;
          catchUpProrataValue = Math.round(dailyRate * catchUpProrataDays * 100) / 100;
          catchUpMonthLabel = `${String(csMonth + 1).padStart(2, "0")}/${csYear}`;
          console.log(`[Billing] Catch-up pro-rata ${contract.code}: contrato comecou ${csDay}/${csMonth + 1}/${csYear}, incluindo ${catchUpProrataDays} dias do mes de inicio (R$ ${catchUpProrataValue}) na primeira cobranca de ${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`);
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

        // Total = aluguel (proporcional se pro-rata) + catch-up pro-rata mes anterior + condominio + IPTU + seguro + taxa bancaria + debitos - creditos
        const bankFee = contract.bankFee || 0;
        const insuranceFee = contract.insuranceFee || 0;
        // Aluguel efetivo: pro-rata do mes alvo + catch-up do mes de inicio (se primeira cobranca)
        const effectiveRentalValue = Math.round((prorataRentalValue + catchUpProrataValue) * 100) / 100;
        const totalValue = Math.max(0, Math.round((effectiveRentalValue + condoFee + iptuMonthly + bankFee + insuranceFee + totalDebits - totalCredits) * 100) / 100);

        // Calculate split values (admin fee applies to rental value proporcional + catch-up)
        const adminFee = contract.adminFeePercent || 10;
        let adminFeeBase = Math.round(effectiveRentalValue * (adminFee / 100) * 100) / 100;

        // ============================================================
        // INTERMEDIACAO COM SALDO PENDENTE (rolo)
        // - Divide igual em N parcelas
        // - Se a parcela do mes nao cabe no aluguel disponivel,
        //   o que sobrou vira saldo pendente e e somado a parcela
        //   do mes seguinte
        // ============================================================
        let intermediationParcelaTeorica = 0;  // valor "ideal" da parcela do mes
        let intermediationDescontado = 0;       // quanto foi efetivamente descontado
        let intermediationSaldoNovo = 0;        // saldo que fica pendente
        let intermediationNote = "";
        let intermediationMonthNumber = 0;
        const saldoAnterior = contract.intermediacaoSaldoPendente || 0;

        if (
          contract.intermediationFee != null &&
          contract.intermediationFee > 0
        ) {
          const contractStartDate = new Date(contract.startDate);
          const contractMonthNumber =
            (targetYear - contractStartDate.getFullYear()) * 12 +
            (targetMonth - contractStartDate.getMonth()) + 1;
          intermediationMonthNumber = contractMonthNumber;

          const installments = contract.intermediationInstallments || 1;
          const baseIntermedRental = contract.rentalValue || prorataRentalValue;
          const totalIntermediationValue = baseIntermedRental * (contract.intermediationFee / 100);
          const valorPorParcela = Math.round((totalIntermediationValue / installments) * 100) / 100;

          // Parcela base do mes (apenas durante as parcelas previstas)
          let parcelaBase = 0;
          if (contractMonthNumber >= 1 && contractMonthNumber <= installments) {
            parcelaBase = valorPorParcela;
          }

          // Catch-up: se primeira cobranca e contrato comecou em mes anterior,
          // soma as parcelas que deveriam ter sido cobradas nos meses pulados.
          // Ex: contrato 20/04 com 2 parcelas, 1a cobranca em maio →
          // cobra parcela 1 (catch-up de abril) + parcela 2 (maio).
          let parcelasCatchUp = 0;
          if (isFirstBilling && contractMonthNumber > 1) {
            const parcelasPerdidas = Math.min(contractMonthNumber - 1, installments);
            parcelasCatchUp = Math.round(valorPorParcela * parcelasPerdidas * 100) / 100;
          }

          // Total a cobrar este mes = parcela do mes + parcelas em catch-up + saldo pendente
          intermediationParcelaTeorica = Math.round((parcelaBase + parcelasCatchUp + saldoAnterior) * 100) / 100;
        } else if (saldoAnterior > 0) {
          // Sem intermediacao nova, mas tem saldo pendente → tenta cobrar
          intermediationParcelaTeorica = saldoAnterior;
        }

        // ============================================================
        // CALCULO DO QUE EFETIVAMENTE CABE NO REPASSE
        // ============================================================
        // Regras:
        // 1) PRIMEIRO MES com intermediacao: SEMPRE isenta taxa adm
        //    (Leo: 'no primeiro mes, que tera a intermediacao, o
        //    proprietario nao recebera nada — sem comissao')
        // 2) Se a intermediacao nao cabe no aluguel: primeiro waive
        //    taxa adm; depois desconta o que cabe e acumula saldo
        // 3) Caso contrario: cobra tudo normalmente
        let adminWaived = false;
        let adminWaivedReason = "";

        // REGRA 1: 1o mes do contrato com intermediacao → isentar taxa adm
        // Tambem aplica quando eh a 1a cobranca do contrato (catch-up de meses pulados),
        // ja que inclui a parcela 1 da intermediacao.
        const isPrimeiroMesIntermediacao =
          intermediationMonthNumber === 1 || (isFirstBilling && intermediationMonthNumber > 1);
        if (
          intermediationParcelaTeorica > 0 &&
          isPrimeiroMesIntermediacao &&
          adminFeeBase > 0
        ) {
          adminFeeBase = 0;
          adminWaived = true;
          adminWaivedReason = `Taxa de administracao isenta na 1a cobranca do contrato (inclui parcela 1 da intermediacao)`;
        }

        // Quanto sobra apos cobrar taxa adm (que ja pode ter sido isentada acima)
        const sobraAposAdm = effectiveRentalValue - adminFeeBase;

        // REGRA 2: se ainda nao couber, waive admin (caso 1o mes ja tenha sido isentado, esse if nao pega)
        if (sobraAposAdm < intermediationParcelaTeorica) {
          if (intermediationParcelaTeorica > 0 && adminFeeBase > 0) {
            adminFeeBase = 0;
            adminWaived = true;
            adminWaivedReason = `Taxa de administracao isenta no mes ${intermediationMonthNumber} (intermediacao consome o repasse)`;
          }

          // Recalcula sobra (agora sem taxa adm)
          const sobraSemAdm = effectiveRentalValue;

          if (sobraSemAdm >= intermediationParcelaTeorica) {
            intermediationDescontado = intermediationParcelaTeorica;
            intermediationSaldoNovo = 0;
          } else {
            // Desconta o que tem e gera saldo pendente
            intermediationDescontado = Math.max(0, sobraSemAdm);
            intermediationSaldoNovo = Math.round(
              (intermediationParcelaTeorica - intermediationDescontado) * 100
            ) / 100;
          }
        } else {
          // Cabe tudo normalmente
          intermediationDescontado = intermediationParcelaTeorica;
          intermediationSaldoNovo = 0;
        }

        // Note explicativo
        if (intermediationParcelaTeorica > 0) {
          const installments = contract.intermediationInstallments || 1;
          let noteText = `Intermediação parcela ${intermediationMonthNumber}/${installments}: R$ ${intermediationDescontado.toFixed(2)}`;
          if (saldoAnterior > 0) {
            noteText += ` (inclui saldo anterior R$ ${saldoAnterior.toFixed(2)})`;
          }
          if (intermediationSaldoNovo > 0) {
            noteText += ` — saldo pendente para proximo mes: R$ ${intermediationSaldoNovo.toFixed(2)}`;
          }
          intermediationNote = noteText;
        }

        // intermediationInstallmentValue mantido como o valor efetivamente descontado
        // (compatibilidade com o resto do codigo)
        const intermediationInstallmentValue = intermediationDescontado;

        const splitAdminValue = Math.round((adminFeeBase + intermediationInstallmentValue) * 100) / 100;
        const splitOwnerValue = Math.round((effectiveRentalValue - splitAdminValue) * 100) / 100;

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
        if (catchUpProrataValue > 0) {
          descParts.push(`Pro-rata retroativo ${catchUpMonthLabel} (${catchUpProrataDays} dias - inicio do contrato): R$ ${catchUpProrataValue.toFixed(2)}`);
        }
        if (totalCredits > 0) descParts.push(`Créditos: -R$ ${totalCredits.toFixed(2)}`);
        if (totalDebits > 0) descParts.push(`Débitos: +R$ ${totalDebits.toFixed(2)}`);
        if (condoFee > 0) descParts.push(`Condominio: R$ ${condoFee.toFixed(2)}`);
        if (iptuMonthly > 0) descParts.push(`IPTU: R$ ${iptuMonthly.toFixed(2)}`);
        if (insuranceFee > 0) descParts.push(`Seguro Fianca: R$ ${insuranceFee.toFixed(2)}`);
        if (bankFee > 0) descParts.push(`Taxa Bancaria: R$ ${bankFee.toFixed(2)}`);
        if (intermediationNote) descParts.push(intermediationNote);
        if (adminWaived) descParts.push(adminWaivedReason);
        if (intermediationSaldoNovo > 0) {
          descParts.push(`Saldo intermediacao para proximo mes: R$ ${intermediationSaldoNovo.toFixed(2)}`);
        }

        // Store structured breakdown in notes for programmatic access
        const breakdown: Record<string, unknown> = {
          aluguel: isProrata ? prorataRentalValue : contract.rentalValue,
          aluguelOriginal: isProrata ? contract.rentalValue : undefined,
          isProrata,
          prorataDias: isProrata ? prorataDays : undefined,
          catchUpProrataValue: catchUpProrataValue > 0 ? catchUpProrataValue : undefined,
          catchUpProrataDias: catchUpProrataValue > 0 ? catchUpProrataDays : undefined,
          catchUpMes: catchUpProrataValue > 0 ? catchUpMonthLabel : undefined,
          aluguelEfetivo: catchUpProrataValue > 0 ? effectiveRentalValue : undefined,
          creditos: totalCredits,
          debitos: totalDebits,
          condominio: condoFee,
          iptu: iptuMonthly,
          seguroFianca: insuranceFee,
          taxaBancaria: bankFee,
          total: totalValue,
          adminFeePercent: adminFee,
          adminFeeValue: adminFeeBase,
          adminWaived,
          adminWaivedReason: adminWaived ? adminWaivedReason : undefined,
        };
        if (intermediationInstallmentValue > 0 || intermediationSaldoNovo > 0 || saldoAnterior > 0) {
          breakdown.intermediacao = intermediationInstallmentValue;
          breakdown.intermediacaoMes = intermediationMonthNumber;
          breakdown.intermediacaoParcelaTeorica = intermediationParcelaTeorica;
          breakdown.intermediacaoSaldoAnterior = saldoAnterior;
          breakdown.intermediacaoSaldoNovo = intermediationSaldoNovo;
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

        // Atualizar saldo pendente da intermediacao no contrato (se mudou)
        if (intermediationSaldoNovo !== saldoAnterior) {
          await prisma.contract.update({
            where: { id: contract.id },
            data: { intermediacaoSaldoPendente: intermediationSaldoNovo },
          });
        }

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
        // Taxa adm é sobre o valor total, depois divide pela porcentagem.
        // Se adminWaived (taxa isenta no mes pq intermediacao consumiu o repasse),
        // o totalAdminFeeValue eh ZERO.
        const baseAluguel = effectiveRentalValue;
        const totalAdminFeeValue = adminWaived
          ? 0
          : Math.round(effectiveRentalValue * (adminFee / 100) * 100) / 100;

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

        // Criar DÉBITOS no proprietário para descontos do locatário com destino=PROPRIETARIO
        // Ex: Desconto dado ao locatário que o proprietário absorve
        const ownerDebitEntries = discountEntries.filter(
          (e) => e.destination === "PROPRIETARIO"
        );
        for (const tenantEntry of ownerDebitEntries) {
          const ownerCategory = tenantEntry.category || "DESCONTO";
          const installmentLabel = tenantEntry.installmentNumber && tenantEntry.installmentTotal
            ? ` ${tenantEntry.installmentNumber}/${tenantEntry.installmentTotal}`
            : "";

          if (ownerShares && ownerShares.length > 0) {
            const totalSharePctDebits = ownerShares.reduce((s, sh) => s + sh.percentage, 0);

            for (const share of ownerShares) {
              const portion = Math.round(tenantEntry.value * (share.percentage / 100) * 100) / 100;
              await prisma.ownerEntry.create({
                data: {
                  type: "DEBITO",
                  category: ownerCategory,
                  description: `${tenantEntry.description || tenantEntry.category}${installmentLabel} ${mLabel} - ${contract.code} (${share.percentage}%)`,
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
                    type: "desconto_locatario",
                  }),
                },
              });
            }

            const contractOwnerInSharesDebits = ownerShares.some(s => s.ownerId === contract.ownerId);
            if (totalSharePctDebits < 100 && !contractOwnerInSharesDebits) {
              const remainPct = Math.round((100 - totalSharePctDebits) * 100) / 100;
              const remainVal = Math.round(tenantEntry.value * (remainPct / 100) * 100) / 100;
              await prisma.ownerEntry.create({
                data: {
                  type: "DEBITO",
                  category: ownerCategory,
                  description: `${tenantEntry.description || tenantEntry.category}${installmentLabel} ${mLabel} - ${contract.code} (${remainPct}%)`,
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
                    type: "desconto_locatario",
                  }),
                },
              });
            }
          } else {
            await prisma.ownerEntry.create({
              data: {
                type: "DEBITO",
                category: ownerCategory,
                description: `${tenantEntry.description || tenantEntry.category}${installmentLabel} ${mLabel} - ${contract.code}`,
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
                  type: "desconto_locatario",
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
      skippedDetails,
      totalContratos: contracts.length,
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

    // Inclui TODOS contratos que nao foram cancelados (status ATIVO,
    // PENDENTE_RENOVACAO ou ENCERRADO). Os encerrados aparecem na lista
    // de 'nao geraveis' com motivo, em vez de ficarem invisiveis.
    const contracts = await prisma.contract.findMany({
      where: {
        status: { in: ["ATIVO", "PENDENTE_RENOVACAO", "ENCERRADO"] },
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

    // Contratos pulados com motivo (nao geraveis por algum motivo)
    const skippedContracts: {
      contractCode: string;
      property: string;
      tenant: string;
      reason: string;
    }[] = [];

    const preview = contracts
      .map((c) => {
        // So pula se status=ENCERRADO. Contratos ATIVO/PENDENTE_RENOVACAO
        // com endDate no passado continuam vigentes (renovacao automatica
        // ou aguardando definicao) — devem gerar cobranca normalmente.
        if (c.status === "ENCERRADO") {
          skippedContracts.push({
            contractCode: c.code,
            property: c.property?.title || "—",
            tenant: c.tenant?.name || "—",
            reason: "Contrato encerrado",
          });
          return null;
        }
        // Sem locatario (tipo ADMINISTRACAO/VISTORIA)
        if (!c.tenantId) {
          skippedContracts.push({
            contractCode: c.code,
            property: c.property?.title || "—",
            tenant: "—",
            reason: `Sem locatario (tipo ${c.type || "?"})`,
          });
          return null;
        }
        // Comeca no mes alvo → pula este mes (catch-up no proximo)
        const cs = new Date(c.startDate);
        const csYear = cs.getUTCFullYear();
        const csMonth = cs.getUTCMonth();
        const csDay = cs.getUTCDate();
        if (csYear === targetYear && csMonth === targetMonth) {
          skippedContracts.push({
            contractCode: c.code,
            property: c.property?.title || "—",
            tenant: c.tenant?.name || "—",
            reason: "Inicia neste mes — pro-rata sera adicionado como catch-up na 1a cobranca do mes seguinte",
          });
          return null;
        }

        // Detectar primeira cobranca + catch-up de pro-rata do mes de inicio
        const startedBeforeTarget =
          csYear < targetYear ||
          (csYear === targetYear && csMonth < targetMonth);
        let catchUpDays = 0;
        let catchUpValue = 0;
        let catchUpLabel = "";
        if (startedBeforeTarget && csDay > 1) {
          // Verifica se ja existe alguma cobranca anterior para esse contrato
          // (preview: aproximacao — assume que se nao tem cobranca no mes alvo nem antes esta listado, eh 1a)
          // Para ser preciso, preview poderia consultar payments anteriores; aqui mantemos estimativa.
          const startMonthLastDay = new Date(csYear, csMonth + 1, 0).getDate();
          catchUpDays = startMonthLastDay - csDay + 1;
          catchUpValue = Math.round((c.rentalValue / 30) * catchUpDays * 100) / 100;
          catchUpLabel = `${String(csMonth + 1).padStart(2, "0")}/${csYear}`;
        }

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
          startDate: c.startDate,
          catchUpProrataValue: catchUpValue > 0 ? catchUpValue : undefined,
          catchUpProrataDias: catchUpValue > 0 ? catchUpDays : undefined,
          catchUpMes: catchUpValue > 0 ? catchUpLabel : undefined,
          condoFee,
          iptuMonthly,
          value: totalValue,
          paymentDay: c.paymentDay,
          alreadyExists: existingContractIds.has(c.id),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      total: contracts.length,
      pending: preview.filter((p) => !p.alreadyExists).length,
      existing: preview.filter((p) => p.alreadyExists).length,
      skipped: skippedContracts.length,
      contracts: preview,
      skippedContracts,
    });
  } catch (error) {
    console.error("Erro ao carregar preview:", error);
    return NextResponse.json(
      { error: "Erro ao carregar preview" },
      { status: 500 }
    );
  }
}
