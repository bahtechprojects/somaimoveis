import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/relatorios/extrato-proprietario?ownerId=X&year=YYYY
 * Extrato anual de repasses do proprietario para declaracao de IR.
 * Agrupa por mes: aluguel bruto, taxa adm, IRRF, liquido recebido.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    const yearStr = searchParams.get("year");

    if (!ownerId) {
      return NextResponse.json({ error: "ownerId obrigatorio" }, { status: 400 });
    }

    const year = yearStr && /^\d{4}$/.test(yearStr) ? parseInt(yearStr) : new Date().getFullYear();

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        name: true,
        cpfCnpj: true,
        personType: true,
        street: true,
        number: true,
        complement: true,
        neighborhood: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });

    if (!owner) {
      return NextResponse.json({ error: "Proprietario nao encontrado" }, { status: 404 });
    }

    // Buscar todas as entries de REPASSE PAGO do ano
    const entries = await prisma.ownerEntry.findMany({
      where: {
        ownerId,
        type: "CREDITO",
        category: "REPASSE",
        status: "PAGO",
        OR: [
          { paidAt: { gte: yearStart, lte: yearEnd } },
          {
            AND: [{ paidAt: null }, { dueDate: { gte: yearStart, lte: yearEnd } }],
          },
        ],
      },
      orderBy: [{ paidAt: "asc" }, { dueDate: "asc" }],
    });

    // Buscar contratos relacionados para pegar propriedades
    const contractIds = Array.from(
      new Set(entries.map((e) => e.contractId).filter((id): id is string => !!id))
    );
    const contracts = contractIds.length
      ? await prisma.contract.findMany({
          where: { id: { in: contractIds } },
          select: {
            id: true,
            code: true,
            rentalValue: true,
            adminFeePercent: true,
            property: { select: { id: true, title: true } },
            tenant: { select: { id: true, name: true, cpfCnpj: true } },
          },
        })
      : [];
    const contractMap = new Map(contracts.map((c) => [c.id, c]));

    // Agrupar por mes
    const monthData: Record<
      number,
      {
        month: number;
        aluguelBruto: number;
        adminFee: number;
        irrf: number;
        liquido: number;
        lancamentos: number;
      }
    > = {};
    for (let m = 0; m < 12; m++) {
      monthData[m] = {
        month: m,
        aluguelBruto: 0,
        adminFee: 0,
        irrf: 0,
        liquido: 0,
        lancamentos: 0,
      };
    }

    const detalhes: Array<{
      date: string;
      month: number;
      contractCode: string;
      propertyTitle: string;
      tenantName: string;
      aluguelBruto: number;
      adminFee: number;
      irrf: number;
      liquido: number;
    }> = [];

    for (const e of entries) {
      const refDate = e.paidAt || e.dueDate || yearStart;
      const m = new Date(refDate).getMonth();

      let aluguelBruto = 0;
      let adminFee = 0;
      let irrf = 0;
      let liquido = e.value;

      if (e.notes) {
        try {
          const n = JSON.parse(e.notes);
          if (typeof n.aluguelBruto === "number") aluguelBruto = n.aluguelBruto;
          if (typeof n.adminFeeValue === "number") adminFee = n.adminFeeValue;
          if (typeof n.irrfValue === "number") irrf = n.irrfValue;
          if (typeof n.netToOwner === "number") liquido = n.netToOwner;
        } catch {
          // notes nao eh JSON
        }
      }

      // Fallback: se nao tem dados nos notes, usa contract + value
      const contract = e.contractId ? contractMap.get(e.contractId) : null;
      if (aluguelBruto === 0 && contract) {
        aluguelBruto = contract.rentalValue;
        const pct = contract.adminFeePercent || 10;
        adminFee = Math.round(aluguelBruto * (pct / 100) * 100) / 100;
      }

      monthData[m].aluguelBruto += aluguelBruto;
      monthData[m].adminFee += adminFee;
      monthData[m].irrf += irrf;
      monthData[m].liquido += liquido;
      monthData[m].lancamentos += 1;

      detalhes.push({
        date: refDate.toISOString(),
        month: m,
        contractCode: contract?.code || "-",
        propertyTitle: contract?.property?.title || "-",
        tenantName: contract?.tenant?.name || "-",
        aluguelBruto,
        adminFee,
        irrf,
        liquido,
      });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const meses = Object.values(monthData).map((m) => ({
      month: m.month,
      aluguelBruto: round2(m.aluguelBruto),
      adminFee: round2(m.adminFee),
      irrf: round2(m.irrf),
      liquido: round2(m.liquido),
      lancamentos: m.lancamentos,
    }));

    const totais = {
      aluguelBruto: round2(meses.reduce((s, m) => s + m.aluguelBruto, 0)),
      adminFee: round2(meses.reduce((s, m) => s + m.adminFee, 0)),
      irrf: round2(meses.reduce((s, m) => s + m.irrf, 0)),
      liquido: round2(meses.reduce((s, m) => s + m.liquido, 0)),
      lancamentos: meses.reduce((s, m) => s + m.lancamentos, 0),
    };

    return NextResponse.json({
      year,
      owner,
      meses,
      totais,
      detalhes,
    });
  } catch (error) {
    console.error("[Extrato Proprietario]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
