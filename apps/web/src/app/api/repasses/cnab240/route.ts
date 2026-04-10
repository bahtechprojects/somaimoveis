import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import {
  generateCnab240,
  isCnab240Configured,
  type CnabPagamento,
  type CnabFavorecido,
} from "@/lib/cnab240-sicredi";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { month, ownerIds: requestOwnerIds, formaPagamento } = body;

    if (!isCnab240Configured()) {
      return NextResponse.json(
        {
          error:
            "CNAB 240 nao configurado. Preencha as variaveis CNAB_EMPRESA_CNPJ, CNAB_EMPRESA_CONVENIO, CNAB_EMPRESA_AGENCIA, CNAB_EMPRESA_CONTA no .env",
        },
        { status: 400 }
      );
    }

    // Buscar todos os créditos pendentes (REPASSE, IPTU, CONDOMINIO, GARANTIA, etc.)
    const where: Record<string, unknown> = {
      type: "CREDITO",
      status: "PENDENTE",
    };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      where.dueDate = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    }

    if (Array.isArray(requestOwnerIds) && requestOwnerIds.length > 0) {
      where.ownerId = { in: requestOwnerIds };
    }

    const entries = await prisma.ownerEntry.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            cpfCnpj: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            zipCode: true,
            bankName: true,
            bankAgency: true,
            bankAccount: true,
            bankPix: true,
            bankPixType: true,
            thirdPartyName: true,
            thirdPartyDocument: true,
            thirdPartyBank: true,
            thirdPartyAgency: true,
            thirdPartyAccount: true,
            thirdPartyPixKeyType: true,
            thirdPartyPix: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Nenhum repasse pendente encontrado para gerar remessa" },
        { status: 404 }
      );
    }

    // Agrupar por proprietario e somar valores
    const grouped: Record<
      string,
      { owner: (typeof entries)[0]["owner"]; valor: number; refs: string[] }
    > = {};

    for (const entry of entries) {
      const oid = entry.ownerId;
      if (!grouped[oid]) {
        grouped[oid] = { owner: entry.owner, valor: 0, refs: [] };
      }
      grouped[oid].valor += entry.value;
      grouped[oid].refs.push(entry.id);
    }

    // Buscar debitos pendentes para descontar do repasse
    const groupedOwnerIds = Object.keys(grouped);
    const debitEntries = groupedOwnerIds.length > 0
      ? await prisma.ownerEntry.findMany({
          where: {
            type: "DEBITO",
            status: "PENDENTE",
            ownerId: { in: groupedOwnerIds },
          },
          select: { ownerId: true, value: true, id: true },
        })
      : [];

    // Descontar debitos do valor do repasse
    for (const debit of debitEntries) {
      if (grouped[debit.ownerId]) {
        grouped[debit.ownerId].valor -= debit.value;
        grouped[debit.ownerId].refs.push(debit.id); // Incluir ref do debito
      }
    }

    // Montar pagamentos CNAB
    const pagamentos: CnabPagamento[] = [];
    const erros: { proprietario: string; motivo: string }[] = [];

    for (const [, group] of Object.entries(grouped)) {
      const o = group.owner;

      // Pular se valor liquido <= 0 (debitos superam creditos)
      if (group.valor <= 0) {
        erros.push({
          proprietario: o.name,
          motivo: `Valor liquido R$ ${group.valor.toFixed(2)} (debitos superam repasse). Repasse nao gerado.`,
        });
        continue;
      }

      const useThirdParty = !!o.thirdPartyName;

      // Validar dados bancarios
      const agencia = useThirdParty
        ? o.thirdPartyAgency
        : o.bankAgency;
      const conta = useThirdParty
        ? o.thirdPartyAccount
        : o.bankAccount;
      const chavePix = useThirdParty ? o.thirdPartyPix : o.bankPix;

      // Para PIX precisa da chave OU dados bancarios
      // Para TED/CC precisa de agencia e conta
      const forma = formaPagamento || "PIX";
      if (forma === "PIX" && !chavePix && (!agencia || !conta)) {
        erros.push({
          proprietario: o.name,
          motivo: "Sem chave PIX e sem dados bancarios (agencia/conta)",
        });
        continue;
      }
      if ((forma === "TED" || forma === "CC") && (!agencia || !conta)) {
        erros.push({
          proprietario: o.name,
          motivo: "Sem dados bancarios (agencia/conta)",
        });
        continue;
      }

      // Extrair DV da agencia e conta (ultimo caractere se tiver separador)
      const agenciaClean = (agencia || "").replace(/\D/g, "");
      const contaClean = (conta || "").replace(/\D/g, "");

      // Separar DV: assumir ultimo digito como DV se formato "1234-5"
      let agenciaNum = agenciaClean;
      let agenciaDv = " ";
      if ((agencia || "").includes("-")) {
        const parts = (agencia || "").split("-");
        agenciaNum = parts[0].replace(/\D/g, "");
        agenciaDv = parts[1]?.replace(/\D/g, "") || " ";
      }

      let contaNum = contaClean;
      let contaDv = " ";
      if ((conta || "").includes("-")) {
        const parts = (conta || "").split("-");
        contaNum = parts[0].replace(/\D/g, "");
        contaDv = parts[1]?.replace(/\D/g, "") || " ";
      }

      const favorecido: CnabFavorecido = {
        nome: useThirdParty ? o.thirdPartyName! : o.name,
        documento: (
          useThirdParty
            ? o.thirdPartyDocument || o.cpfCnpj
            : o.cpfCnpj
        ).replace(/\D/g, ""),
        banco: (useThirdParty ? o.thirdPartyBank : o.bankName) || "748",
        agencia: agenciaNum,
        agenciaDv,
        conta: contaNum,
        contaDv,
        chavePix: chavePix || undefined,
        tipoChavePix: (useThirdParty
          ? o.thirdPartyPixKeyType
          : o.bankPixType) || undefined,
        endereco: o.street || undefined,
        numero: o.number || undefined,
        complemento: o.complement || undefined,
        bairro: o.neighborhood || undefined,
        cidade: o.city || undefined,
        cep: o.zipCode || undefined,
        uf: o.state || undefined,
      };

      pagamentos.push({
        favorecido,
        valor: Math.round(group.valor * 100) / 100,
        dataPagamento: new Date(),
        documentoEmpresa: `REP-${o.cpfCnpj.replace(/\D/g, "").slice(-8)}`,
        informacoes: `REPASSE ALUGUEL${month ? ` ${month}` : ""}`,
      });
    }

    if (pagamentos.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nenhum pagamento valido para gerar remessa. Verifique os dados bancarios dos proprietarios.",
          erros,
        },
        { status: 400 }
      );
    }

    // Ler e incrementar sequencial automaticamente
    const seqSetting = await prisma.appSetting.findUnique({ where: { key: "cnab_sequencial" } });
    const nextSeq = seqSetting ? (JSON.parse(seqSetting.value) as number) + 1 : 1;

    // Gerar arquivo CNAB 240
    const result = generateCnab240(pagamentos, {
      formaPagamento: formaPagamento || "PIX",
      sequencialArquivo: nextSeq,
    });

    // Salvar sequencial usado
    await prisma.appSetting.upsert({
      where: { key: "cnab_sequencial" },
      update: { value: JSON.stringify(nextSeq) },
      create: { key: "cnab_sequencial", value: JSON.stringify(nextSeq) },
    });

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "X-Total-Pagamentos": String(result.totalPagamentos),
        "X-Valor-Total": String(result.valorTotal),
        "X-Erros": JSON.stringify(erros),
      },
    });
  } catch (error) {
    console.error("[CNAB240] Erro:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar arquivo CNAB 240",
      },
      { status: 500 }
    );
  }
}

// GET - Info sobre configuracao CNAB
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const seqSetting = await prisma.appSetting.findUnique({ where: { key: "cnab_sequencial" } });
  const lastSeq = seqSetting ? (JSON.parse(seqSetting.value) as number) : 0;

  return NextResponse.json({
    configured: isCnab240Configured(),
    empresa: process.env.CNAB_EMPRESA_NOME || null,
    agencia: process.env.CNAB_EMPRESA_AGENCIA || null,
    proximoSequencial: lastSeq + 1,
  });
}

// PUT - Ajustar sequencial manualmente
export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { sequencial } = await request.json();
    if (!sequencial || typeof sequencial !== "number" || sequencial < 0) {
      return NextResponse.json({ error: "Sequencial inválido" }, { status: 400 });
    }
    // Salva o valor anterior ao próximo desejado (próximo = sequencial)
    await prisma.appSetting.upsert({
      where: { key: "cnab_sequencial" },
      update: { value: JSON.stringify(sequencial - 1) },
      create: { key: "cnab_sequencial", value: JSON.stringify(sequencial - 1) },
    });
    return NextResponse.json({ proximoSequencial: sequencial });
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar sequencial" }, { status: 500 });
  }
}
