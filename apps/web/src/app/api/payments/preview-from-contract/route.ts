import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/payments/preview-from-contract?contractId=X&dueDate=YYYY-MM-DD
 *
 * Calcula a composicao COMPLETA do boleto pra um contrato em uma data,
 * incluindo:
 *  - Aluguel base (com pro-rata se for primeiro/ultimo mes do contrato)
 *  - Condominio mensal
 *  - IPTU mensal (1/12 do anual cadastrado no imovel)
 *  - Seguro fianca
 *  - Taxa bancaria
 *  - TenantEntries pendentes do mes (creditos + debitos)
 *  - Total final sugerido
 *
 * Usado pelo form "Nova Cobranca" pra pre-popular o valor com tudo que
 * o billing/generate automatico calcularia. Replica a logica de
 * /api/billing/generate sem efeitos colaterais (somente leitura).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    const dueDateStr = searchParams.get("dueDate");

    if (!contractId || !dueDateStr) {
      return NextResponse.json(
        { error: "contractId e dueDate sao obrigatorios" },
        { status: 400 }
      );
    }

    const dueDate = new Date(dueDateStr.includes("T") ? dueDateStr : dueDateStr + "T12:00:00");
    if (isNaN(dueDate.getTime())) {
      return NextResponse.json(
        { error: "dueDate invalida" },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        property: { select: { id: true, condoFee: true, iptuValue: true } },
        tenant: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contrato nao encontrado" }, { status: 404 });
    }

    const refMonth = dueDate.getMonth();
    const refYear = dueDate.getFullYear();
    const monthStart = new Date(refYear, refMonth, 1);
    const monthEnd = new Date(refYear, refMonth + 1, 1);

    // Pro-rata: se o contrato comecou no meio do mes ou termina no meio
    const startDate = contract.startDate;
    const endDate = contract.endDate;
    const csYear = startDate.getFullYear();
    const csMonth = startDate.getMonth();
    const csDay = startDate.getDate();
    const isFirstMonth = csYear === refYear && csMonth === refMonth;

    let isProrata = false;
    let prorataDays = 30;
    if (isFirstMonth && csDay > 1) {
      isProrata = true;
      prorataDays = 30 - csDay + 1;
    }
    const ceYear = endDate.getFullYear();
    const ceMonth = endDate.getMonth();
    const ceDay = endDate.getDate();
    const isLastMonth = ceYear === refYear && ceMonth === refMonth;
    if (isLastMonth && ceDay < 30 && !isFirstMonth) {
      isProrata = true;
      prorataDays = ceDay;
    }

    const dailyRate = contract.rentalValue / 30;
    const prorataRentalValue = isProrata
      ? Math.round(dailyRate * prorataDays * 100) / 100
      : contract.rentalValue;

    const condoFee = contract.property?.condoFee || 0;
    const iptuMonthly = contract.property?.iptuValue
      ? Math.round((contract.property.iptuValue / 12) * 100) / 100
      : 0;
    const bankFee = contract.bankFee || 0;
    const insuranceFee = contract.insuranceFee || 0;

    // TenantEntries pendentes do mes — creditos (descontos) e debitos (extras)
    const tenantEntries = await prisma.tenantEntry.findMany({
      where: {
        tenantId: contract.tenantId || undefined,
        status: "PENDENTE",
        OR: [
          { dueDate: { gte: monthStart, lt: monthEnd } },
          { dueDate: null },
        ],
      },
    });

    const creditos = tenantEntries.filter((e) => e.type === "CREDITO");
    const debitos = tenantEntries.filter((e) => e.type === "DEBITO");
    const totalCredits = creditos.reduce((s, e) => s + e.value, 0);
    const totalDebits = debitos.reduce((s, e) => s + e.value, 0);

    const totalValue = Math.max(
      0,
      Math.round(
        (prorataRentalValue + condoFee + iptuMonthly + bankFee + insuranceFee + totalDebits - totalCredits) * 100
      ) / 100
    );

    return NextResponse.json({
      contract: {
        id: contract.id,
        code: contract.code,
        rentalValue: contract.rentalValue,
        adminFeePercent: contract.adminFeePercent,
        tenantId: contract.tenantId,
        ownerId: contract.ownerId,
        tenantName: contract.tenant?.name,
        ownerName: contract.owner?.name,
      },
      composicao: {
        aluguel: prorataRentalValue,
        aluguelOriginal: contract.rentalValue,
        isProrata,
        prorataDays,
        condoFee,
        iptuMonthly,
        bankFee,
        insuranceFee,
        totalCredits,
        totalDebits,
      },
      lancamentos: tenantEntries.map((e) => ({
        id: e.id,
        type: e.type,
        category: e.category,
        description: e.description,
        value: e.value,
        installmentNumber: e.installmentNumber,
        installmentTotal: e.installmentTotal,
        destination: e.destination,
      })),
      totalSugerido: totalValue,
    });
  } catch (error) {
    console.error("[Payments preview-from-contract] Erro:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
