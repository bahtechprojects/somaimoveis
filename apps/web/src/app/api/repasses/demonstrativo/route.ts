import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/repasses/demonstrativo?ownerId=X&month=YYYY-MM
 * Retorna demonstrativo DETALHADO de pagamentos do proprietario no mes.
 * Formato inspirado no padrao Via Imob (usado pelas contadoras).
 *
 * Agrupa por CONTRATO/IMOVEL, mostra para cada:
 * - Locatario, CPF/CNPJ
 * - Dt inicio e ult. reajuste
 * - Tipo do imovel (loja, sala, casa, etc)
 * - Endereco
 * - Lista de movimentos (entradas e saidas) com data
 * - Totais do contrato
 *
 * E os grandes totais:
 * - Total entradas, saidas, liquido
 * - Separacao PF/PJ para IRRF
 * - Info do pagamento (beneficiario, data, forma, valor)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    const monthStr = searchParams.get("month");

    if (!ownerId) {
      return NextResponse.json({ error: "ownerId obrigatorio" }, { status: 400 });
    }

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
    const periodStart = monthStart.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    const periodEnd = monthEnd.toLocaleDateString("pt-BR", { timeZone: "UTC" });

    const owner = await prisma.owner.findUnique({
      where: { id: ownerId },
    });
    if (!owner) {
      return NextResponse.json({ error: "Proprietario nao encontrado" }, { status: 404 });
    }

    // Buscar TODAS as entries do proprietario no mes (creditos E debitos)
    const entries = await prisma.ownerEntry.findMany({
      where: {
        ownerId,
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          {
            AND: [{ dueDate: null }, { paidAt: { gte: monthStart, lte: monthEnd } }],
          },
          { paidAt: { gte: monthStart, lte: monthEnd } },
        ],
        status: { not: "CANCELADO" },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    // Buscar contratos
    const contractIds = Array.from(
      new Set(entries.map((e) => e.contractId).filter((id): id is string => !!id))
    );
    const contracts = contractIds.length
      ? await prisma.contract.findMany({
          where: { id: { in: contractIds } },
          include: {
            property: {
              select: {
                id: true,
                title: true,
                type: true,
                street: true,
                number: true,
                complement: true,
                neighborhood: true,
                city: true,
                state: true,
              },
            },
            tenant: {
              select: {
                id: true,
                name: true,
                cpfCnpj: true,
                personType: true,
              },
            },
          },
        })
      : [];
    const contractMap = new Map(contracts.map((c) => [c.id, c]));

    // Agrupar por contrato (imovel)
    type Movimento = {
      date: string;
      descricao: string;
      entrada: number;
      saida: number;
    };

    type ContractGroup = {
      contractId: string;
      code: string;
      property: {
        id: string;
        title: string;
        type: string;
        address: string;
      } | null;
      tenant: {
        id: string;
        name: string;
        cpfCnpj: string;
        personType: string;
      } | null;
      startDate: string | null;
      lastAdjustmentDate: string | null;
      movimentos: Movimento[];
      totalEntradas: number;
      totalSaidas: number;
      totalLiquido: number;
      // Para totais PF/PJ
      aluguelBruto: number;
      adminFee: number;
      irrf: number;
    };

    const groups = new Map<string, ContractGroup>();

    // Entries avulsas (sem contrato) vao para um grupo "outros"
    const avulsas: Movimento[] = [];
    let avulsasEntrada = 0;
    let avulsasSaida = 0;

    for (const e of entries) {
      const refDate = e.paidAt || e.dueDate || monthStart;
      const dateStr = new Date(refDate).toLocaleDateString("pt-BR", { timeZone: "UTC" });
      const value = e.value;

      // Interpretar notes se for JSON
      let noteData: any = null;
      if (e.notes) {
        try {
          noteData = JSON.parse(e.notes);
        } catch {
          // notes nao e JSON
        }
      }

      if (!e.contractId || !contractMap.has(e.contractId)) {
        // Entry sem contrato (taxa avulsa, acordo, etc)
        const isCredit = e.type === "CREDITO";
        const mov: Movimento = {
          date: dateStr,
          descricao: e.description,
          entrada: isCredit ? value : 0,
          saida: isCredit ? 0 : value,
        };
        avulsas.push(mov);
        if (isCredit) avulsasEntrada += value;
        else avulsasSaida += value;
        continue;
      }

      const contract = contractMap.get(e.contractId)!;
      if (!groups.has(e.contractId)) {
        const p = contract.property;
        const addr = p
          ? [
              p.street ? `${p.street}${p.number ? ` ${p.number}` : ""}${p.complement ? ` ${p.complement}` : ""}` : null,
              p.neighborhood,
              p.city && p.state ? `${p.city}/${p.state}` : p.city,
            ]
              .filter(Boolean)
              .join(", ")
          : "";

        groups.set(e.contractId, {
          contractId: contract.id,
          code: contract.code,
          property: p
            ? {
                id: p.id,
                title: p.title,
                type: p.type,
                address: addr,
              }
            : null,
          tenant: contract.tenant,
          startDate: contract.startDate.toISOString(),
          lastAdjustmentDate: contract.lastAdjustmentDate?.toISOString() || null,
          movimentos: [],
          totalEntradas: 0,
          totalSaidas: 0,
          totalLiquido: 0,
          aluguelBruto: 0,
          adminFee: 0,
          irrf: 0,
        });
      }

      const g = groups.get(e.contractId)!;

      // Para REPASSE (CREDITO), explodir em: entrada bruta + saida de taxa adm + saida de IRRF
      if (e.type === "CREDITO" && e.category === "REPASSE" && noteData) {
        const bruto = noteData.aluguelBruto || value;
        const adminFee = noteData.adminFeeValue || 0;
        const irrf = noteData.irrfValue || 0;
        const monthRef = `${String(new Date(refDate).getMonth() + 1).padStart(2, "0")}/${new Date(refDate).getFullYear()}`;

        // Entrada: aluguel bruto
        if (bruto > 0) {
          g.movimentos.push({
            date: dateStr,
            descricao: `Aluguel Ref ${monthRef}`,
            entrada: bruto,
            saida: 0,
          });
          g.totalEntradas += bruto;
          g.aluguelBruto += bruto;
        }

        // Saida: taxa de administracao
        if (adminFee > 0) {
          g.movimentos.push({
            date: dateStr,
            descricao: `Taxa de Administracao Aluguel Ref ${monthRef}`,
            entrada: 0,
            saida: adminFee,
          });
          g.totalSaidas += adminFee;
          g.adminFee += adminFee;
        }

        // Saida: IRRF
        if (irrf > 0) {
          g.movimentos.push({
            date: dateStr,
            descricao: `IRRF Retido na Fonte Ref ${monthRef}`,
            entrada: 0,
            saida: irrf,
          });
          g.totalSaidas += irrf;
          g.irrf += irrf;
        }
      } else {
        // Outros tipos de entry: tratar como entrada ou saida simples
        const isCredit = e.type === "CREDITO";
        g.movimentos.push({
          date: dateStr,
          descricao: e.description,
          entrada: isCredit ? value : 0,
          saida: isCredit ? 0 : value,
        });
        if (isCredit) g.totalEntradas += value;
        else g.totalSaidas += value;
      }
    }

    // Calcular totais liquidos por contrato
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const gruposArray = Array.from(groups.values()).map((g) => ({
      ...g,
      totalEntradas: round2(g.totalEntradas),
      totalSaidas: round2(g.totalSaidas),
      totalLiquido: round2(g.totalEntradas - g.totalSaidas),
      aluguelBruto: round2(g.aluguelBruto),
      adminFee: round2(g.adminFee),
      irrf: round2(g.irrf),
    }));

    // Grand totais
    const totalFinalEntradas = round2(
      gruposArray.reduce((s, g) => s + g.totalEntradas, 0) + avulsasEntrada
    );
    const totalFinalSaidas = round2(
      gruposArray.reduce((s, g) => s + g.totalSaidas, 0) + avulsasSaida
    );
    const totalMovimento = round2(totalFinalEntradas - totalFinalSaidas);

    // Separar PF / PJ para a tabela de IR
    const pf = { aluguel: 0, comissao: 0, irrf: 0 };
    const pj = { aluguel: 0, comissao: 0, irrf: 0 };
    for (const g of gruposArray) {
      const isPJ = g.tenant?.personType === "PJ";
      const target = isPJ ? pj : pf;
      target.aluguel += g.aluguelBruto;
      target.comissao += g.adminFee;
      target.irrf += g.irrf;
    }
    pf.aluguel = round2(pf.aluguel);
    pf.comissao = round2(pf.comissao);
    pf.irrf = round2(pf.irrf);
    pj.aluguel = round2(pj.aluguel);
    pj.comissao = round2(pj.comissao);
    pj.irrf = round2(pj.irrf);

    // Info de pagamento (beneficiario, chave pix)
    const beneficiarioName = owner.thirdPartyName || owner.name;
    const chavePix = owner.thirdPartyPix || owner.bankPix;
    const pixType = owner.thirdPartyPixKeyType || owner.bankPixType;
    const bankInfo = owner.thirdPartyBank || owner.bankName;
    const bankAgency = owner.thirdPartyAgency || owner.bankAgency;
    const bankAccount = owner.thirdPartyAccount || owner.bankAccount;
    const formaPagamento = chavePix ? "PIX" : bankAgency && bankAccount ? "TED" : "-";

    // Data de referencia do pagamento: maior paidAt entre entries ou dia de pagamento do proprietario
    const paidAtDates = entries
      .map((e) => e.paidAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime());
    const dataReferencia = paidAtDates[0]
      ? paidAtDates[0].toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : "-";

    return NextResponse.json({
      periodo: { start: periodStart, end: periodEnd, month: mLabel },
      empresa: {
        nome: "Somma Imoveis Ltda",
        cnpj: "40.528.068/0001-62",
      },
      proprietario: {
        id: owner.id,
        name: owner.name,
        cpfCnpj: owner.cpfCnpj,
        personType: owner.personType,
      },
      dataReferenciaPagamento: dataReferencia,
      contratos: gruposArray,
      avulsas,
      totais: {
        entradas: totalFinalEntradas,
        saidas: totalFinalSaidas,
        movimento: totalMovimento,
        saldoMesAnterior: 0,
        valorRetido: 0,
        totalPago: totalMovimento,
      },
      totaisPFPJ: { pf, pj },
      pagamento: {
        beneficiario: beneficiarioName,
        data: dataReferencia,
        forma: formaPagamento,
        chavePix: chavePix || "",
        pixType: pixType || "",
        bank: bankInfo || "",
        agency: bankAgency || "",
        account: bankAccount || "",
        valor: totalMovimento,
      },
    });
  } catch (error) {
    console.error("[Demonstrativo]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
