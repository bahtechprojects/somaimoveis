import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import {
  sicrediCreateBoleto,
  sicrediPrintBoleto,
  sicrediCancelBoleto,
} from "@/lib/sicredi-client";
import type { CreateBoletoParams } from "@/lib/sicredi-client";

function tipoPessoa(cpfCnpj: string): "PESSOA_FISICA" | "PESSOA_JURIDICA" {
  return cpfCnpj.replace(/\D/g, "").length === 11
    ? "PESSOA_FISICA"
    : "PESSOA_JURIDICA";
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Gera linhas informativas para o boleto a partir do breakdown (notes JSON).
 * Sicredi aceita até 5 linhas de informativo no boleto.
 */
function buildInformativos(notes: string | null): string[] {
  const fallback = ["Cobranca de aluguel"];
  if (!notes) return fallback;
  try {
    const b = JSON.parse(notes);
    const lines: string[] = [];

    // Linha 1: Aluguel + taxa bancaria
    let line1 = `Aluguel: R$ ${formatBRL(b.aluguel || 0)}`;
    if ((b.taxaBancaria || 0) > 0) line1 += ` | Tx Banc: R$ ${formatBRL(b.taxaBancaria)}`;
    lines.push(line1.slice(0, 80));

    // Linha 2: Condominio + IPTU + Seguro
    const parts2: string[] = [];
    if ((b.condominio || 0) > 0) parts2.push(`Cond: R$ ${formatBRL(b.condominio)}`);
    if ((b.iptu || 0) > 0) parts2.push(`IPTU: R$ ${formatBRL(b.iptu)}`);
    if ((b.seguroFianca || 0) > 0) parts2.push(`Seguro: R$ ${formatBRL(b.seguroFianca)}`);
    if (parts2.length > 0) lines.push(parts2.join(" | ").slice(0, 80));

    // Linha 3-4: Lançamentos (débitos e créditos)
    if (b.lancamentos && Array.isArray(b.lancamentos) && b.lancamentos.length > 0) {
      const debitos = b.lancamentos.filter((l: any) => l.tipo === "DEBITO");
      const creditos = b.lancamentos.filter((l: any) => l.tipo === "CREDITO");

      if (debitos.length > 0) {
        const debLine = debitos.map((l: any) => `(+) ${l.descricao}: R$ ${formatBRL(l.valor)}`).join(" | ");
        lines.push(debLine.slice(0, 80));
      }
      if (creditos.length > 0) {
        const credLine = creditos.map((l: any) => `(-) ${l.descricao}: R$ ${formatBRL(l.valor)}`).join(" | ");
        lines.push(credLine.slice(0, 80));
      }
    }

    // Linha 5: Total
    if ((b.total || 0) > 0) {
      lines.push(`TOTAL: R$ ${formatBRL(b.total)}`.slice(0, 80));
    }

    // Sicredi exige mínimo 1, máximo 5 informativos
    return lines.length > 0 ? lines.slice(0, 5) : fallback;
  } catch {
    return fallback;
  }
}

// POST - Emitir boleto para um pagamento
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { tenant: true, owner: true },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento não encontrado" },
        { status: 404 }
      );
    }

    if (payment.nossoNumero) {
      return NextResponse.json(
        { error: "Boleto já emitido" },
        { status: 400 }
      );
    }

    if (payment.status !== "PENDENTE" && payment.status !== "ATRASADO") {
      return NextResponse.json(
        { error: "Só é possível emitir boleto para pagamentos PENDENTE ou ATRASADO" },
        { status: 400 }
      );
    }

    const tenant = payment.tenant;
    const owner = payment.owner;

    if (!tenant || !owner) {
      return NextResponse.json(
        { error: "Pagamento sem locatário ou proprietário associado" },
        { status: 400 }
      );
    }

    // Validar dados obrigatórios do pagador (Sicredi exige)
    const missingFields: string[] = [];
    if (!tenant.cpfCnpj) missingFields.push("CPF/CNPJ do locatário");
    if (!tenant.name) missingFields.push("Nome do locatário");
    if (!tenant.city) missingFields.push("Cidade do locatário");
    if (!tenant.state) missingFields.push("UF do locatário");
    if (!tenant.zipCode) missingFields.push("CEP do locatário");
    if (!owner.cpfCnpj) missingFields.push("CPF/CNPJ do proprietário");

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Dados incompletos para emissão: ${missingFields.join(", ")}` },
        { status: 400 }
      );
    }

    // Carrega configuracoes de cobranca (singleton). Se nao existir, usa defaults.
    const billingSettings = await prisma.billingSettings.findFirst();

    const boletoParams: CreateBoletoParams = {
      pagador: {
        nome: tenant.name,
        documento: (tenant.cpfCnpj || "").replace(/\D/g, ""),
        endereco: `${tenant.street || ""} ${tenant.number || ""}`.trim(),
        cidade: tenant.city || "",
        uf: tenant.state || "",
        cep: (tenant.zipCode || "").replace(/\D/g, ""),
        tipoPessoa: tipoPessoa(tenant.cpfCnpj || ""),
      },
      beneficiarioFinal: {
        nome: owner.name,
        documento: (owner.cpfCnpj || "").replace(/\D/g, ""),
        logradouro: `${owner.street || ""} ${owner.number || ""}`.trim(),
        cidade: owner.city || "",
        uf: owner.state || "",
        cep: (owner.zipCode || "").replace(/\D/g, ""),
        tipoPessoa: tipoPessoa(owner.cpfCnpj || ""),
      },
      valor: payment.value,
      dataVencimento: formatDate(payment.dueDate),
      seuNumero: payment.code,
      tipoCobranca: "HIBRIDO",
      informativos: buildInformativos(payment.notes),
    };

    // Aplica config de multa, juros e validade pos-vencimento (se existir)
    if (billingSettings) {
      if (billingSettings.multaAposVenc && billingSettings.multaValor > 0) {
        boletoParams.multa = {
          tipo: billingSettings.multaTipo as "VALOR" | "PERCENTUAL",
          valor: billingSettings.multaValor,
        };
      }
      if (billingSettings.jurosTipo !== "ISENTO" && billingSettings.jurosValor > 0) {
        boletoParams.juros = {
          tipo: billingSettings.jurosTipo as "VALOR_DIA" | "PERCENTUAL_DIA" | "PERCENTUAL_MES" | "ISENTO",
          valor: billingSettings.jurosValor,
        };
      }
      if (billingSettings.validadeAposVencimentoDias > 0) {
        boletoParams.validadeAposVencimento = billingSettings.validadeAposVencimentoDias;
      }
      // Adicionar mensagem padrao
      if (billingSettings.mensagemPadrao) {
        boletoParams.mensagens = [billingSettings.mensagemPadrao];
      }
    }

    // Re-verificar no banco para evitar duplicidade (race condition de cliques duplos)
    const freshCheck = await prisma.payment.findUnique({ where: { id }, select: { nossoNumero: true } });
    if (freshCheck?.nossoNumero) {
      return NextResponse.json({ error: "Boleto já emitido por outro processo" }, { status: 400 });
    }

    const result = await sicrediCreateBoleto(boletoParams);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Erro ao criar boleto no Sicredi" },
        { status: 400 }
      );
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        nossoNumero: result.nossoNumero,
        linhaDigitavel: result.linhaDigitavel,
        codigoBarras: result.codigoBarras,
        pixCopiaECola: result.pixCopiaECola || null,
        boletoStatus: "EMITIDO",
        boletoEmitidoEm: new Date(),
      },
      include: { tenant: true, owner: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Boleto POST] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao emitir boleto" },
      { status: 500 }
    );
  }
}

// GET - Download do PDF do boleto
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const payment = await prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento não encontrado" },
        { status: 404 }
      );
    }

    if (!payment.linhaDigitavel) {
      return NextResponse.json(
        { error: "Boleto não emitido para este pagamento" },
        { status: 404 }
      );
    }

    const pdfBuffer = await sicrediPrintBoleto(payment.linhaDigitavel);
    const uint8 = new Uint8Array(pdfBuffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="boleto-${payment.code}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Boleto GET] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao baixar PDF do boleto" },
      { status: 500 }
    );
  }
}

// DELETE - Cancelar (baixa) boleto
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;

    const payment = await prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento não encontrado" },
        { status: 404 }
      );
    }

    if (!payment.nossoNumero) {
      return NextResponse.json(
        { error: "Nenhum boleto emitido para este pagamento" },
        { status: 404 }
      );
    }

    const result = await sicrediCancelBoleto(payment.nossoNumero);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Erro ao cancelar boleto no Sicredi" },
        { status: 502 }
      );
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        boletoStatus: "BAIXADO",
        nossoNumero: null,
        linhaDigitavel: null,
        codigoBarras: null,
      },
    });

    return NextResponse.json({
      message: "Boleto cancelado com sucesso",
      payment: updated,
    });
  } catch (error) {
    console.error("[Boleto DELETE] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao cancelar boleto" },
      { status: 500 }
    );
  }
}
