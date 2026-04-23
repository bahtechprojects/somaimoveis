import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/relatorios/seguro-fianca?month=YYYY-MM
 * Lista contratos com garantia SEGURO_FIANCA e verifica se o seguro foi
 * efetivamente cobrado (lancado no boleto do mes informado).
 *
 * Para cada contrato:
 * - Dados do contrato (codigo, imovel, locatario, proprietario)
 * - Valor do seguro (insuranceFee) cadastrado
 * - Se foi cobrado: busca Payment do mes que contenha "seguro" no description/notes
 *   OU verifica se o payment.value inclui o insuranceFee
 * - Status do ultimo payment (PAGO, PENDENTE, etc)
 */
export async function GET(request: NextRequest) {
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
    const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    // Buscar todos os contratos com garantia SEGURO_FIANCA
    const contracts = await prisma.contract.findMany({
      where: {
        guaranteeType: "SEGURO_FIANCA",
      },
      include: {
        owner: { select: { id: true, name: true, cpfCnpj: true } },
        tenant: { select: { id: true, name: true, cpfCnpj: true, phone: true, email: true } },
        property: { select: { id: true, title: true, street: true, number: true } },
      },
      orderBy: { code: "asc" },
    });

    // Buscar Payments do mes para cada contrato
    const contractIds = contracts.map((c) => c.id);
    const payments = contractIds.length
      ? await prisma.payment.findMany({
          where: {
            contractId: { in: contractIds },
            dueDate: { gte: monthStart, lte: monthEnd },
          },
          select: {
            id: true,
            code: true,
            contractId: true,
            value: true,
            status: true,
            dueDate: true,
            paidAt: true,
            description: true,
            notes: true,
          },
        })
      : [];

    const paymentsByContract = new Map<string, (typeof payments)[number][]>();
    for (const p of payments) {
      if (!p.contractId) continue;
      if (!paymentsByContract.has(p.contractId)) paymentsByContract.set(p.contractId, []);
      paymentsByContract.get(p.contractId)!.push(p);
    }

    const rows = contracts.map((c) => {
      const insuranceFee = c.insuranceFee || 0;
      const contractPayments = paymentsByContract.get(c.id) || [];

      // Verificar se o seguro foi lancado em algum payment
      let foiCobrado = false;
      let paymentMatch: (typeof payments)[number] | null = null;
      let valorCobrado = 0;

      for (const p of contractPayments) {
        // Heuristica 1: description ou notes mencionam "seguro"
        const desc = (p.description || "").toLowerCase();
        let notesHasSeguro = false;
        let seguroDoBreakdown = 0;
        if (p.notes) {
          try {
            const n = JSON.parse(p.notes);
            if (typeof n.seguroFianca === "number" && n.seguroFianca > 0) {
              notesHasSeguro = true;
              seguroDoBreakdown = n.seguroFianca;
            }
          } catch {
            notesHasSeguro = (p.notes || "").toLowerCase().includes("seguro");
          }
        }
        if (desc.includes("seguro") || notesHasSeguro) {
          foiCobrado = true;
          paymentMatch = p;
          valorCobrado = seguroDoBreakdown > 0 ? seguroDoBreakdown : insuranceFee;
          break;
        }
      }

      // Se nao achou por description mas tem payment do mes e valor bate, considerar cobrado
      if (!foiCobrado && insuranceFee > 0) {
        for (const p of contractPayments) {
          // Se o valor do payment eh aluguel + seguro (tolerancia)
          if (Math.abs(p.value - (c.rentalValue + insuranceFee)) < 0.5) {
            foiCobrado = true;
            paymentMatch = p;
            valorCobrado = insuranceFee;
            break;
          }
        }
      }

      return {
        contractId: c.id,
        code: c.code,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate?.toISOString() || null,
        rentalValue: c.rentalValue,
        insuranceFee,
        guaranteeValue: c.guaranteeValue,
        guaranteeNotes: c.guaranteeNotes,
        property: c.property
          ? {
              id: c.property.id,
              title: c.property.title,
              address: [c.property.street, c.property.number].filter(Boolean).join(", "),
            }
          : null,
        owner: c.owner,
        tenant: c.tenant,
        // Info de cobranca do mes
        foiCobrado,
        valorCobrado: Math.round(valorCobrado * 100) / 100,
        paymentCode: paymentMatch?.code || null,
        paymentStatus: paymentMatch?.status || null,
        paymentDueDate: paymentMatch?.dueDate?.toISOString() || null,
        paymentPaidAt: paymentMatch?.paidAt?.toISOString() || null,
        hasAnyPayment: contractPayments.length > 0,
      };
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totais = {
      total: rows.length,
      ativos: rows.filter((r) => r.status === "ATIVO").length,
      cobrados: rows.filter((r) => r.foiCobrado).length,
      naoCobrados: rows.filter((r) => !r.foiCobrado && r.insuranceFee > 0).length,
      semSeguroDefinido: rows.filter((r) => r.insuranceFee === 0).length,
      totalSeguroCadastrado: round2(
        rows.reduce((s, r) => s + r.insuranceFee, 0)
      ),
      totalCobrado: round2(rows.reduce((s, r) => s + r.valorCobrado, 0)),
    };

    return NextResponse.json({
      month: mLabel,
      totais,
      contratos: rows,
    });
  } catch (error) {
    console.error("[Seguro Fianca]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
