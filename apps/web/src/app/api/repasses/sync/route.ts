import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/repasses/sync?month=YYYY-MM
 * Sincroniza os repasses para todos os pagamentos PAGO do mes que ainda nao
 * tem uma OwnerEntry REPASSE correspondente. Util para corrigir pagamentos
 * legados ou criados manualmente fora do fluxo /api/billing/generate.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    let targetYear: number, targetMonth: number;
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

    // Buscar todos os pagamentos PAGO do mes com contratoId e ownerId
    const payments = await prisma.payment.findMany({
      where: {
        status: "PAGO",
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        code: true,
        contractId: true,
        ownerId: true,
        dueDate: true,
        value: true,
        splitOwnerValue: true,
        splitAdminValue: true,
        netToOwner: true,
        irrfValue: true,
        irrfRate: true,
      },
    });

    let criados = 0;
    const detalhes: { payment: string; result: string }[] = [];

    for (const p of payments) {
      if (!p.contractId || !p.ownerId || !p.dueDate) continue;

      // Buscar contrato primeiro para ter rentalValue e adminFee corretos
      const contract = await prisma.contract.findUnique({
        where: { id: p.contractId },
        select: {
          code: true,
          rentalValue: true,
          adminFeePercent: true,
          propertyId: true,
        },
      });

      if (!contract) {
        detalhes.push({ payment: p.code, result: "Contrato nao encontrado, ignorado" });
        continue;
      }

      // Calcular valor do repasse CORRETO:
      // rentalValue - adminFee (taxa de administracao)
      // NAO incluir: taxa bancaria, creditos, debitos diversos
      const adminPct = contract.adminFeePercent || 10;
      const adminFeeValue = Math.round(contract.rentalValue * (adminPct / 100) * 100) / 100;
      const calculatedOwnerValue = Math.round((contract.rentalValue - adminFeeValue) * 100) / 100;

      // Preferir splitOwnerValue do pagamento se existir (foi calculado corretamente em billing/generate)
      const splitValue = p.splitOwnerValue ?? 0;
      const ownerValue = splitValue > 0 ? splitValue : calculatedOwnerValue;

      if (ownerValue <= 0) {
        detalhes.push({ payment: p.code, result: "Valor do repasse zerado, ignorado" });
        continue;
      }

      const existing = await prisma.ownerEntry.findFirst({
        where: {
          contractId: p.contractId,
          dueDate: p.dueDate,
          category: "REPASSE",
        },
      });

      // Se ja existe, verificar se foi auto-criado com valor errado e pode ser corrigido
      if (existing) {
        // So atualiza se: foi auto-criado, esta PENDENTE, e o valor atual difere do correto
        let canAutoFix = false;
        if (existing.status === "PENDENTE" && existing.notes) {
          try {
            const n = JSON.parse(existing.notes);
            if (n.autoCreated === true) {
              canAutoFix = Math.abs(existing.value - ownerValue) > 0.01;
            }
          } catch {
            // ignore
          }
        }

        if (canAutoFix) {
          const notesData = {
            aluguelBruto: contract.rentalValue,
            adminFeePercent: adminPct,
            adminFeeValue,
            irrfValue: p.irrfValue || undefined,
            irrfRate: p.irrfRate || undefined,
            netToOwner: p.netToOwner || ownerValue,
            autoCreated: true,
            syncedFromPayment: p.code,
            recalculated: true,
          };
          await prisma.ownerEntry.update({
            where: { id: existing.id },
            data: { value: ownerValue, notes: JSON.stringify(notesData) },
          });
          detalhes.push({
            payment: p.code,
            result: `Repasse recalculado: R$ ${existing.value.toFixed(2)} -> R$ ${ownerValue.toFixed(2)}`,
          });
          criados++;
        }
        continue;
      }

      const d = new Date(p.dueDate);
      const mLabel = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

      const notesData = {
        aluguelBruto: contract.rentalValue,
        adminFeePercent: adminPct,
        adminFeeValue,
        irrfValue: p.irrfValue || undefined,
        irrfRate: p.irrfRate || undefined,
        netToOwner: p.netToOwner || ownerValue,
        autoCreated: true,
        syncedFromPayment: p.code,
      };

      await prisma.ownerEntry.create({
        data: {
          type: "CREDITO",
          category: "REPASSE",
          description: `Repasse aluguel ${mLabel} - ${contract.code || p.contractId}`,
          value: ownerValue,
          dueDate: p.dueDate,
          status: "PENDENTE",
          ownerId: p.ownerId,
          contractId: p.contractId,
          propertyId: contract.propertyId || null,
          notes: JSON.stringify(notesData),
        },
      });

      criados++;
      detalhes.push({ payment: p.code, result: `Repasse criado: R$ ${ownerValue.toFixed(2)}` });
    }

    // ============================================================
    // PARTE 2 (v3 - cirurgica): propagar APENAS TenantEntries com
    // destination=PROPRIETARIO que foram criados APOS o Payment do mes
    // (ou seja, lancados depois que o billing/generate ja rodou).
    // Isso evita duplicar historico: se o TenantEntry ja estava la
    // quando o billing rodou, o billing ja criou a OwnerEntry correspondente.
    // ============================================================

    function normalizeDesc(s: string): string {
      return (s || "")
        .toLowerCase()
        .replace(/\s*ref\s+\d+\/\d+/gi, "")
        .replace(/\s*-\s*ctr[-\s]?\d+/gi, "")
        .replace(/\s*\(\d+(?:\.\d+)?%\)/g, "")
        .replace(/\s+\d+\/\d+\s*/g, " ")
        .trim();
    }

    // Mapa: contractId -> createdAt mais antigo dos Payments do mes
    const paymentCreatedAtByContract = new Map<string, Date>();
    const paymentsWithCreatedAt = await prisma.payment.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      select: { contractId: true, createdAt: true },
    });
    for (const p of paymentsWithCreatedAt) {
      if (!p.contractId) continue;
      const existing = paymentCreatedAtByContract.get(p.contractId);
      if (!existing || p.createdAt < existing) {
        paymentCreatedAtByContract.set(p.contractId, p.createdAt);
      }
    }

    // Buscar TenantEntries do mes com destination=PROPRIETARIO
    const tenantEntries = await prisma.tenantEntry.findMany({
      where: {
        destination: "PROPRIETARIO",
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      select: {
        id: true,
        type: true,
        category: true,
        description: true,
        value: true,
        dueDate: true,
        tenantId: true,
        createdAt: true,
        installmentNumber: true,
        installmentTotal: true,
      },
    });

    let entriesPropagated = 0;
    const propagadosDet: { tenantEntry: string; result: string }[] = [];
    const skippedDet: { tenantEntry: string; motivo: string }[] = [];

    for (const te of tenantEntries) {
      const contract = await prisma.contract.findFirst({
        where: {
          tenantId: te.tenantId,
          OR: [{ status: "ATIVO" }, { status: "PENDENTE_RENOVACAO" }],
        },
        orderBy: { startDate: "desc" },
        select: { id: true, code: true, ownerId: true, propertyId: true },
      });

      if (!contract) continue;

      // REGRA CIRURGICA: so propagar se o TenantEntry foi criado APOS o
      // primeiro Payment do mes (ou seja, billing ja existia e nao pegou ele)
      const paymentCreatedAt = paymentCreatedAtByContract.get(contract.id);
      if (paymentCreatedAt && te.createdAt <= paymentCreatedAt) {
        // Billing rodou DEPOIS de criar o TenantEntry — deveria ter pego.
        // Se deveria ter pego e nao pegou, assume que foi tratado (dedup).
        skippedDet.push({
          tenantEntry: te.description || te.category,
          motivo: "Ja estava antes do billing (nao e novo)",
        });
        continue;
      }

      // Dedup robusta: buscar OwnerEntries do contrato no mes
      const existingOwnerEntries = await prisma.ownerEntry.findMany({
        where: {
          contractId: contract.id,
          dueDate: { gte: monthStart, lte: monthEnd },
        },
        select: {
          id: true,
          type: true,
          description: true,
          value: true,
          notes: true,
          status: true,
        },
      });

      const teNormDesc = normalizeDesc(te.description || te.category || "");

      const matched = existingOwnerEntries.find((oe) => {
        if (oe.notes) {
          try {
            const n = JSON.parse(oe.notes);
            if (n.tenantEntryId === te.id) return true;
          } catch {
            // ignore
          }
        }
        if (Math.abs(oe.value - te.value) < 0.01) {
          const oeNormDesc = normalizeDesc(oe.description);
          if (
            teNormDesc &&
            oeNormDesc &&
            (oeNormDesc === teNormDesc ||
              oeNormDesc.includes(teNormDesc) ||
              teNormDesc.includes(oeNormDesc))
          ) {
            return true;
          }
        }
        return false;
      });

      if (matched) {
        skippedDet.push({
          tenantEntry: te.description || te.category,
          motivo: `Ja existe (${matched.status})`,
        });
        continue;
      }

      // Criar a OwnerEntry
      const propertyShares = contract.propertyId
        ? await prisma.propertyOwner.findMany({
            where: { propertyId: contract.propertyId },
          })
        : [];

      const ownerType = te.type === "DEBITO" ? "CREDITO" : "DEBITO";
      const installmentLabel =
        te.installmentNumber && te.installmentTotal
          ? ` ${te.installmentNumber}/${te.installmentTotal}`
          : "";

      const d = te.dueDate || monthStart;
      const mRef = `${String(new Date(d).getMonth() + 1).padStart(2, "0")}/${new Date(d).getFullYear()}`;
      const baseDescription = `${te.description || te.category}${installmentLabel} ${mRef} - ${contract.code}`;

      const notesData = {
        tenantEntryId: te.id,
        originalDescription: te.description,
        destination: "PROPRIETARIO",
        type: te.type === "DEBITO" ? "cobranca_locatario" : "desconto_locatario",
        autoCreated: true,
        syncedFromTenant: true,
      };

      if (propertyShares.length > 0) {
        const totalPct = propertyShares.reduce((s, sh) => s + sh.percentage, 0);
        for (const share of propertyShares) {
          const portion = Math.round(te.value * (share.percentage / 100) * 100) / 100;
          await prisma.ownerEntry.create({
            data: {
              type: ownerType,
              category: te.category || (te.type === "DEBITO" ? "OUTROS" : "DESCONTO"),
              description: `${baseDescription} (${share.percentage}%)`,
              value: portion,
              dueDate: te.dueDate,
              status: "PENDENTE",
              ownerId: share.ownerId,
              contractId: contract.id,
              propertyId: contract.propertyId || null,
              notes: JSON.stringify(notesData),
            },
          });
        }
        const contractOwnerInShares = propertyShares.some(
          (s) => s.ownerId === contract.ownerId
        );
        if (totalPct < 100 && !contractOwnerInShares) {
          const remainPct = Math.round((100 - totalPct) * 100) / 100;
          const remainVal = Math.round(te.value * (remainPct / 100) * 100) / 100;
          await prisma.ownerEntry.create({
            data: {
              type: ownerType,
              category: te.category || (te.type === "DEBITO" ? "OUTROS" : "DESCONTO"),
              description: `${baseDescription} (${remainPct}%)`,
              value: remainVal,
              dueDate: te.dueDate,
              status: "PENDENTE",
              ownerId: contract.ownerId,
              contractId: contract.id,
              propertyId: contract.propertyId || null,
              notes: JSON.stringify(notesData),
            },
          });
        }
      } else {
        await prisma.ownerEntry.create({
          data: {
            type: ownerType,
            category: te.category || (te.type === "DEBITO" ? "OUTROS" : "DESCONTO"),
            description: baseDescription,
            value: te.value,
            dueDate: te.dueDate,
            status: "PENDENTE",
            ownerId: contract.ownerId,
            contractId: contract.id,
            propertyId: contract.propertyId || null,
            notes: JSON.stringify(notesData),
          },
        });
      }

      entriesPropagated++;
      const sinal = ownerType === "CREDITO" ? "+" : "-";
      propagadosDet.push({
        tenantEntry: te.description || te.category,
        result: `${ownerType}: ${sinal} R$ ${te.value.toFixed(2)} (${contract.code})`,
      });
    }

    const totalAcoes = criados + entriesPropagated;

    return NextResponse.json({
      month: `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`,
      totalPagamentos: payments.length,
      repassesCriados: criados,
      entriesPropagadas: entriesPropagated,
      entriesIgnoradas: skippedDet.length,
      mensagem:
        totalAcoes === 0
          ? skippedDet.length > 0
            ? `Tudo sincronizado. ${skippedDet.length} lancamento(s) ja existia(m).`
            : "Tudo sincronizado. Nenhuma acao necessaria."
          : `${criados} repasse(s) criado(s) e ${entriesPropagated} lancamento(s) propagado(s)${
              skippedDet.length > 0 ? ` (${skippedDet.length} ignorado(s))` : ""
            }.`,
      detalhes: [
        ...detalhes,
        ...propagadosDet.map((d) => ({ payment: d.tenantEntry, result: d.result })),
      ],
      ignorados: skippedDet,
    });
  } catch (error) {
    console.error("[Repasses Sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar repasses" },
      { status: 500 }
    );
  }
}
