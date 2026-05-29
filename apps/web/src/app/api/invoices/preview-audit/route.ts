/**
 * GET /api/invoices/preview-audit?month=YYYY-MM
 *
 * Dry-run de emissão de NFs. Agrupa por (contractId, ano-mês) — modelo
 * Cenário B: 1 NF por contrato/mês (não por entry). Pra cada par,
 * calcula o valor da NF, busca dados de owner/property, valida tudo,
 * retorna relatório executivo SEM emitir nada.
 *
 * Use antes de clicar "Emitir" pra revisar o que vai sair.
 *
 * Validações:
 *   🔴 BLOQUEANTE — impede emissão
 *   🟡 AVISO      — emite mas com risco/observação
 *   ℹ️ INFO       — só informativo
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePagePermission, isAuthError } from "@/lib/api-auth";
import { getAliquotaParaCompetencia } from "@/lib/fiscal-aliquota";

type Severity = "BLOQUEANTE" | "AVISO" | "INFO";

interface Validation {
  severity: Severity;
  code: string;
  message: string;
}

interface AuditItem {
  // chave única
  contractId: string | null;
  ano: number;
  mes: number;

  // dados do owner (tomador)
  ownerId: string;
  ownerName: string;
  ownerCpfCnpj: string;
  ownerCpfCnpjValido: boolean;
  ownerDocLimpo: string; // só dígitos
  ownerEmail: string | null;
  ownerEnderecoOk: boolean;
  naoDeclaraImob: boolean;

  // dados do contrato
  contractCode: string | null;
  contractStatus: string | null;

  // dados do imóvel (ibsCbs.property)
  propertyId: string | null;
  propertyAddress: string | null;
  propertyEnderecoCompleto: boolean;

  // valor da NF
  valorNF: number;
  valorOrigem: "REPASSE_NOTES" | "REPASSE_CALC" | "INTERMEDIACAO_ENTRY" | "MISSING";

  // alíquota
  aliquotaIss: number;
  aliquotaIssOrigem: "MENSAL" | "ANTERIOR" | "GLOBAL" | "DEFAULT";
  aliquotaCompetenciaUsada: string | null; // YYYY-MM se vier de ANTERIOR

  // entries que originam essa NF
  sourceEntries: Array<{
    id: string;
    category: string;
    value: number;
    dueDate: string;
  }>;

  // invoice já existente (se houver)
  invoiceExistente: {
    id: string;
    numero: string | null;
    status: string;
    chaveAcesso: string | null;
  } | null;

  // validações
  validations: Validation[];
  canEmit: boolean;
  hasWarnings: boolean;
}

function isValidCpfCnpj(doc: string): boolean {
  const onlyDigits = doc.replace(/\D/g, "");
  if (onlyDigits.length !== 11 && onlyDigits.length !== 14) return false;
  // todos os dígitos iguais (000000... / 111111...) = inválido
  if (/^(\d)\1+$/.test(onlyDigits)) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const auth = await requirePagePermission("notas_fiscais");
  if (isAuthError(auth)) return auth;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: "Informe ?month=YYYY-MM" },
      { status: 400 },
    );
  }

  const [y, m] = month.split("-").map(Number);
  const inicio = new Date(y, m - 1, 1);
  const fim = new Date(y, m, 1);

  // Configurações fiscais
  const settings = await prisma.fiscalSettings.findFirst();
  if (!settings) {
    return NextResponse.json(
      { error: "FiscalSettings não configurado" },
      { status: 400 },
    );
  }

  // Carrega TODAS as entries relevantes do mês (REPASSE + INTERMEDIACAO)
  const entries = await prisma.ownerEntry.findMany({
    where: {
      type: "CREDITO",
      category: { in: ["REPASSE", "INTERMEDIACAO"] },
      dueDate: { gte: inicio, lt: fim },
      status: { not: "CANCELADO" },
    },
    include: {
      owner: {
        select: {
          id: true, name: true, cpfCnpj: true, personType: true,
          street: true, number: true, neighborhood: true, city: true,
          state: true, zipCode: true, email: true,
          naoDeclaraImob: true,
        },
      },
      invoice: {
        select: {
          id: true, numero: true, status: true, chaveAcesso: true,
        },
      },
    },
  });

  // Agrupa por (contractId, ano-mês). null contractId vira chave separada.
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = `${e.contractId || "NULL"}_${y}-${String(m).padStart(2, "0")}_${e.ownerId}`;
    const arr = groups.get(key) || [];
    arr.push(e);
    groups.set(key, arr);
  }

  // Busca contracts + properties dos grupos
  const contractIds = [...new Set(entries.map((e) => e.contractId).filter((id): id is string => !!id))];
  const contracts = contractIds.length > 0
    ? await prisma.contract.findMany({
        where: { id: { in: contractIds } },
        select: {
          id: true, code: true, status: true,
          rentalValue: true, adminFeePercent: true,
          property: {
            select: {
              id: true, street: true, number: true, complement: true,
              neighborhood: true, city: true, state: true, zipCode: true,
              type: true,
            },
          },
        },
      })
    : [];
  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  const items: AuditItem[] = [];

  for (const [, groupEntries] of groups) {
    // Pega entries dessa NF (1 contrato/mês = 1 NF)
    const repasse = groupEntries.find((e) => e.category === "REPASSE");
    const intermediacao = groupEntries.find((e) => e.category === "INTERMEDIACAO");
    const principal = repasse || intermediacao!;
    const owner = principal.owner;
    const contract = principal.contractId ? contractMap.get(principal.contractId) : null;
    const validations: Validation[] = [];

    // Calcula valor da NF
    let valorNF = 0;
    let valorOrigem: AuditItem["valorOrigem"] = "MISSING";

    // 1. Tenta do JSON notes do REPASSE
    if (repasse?.notes) {
      try {
        const n = JSON.parse(repasse.notes);
        if (typeof n.adminFeeValue === "number" && n.adminFeeValue > 0) {
          valorNF = n.adminFeeValue;
          valorOrigem = "REPASSE_NOTES";
        }
      } catch { /* ignore */ }
    }

    // 2. Calcula com aluguelBruto * percent
    if (valorNF === 0 && repasse?.notes && contract) {
      try {
        const n = JSON.parse(repasse.notes);
        if (typeof n.aluguelBruto === "number") {
          const pct = (contract.adminFeePercent || 10);
          valorNF = Math.round(n.aluguelBruto * (pct / 100) * 100) / 100;
          valorOrigem = "REPASSE_CALC";
        }
      } catch { /* ignore */ }
    }

    // 3. Fallback: usa o INTERMEDIACAO direto
    if (valorNF === 0 && intermediacao) {
      valorNF = Number(intermediacao.value);
      valorOrigem = "INTERMEDIACAO_ENTRY";
    }

    // Resolve alíquota
    const aliqEfetiva = await getAliquotaParaCompetencia(
      y, m,
      settings.aliquotaIss,
      settings.simplesAliquota,
    );

    // === VALIDAÇÕES ===

    // 🔴 BLOQUEANTES
    if (!owner.cpfCnpj) {
      validations.push({
        severity: "BLOQUEANTE",
        code: "OWNER_SEM_DOC",
        message: "Owner sem CPF/CNPJ cadastrado",
      });
    } else if (!isValidCpfCnpj(owner.cpfCnpj)) {
      validations.push({
        severity: "BLOQUEANTE",
        code: "OWNER_DOC_INVALIDO",
        message: `CPF/CNPJ inválido: ${owner.cpfCnpj}`,
      });
    }

    if (!owner.name || owner.name.trim().length < 3) {
      validations.push({
        severity: "BLOQUEANTE",
        code: "OWNER_SEM_NOME",
        message: "Owner sem nome",
      });
    }

    if (valorNF <= 0) {
      validations.push({
        severity: "BLOQUEANTE",
        code: "VALOR_INVALIDO",
        message: `Valor da NF zerado ou negativo: R$ ${valorNF.toFixed(2)}`,
      });
    }

    if (principal.invoice?.status === "AUTORIZADA") {
      validations.push({
        severity: "BLOQUEANTE",
        code: "JA_EMITIDA",
        message: `Já tem NF AUTORIZADA (#${principal.invoice.numero || "?"})`,
      });
    }

    // 🟡 AVISOS
    if (!contract) {
      validations.push({
        severity: "AVISO",
        code: "SEM_CONTRATO",
        message: "Entry não tem contrato vinculado",
      });
    } else if (contract.status === "RESCINDIDO") {
      validations.push({
        severity: "AVISO",
        code: "CONTRATO_RESCINDIDO",
        message: `Contrato ${contract.code} está RESCINDIDO — deveria gerar NF?`,
      });
    }

    const propertyEnderecoCompleto = !!(
      contract?.property?.street &&
      contract.property.number &&
      contract.property.zipCode &&
      contract.property.city
    );
    if (!contract?.property) {
      validations.push({
        severity: "AVISO",
        code: "SEM_IMOVEL",
        message: "Contrato sem Property vinculado — ibsCbs.property será omitido (pode dar E0932 na prefeitura)",
      });
    } else if (!propertyEnderecoCompleto) {
      validations.push({
        severity: "AVISO",
        code: "IMOVEL_INCOMPLETO",
        message: "Imóvel sem endereço completo (faltam street/number/city/CEP)",
      });
    }

    if (aliqEfetiva.origem === "DEFAULT") {
      validations.push({
        severity: "AVISO",
        code: "ALIQUOTA_DEFAULT",
        message: "Nenhuma alíquota cadastrada — vai usar 2% padrão",
      });
    } else if (aliqEfetiva.origem === "ANTERIOR") {
      validations.push({
        severity: "INFO",
        code: "ALIQUOTA_FALLBACK",
        message: `Alíquota vem de ${aliqEfetiva.competenciaUsada?.ano}-${String(aliqEfetiva.competenciaUsada?.mes).padStart(2, "0")} (fallback do mês anterior)`,
      });
    }

    // Cross-check entre REPASSE.notes.adminFeeValue e INTERMEDIACAO.value
    if (repasse?.notes && intermediacao) {
      try {
        const n = JSON.parse(repasse.notes);
        if (typeof n.adminFeeValue === "number") {
          const diff = Math.abs(n.adminFeeValue - Number(intermediacao.value));
          if (diff > 0.01) {
            validations.push({
              severity: "AVISO",
              code: "DIVERGENCIA_VALOR",
              message: `Valor diverge: REPASSE.notes=R$${n.adminFeeValue.toFixed(2)} vs INTERMEDIACAO=R$${Number(intermediacao.value).toFixed(2)} (usando ${valorOrigem})`,
            });
          }
        }
      } catch { /* ignore */ }
    }

    if (owner.naoDeclaraImob) {
      validations.push({
        severity: "AVISO",
        code: "NAO_DECLARA",
        message: "Owner com 'não declara imóvel' — emissão será suprimida",
      });
    }

    const enderecoOwnerOk = !!(owner.street && owner.city);
    if (!enderecoOwnerOk) {
      validations.push({
        severity: "AVISO",
        code: "OWNER_SEM_ENDERECO",
        message: "Owner sem endereço — Spedy aceita, mas DIMOB pode reclamar",
      });
    }

    // ℹ️ INFO
    if (principal.invoice?.status === "CANCELADA") {
      validations.push({
        severity: "INFO",
        code: "RE_EMISSAO",
        message: `Re-emissão (NF anterior #${principal.invoice.numero || "?"} foi cancelada)`,
      });
    }
    if (principal.invoice?.status === "REJEITADA") {
      validations.push({
        severity: "INFO",
        code: "RE_TENTATIVA_APOS_REJEICAO",
        message: "Nova tentativa após rejeição anterior",
      });
    }

    const propertyAddress = contract?.property
      ? `${contract.property.street || ""}, ${contract.property.number || "S/N"}${contract.property.complement ? " " + contract.property.complement : ""} - ${contract.property.neighborhood || ""}, ${contract.property.city || ""}/${contract.property.state || ""}`
      : null;

    const blocking = validations.filter((v) => v.severity === "BLOQUEANTE");
    const warnings = validations.filter((v) => v.severity === "AVISO");

    items.push({
      contractId: principal.contractId,
      ano: y,
      mes: m,

      ownerId: owner.id,
      ownerName: owner.name,
      ownerCpfCnpj: owner.cpfCnpj || "",
      ownerCpfCnpjValido: isValidCpfCnpj(owner.cpfCnpj || ""),
      ownerDocLimpo: (owner.cpfCnpj || "").replace(/\D/g, ""),
      ownerEmail: owner.email,
      ownerEnderecoOk: enderecoOwnerOk,
      naoDeclaraImob: !!owner.naoDeclaraImob,

      contractCode: contract?.code || null,
      contractStatus: contract?.status || null,

      propertyId: contract?.property?.id || null,
      propertyAddress,
      propertyEnderecoCompleto,

      valorNF,
      valorOrigem,

      aliquotaIss: aliqEfetiva.aliquotaIss,
      aliquotaIssOrigem: aliqEfetiva.origem,
      aliquotaCompetenciaUsada: aliqEfetiva.competenciaUsada
        ? `${aliqEfetiva.competenciaUsada.ano}-${String(aliqEfetiva.competenciaUsada.mes).padStart(2, "0")}`
        : null,

      sourceEntries: groupEntries.map((e) => ({
        id: e.id,
        category: e.category,
        value: Number(e.value),
        dueDate: e.dueDate?.toISOString().slice(0, 10) || "",
      })),

      invoiceExistente: principal.invoice
        ? {
            id: principal.invoice.id,
            numero: principal.invoice.numero,
            status: principal.invoice.status,
            chaveAcesso: principal.invoice.chaveAcesso,
          }
        : null,

      validations,
      canEmit: blocking.length === 0 && !owner.naoDeclaraImob,
      hasWarnings: warnings.length > 0,
    });
  }

  // Ordena por owner, depois contrato
  items.sort((a, b) => {
    const o = a.ownerName.localeCompare(b.ownerName, "pt-BR");
    if (o !== 0) return o;
    return (a.contractCode || "").localeCompare(b.contractCode || "");
  });

  // Summary
  const summary = {
    month,
    totalItens: items.length,
    totalCanEmit: items.filter((i) => i.canEmit).length,
    totalBloqueados: items.filter((i) => !i.canEmit).length,
    totalComAvisos: items.filter((i) => i.hasWarnings && i.canEmit).length,
    totalSuprimidos: items.filter((i) => i.naoDeclaraImob).length,
    totalReEmissao: items.filter((i) =>
      i.invoiceExistente?.status === "CANCELADA" ||
      i.invoiceExistente?.status === "REJEITADA"
    ).length,
    valorTotalAEmitir: Number(
      items
        .filter((i) => i.canEmit)
        .reduce((sum, i) => sum + i.valorNF, 0)
        .toFixed(2)
    ),
    valorTotalBloqueado: Number(
      items
        .filter((i) => !i.canEmit)
        .reduce((sum, i) => sum + i.valorNF, 0)
        .toFixed(2)
    ),
    // Breakdown por owner
    porOwner: Array.from(
      items.reduce((acc, i) => {
        const cur = acc.get(i.ownerId) || {
          ownerId: i.ownerId,
          ownerName: i.ownerName,
          qtdNotas: 0,
          valorTotal: 0,
          qtdBloqueados: 0,
        };
        cur.qtdNotas += 1;
        cur.valorTotal = Number((cur.valorTotal + i.valorNF).toFixed(2));
        if (!i.canEmit) cur.qtdBloqueados += 1;
        acc.set(i.ownerId, cur);
        return acc;
      }, new Map<string, { ownerId: string; ownerName: string; qtdNotas: number; valorTotal: number; qtdBloqueados: number }>())
        .values()
    ).sort((a, b) => b.valorTotal - a.valorTotal),
  };

  return NextResponse.json({ summary, items });
}
