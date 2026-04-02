import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { sicrediCreateBoleto } from "@/lib/sicredi-client";
import type { CreateBoletoParams } from "@/lib/sicredi-client";

function tipoPessoa(cpfCnpj: string): "PESSOA_FISICA" | "PESSOA_JURIDICA" {
  return cpfCnpj.replace(/\D/g, "").length === 11
    ? "PESSOA_FISICA"
    : "PESSOA_JURIDICA";
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST - Emitir boletos em lote
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { paymentIds, month } = body as {
      paymentIds?: string[];
      month?: string;
    };

    // Determinar quais pagamentos processar
    let payments;

    if (paymentIds && paymentIds.length > 0) {
      payments = await prisma.payment.findMany({
        where: {
          id: { in: paymentIds },
          nossoNumero: null,
        },
        include: { tenant: true, owner: true },
      });
    } else if (month) {
      // month no formato YYYY-MM
      const [year, mon] = month.split("-").map(Number);
      const startDate = new Date(year, mon - 1, 1);
      const endDate = new Date(year, mon, 0, 23, 59, 59, 999);

      payments = await prisma.payment.findMany({
        where: {
          status: "PENDENTE",
          nossoNumero: null,
          dueDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: { tenant: true, owner: true },
      });
    } else {
      payments = await prisma.payment.findMany({
        where: {
          status: "PENDENTE",
          nossoNumero: null,
        },
        include: { tenant: true, owner: true },
      });
    }

    let emitidos = 0;
    const erros: { paymentId: string; code: string; error: string }[] = [];

    // Processar sequencialmente para evitar rate limits
    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];

      // Pular se já tem boleto ou status inválido
      if (payment.nossoNumero) {
        erros.push({
          paymentId: payment.id,
          code: payment.code,
          error: "Boleto já emitido",
        });
        continue;
      }

      if (payment.status !== "PENDENTE" && payment.status !== "ATRASADO") {
        erros.push({
          paymentId: payment.id,
          code: payment.code,
          error: `Status inválido: ${payment.status}`,
        });
        continue;
      }

      const tenant = payment.tenant;
      const owner = payment.owner;

      if (!tenant || !owner) {
        erros.push({
          paymentId: payment.id,
          code: payment.code,
          error: "Sem locatário ou proprietário associado",
        });
        continue;
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
        erros.push({
          paymentId: payment.id,
          code: payment.code,
          error: `Dados incompletos: ${missingFields.join(", ")}`,
        });
        continue;
      }

      try {
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
        };

        const result = await sicrediCreateBoleto(boletoParams);

        if (!result.success) {
          erros.push({
            paymentId: payment.id,
            code: payment.code,
            error: result.error || "Erro ao criar boleto no Sicredi",
          });
        } else {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              nossoNumero: result.nossoNumero,
              linhaDigitavel: result.linhaDigitavel,
              codigoBarras: result.codigoBarras,
              pixCopiaECola: result.pixCopiaECola || null,
              boletoStatus: "EMITIDO",
              boletoEmitidoEm: new Date(),
            },
          });
          emitidos++;
        }
      } catch (error) {
        erros.push({
          paymentId: payment.id,
          code: payment.code,
          error:
            error instanceof Error ? error.message : "Erro desconhecido",
        });
      }

      // Delay entre chamadas para evitar rate limit
      if (i < payments.length - 1) {
        await delay(500);
      }
    }

    return NextResponse.json({
      emitidos,
      erros,
      total: payments.length,
    });
  } catch (error) {
    console.error("[Boleto Batch] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao emitir boletos em lote" },
      { status: 500 }
    );
  }
}
