import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { renderTemplate } from "@/lib/whatsapp-templates";
import {
  sendWhatsAppMessage,
  sendWhatsAppDocumentBase64,
  sendEmailMessage,
} from "@/lib/whatsapp-sender";
import {
  sicrediCreateBoleto,
  sicrediPrintBoleto,
} from "@/lib/sicredi-client";
import type { CreateBoletoParams } from "@/lib/sicredi-client";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildInformativos(notes: string | null): string[] {
  const fallback = ["Cobranca de aluguel"];
  if (!notes) return fallback;
  try {
    const b = JSON.parse(notes);
    const lines: string[] = [];
    let line1 = `Aluguel: R$ ${formatBRL(b.aluguel || 0)}`;
    if ((b.taxaBancaria || 0) > 0) line1 += ` | Tx Banc: R$ ${formatBRL(b.taxaBancaria)}`;
    lines.push(line1.slice(0, 80));
    const parts2: string[] = [];
    if ((b.condominio || 0) > 0) parts2.push(`Cond: R$ ${formatBRL(b.condominio)}`);
    if ((b.iptu || 0) > 0) parts2.push(`IPTU: R$ ${formatBRL(b.iptu)}`);
    if ((b.seguroFianca || 0) > 0) parts2.push(`Seguro: R$ ${formatBRL(b.seguroFianca)}`);
    if (parts2.length > 0) lines.push(parts2.join(" | ").slice(0, 80));
    if (b.lancamentos && Array.isArray(b.lancamentos) && b.lancamentos.length > 0) {
      const debitos = b.lancamentos.filter((l: any) => l.tipo === "DEBITO");
      const creditos = b.lancamentos.filter((l: any) => l.tipo === "CREDITO");
      if (debitos.length > 0) lines.push(debitos.map((l: any) => `(+) ${l.descricao}: R$ ${formatBRL(l.valor)}`).join(" | ").slice(0, 80));
      if (creditos.length > 0) lines.push(creditos.map((l: any) => `(-) ${l.descricao}: R$ ${formatBRL(l.valor)}`).join(" | ").slice(0, 80));
    }
    if ((b.total || 0) > 0) lines.push(`TOTAL: R$ ${formatBRL(b.total)}`.slice(0, 80));
    return lines.length > 0 ? lines.slice(0, 5) : fallback;
  } catch {
    return fallback;
  }
}

function tipoPessoa(cpfCnpj: string): "PESSOA_FISICA" | "PESSOA_JURIDICA" {
  return cpfCnpj.replace(/\D/g, "").length === 11
    ? "PESSOA_FISICA"
    : "PESSOA_JURIDICA";
}

// POST - Enviar cobranca manual para um pagamento especifico
// Auto-emite boleto se ainda nao foi emitido, e envia com PDF
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const channels: string[] = body.channels || ["whatsapp", "email"];

    // Buscar pagamento com dados completos do locatario e proprietario
    let payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        contract: { include: { property: { select: { title: true } } } },
        tenant: true,
        owner: true,
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pagamento nao encontrado" },
        { status: 404 }
      );
    }

    if (!payment.tenant) {
      return NextResponse.json(
        { error: "Pagamento sem locatario associado" },
        { status: 400 }
      );
    }

    const tenant = payment.tenant;
    const owner = payment.owner;

    // ==========================================
    // 1. Auto-emitir boleto se ainda nao emitido
    // ==========================================
    let boletoEmitido = false;
    if (!payment.nossoNumero && (payment.status === "PENDENTE" || payment.status === "ATRASADO")) {
      // Re-verificar no banco para evitar duplicidade (race condition)
      const freshPayment = await prisma.payment.findUnique({ where: { id }, select: { nossoNumero: true } });
      if (freshPayment?.nossoNumero) {
        // Outro processo já emitiu o boleto, recarregar dados
        payment = await prisma.payment.findUnique({
          where: { id },
          include: { contract: { include: { property: { select: { title: true } } } }, tenant: true, owner: true },
        }) as typeof payment;
      } else {
      // Validar dados obrigatorios
      const missingFields: string[] = [];
      if (!tenant.cpfCnpj) missingFields.push("CPF/CNPJ do locatario");
      if (!tenant.name) missingFields.push("Nome do locatario");
      if (!tenant.city) missingFields.push("Cidade do locatario");
      if (!tenant.state) missingFields.push("UF do locatario");
      if (!tenant.zipCode) missingFields.push("CEP do locatario");
      if (!owner.cpfCnpj) missingFields.push("CPF/CNPJ do proprietario");

      if (missingFields.length > 0) {
        return NextResponse.json(
          { error: `Dados incompletos para emitir boleto: ${missingFields.join(", ")}` },
          { status: 400 }
        );
      }

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
        dataVencimento: formatDateISO(payment.dueDate),
        seuNumero: payment.code,
        tipoCobranca: "HIBRIDO",
        informativos: buildInformativos(payment.notes),
      };

      const boletoResult = await sicrediCreateBoleto(boletoParams);

      if (!boletoResult.success) {
        return NextResponse.json(
          { error: `Erro ao emitir boleto: ${boletoResult.error || "Erro Sicredi"}` },
          { status: 400 }
        );
      }

      // Atualizar pagamento com dados do boleto
      payment = await prisma.payment.update({
        where: { id },
        data: {
          nossoNumero: boletoResult.nossoNumero,
          linhaDigitavel: boletoResult.linhaDigitavel,
          codigoBarras: boletoResult.codigoBarras,
          pixCopiaECola: boletoResult.pixCopiaECola || null,
          boletoStatus: "EMITIDO",
          boletoEmitidoEm: new Date(),
        },
        include: {
          contract: { include: { property: { select: { title: true } } } },
          tenant: true,
          owner: true,
        },
      });
      boletoEmitido = true;
      } // end else (fresh check)
    }

    // ==========================================
    // 2. Baixar PDF do boleto (se emitido)
    // ==========================================
    let pdfBuffer: Buffer | null = null;
    let pdfBase64: string | null = null;

    if (payment.linhaDigitavel) {
      try {
        pdfBuffer = await sicrediPrintBoleto(payment.linhaDigitavel);
        pdfBase64 = pdfBuffer.toString("base64");
      } catch (err) {
        console.error("[Notify] Erro ao baixar PDF do boleto:", err);
        // Continua sem PDF - ainda envia a mensagem com linha digitavel
      }
    }

    // ==========================================
    // 3. Montar mensagem com dados do boleto
    // ==========================================
    const dueDate = new Date(payment.dueDate);
    const now = new Date();
    const isOverdue = dueDate < now && payment.status !== "PAGO";

    const templateKey = isOverdue ? "payment_overdue" : "payment_reminder";
    const daysUntilDue = Math.max(
      0,
      Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );

    const fineValue = payment.fineValue || 0;
    const interestValue = payment.interestValue || 0;
    const totalValue = payment.value + fineValue + interestValue;

    const templateData = isOverdue
      ? {
          tenantName: tenant.name,
          value: formatCurrency(payment.value),
          propertyTitle: payment.contract.property?.title || "N/A",
          dueDate: formatDateBR(dueDate),
          totalValue: formatCurrency(totalValue),
        }
      : {
          tenantName: tenant.name,
          value: formatCurrency(payment.value),
          propertyTitle: payment.contract.property?.title || "N/A",
          daysUntilDue,
          dueDate: formatDateBR(dueDate),
        };

    const rendered = renderTemplate(templateKey, templateData);

    // Adicionar formas de pagamento na mensagem
    let fullMessage = rendered.message;

    // PIX copia e cola (gerado pelo Sicredi no boleto hibrido)
    if (payment.pixCopiaECola) {
      fullMessage += `\n\n*PIX Copia e Cola:*\n${payment.pixCopiaECola}`;
    } else {
      // Fallback: chave PIX fixa da imobiliaria (env var)
      const pixKey = process.env.PIX_KEY;
      const pixKeyType = process.env.PIX_KEY_TYPE || "Chave PIX";
      if (pixKey) {
        fullMessage += `\n\n*Pagamento via PIX:*\n${pixKeyType}: ${pixKey}`;
        fullMessage += `\nValor: ${formatCurrency(isOverdue ? totalValue : payment.value)}`;
      }
    }

    // Linha digitavel do boleto
    if (payment.linhaDigitavel) {
      fullMessage += `\n\n*Linha digitavel do boleto:*\n${payment.linhaDigitavel}`;
    }

    fullMessage += `\n\n_Somma Imoveis_`;

    const results: { channel: string; success: boolean; error?: string }[] = [];

    // ==========================================
    // 4. Enviar WhatsApp (texto + PDF)
    // ==========================================
    if (channels.includes("whatsapp")) {
      if (!tenant.phone) {
        results.push({
          channel: "whatsapp",
          success: false,
          error: "Locatario sem telefone cadastrado",
        });
      } else {
        // Enviar mensagem de texto com linha digitavel
        const textResult = await sendWhatsAppMessage({
          to: tenant.phone,
          message: fullMessage,
        });

        // Enviar PDF do boleto como documento
        let docResult = null;
        if (pdfBase64 && textResult.success) {
          try {
            docResult = await sendWhatsAppDocumentBase64({
              to: tenant.phone,
              fileBase64: pdfBase64,
              fileName: `boleto-${payment.code}.pdf`,
              caption: `Boleto ${payment.code} - Venc: ${formatDateBR(dueDate)}`,
            });
          } catch (err) {
            console.error("[Notify] Erro ao enviar PDF WhatsApp:", err);
          }
        }

        await prisma.notification.create({
          data: {
            type: "WHATSAPP",
            channel: "whatsapp",
            recipientName: tenant.name,
            recipientPhone: tenant.phone,
            templateKey,
            subject: rendered.subject,
            message: fullMessage,
            status: textResult.success ? "ENVIADO" : "FALHA",
            sentAt: textResult.success ? new Date() : null,
            errorMessage: textResult.error || null,
            paymentId: payment.id,
            contractId: payment.contractId,
            tenantId: tenant.id,
            metadata: JSON.stringify({
              messageId: textResult.messageId,
              docMessageId: docResult?.messageId,
              pdfEnviado: docResult?.success || false,
              boletoAutoEmitido: boletoEmitido,
              manual: true,
            }),
          },
        });

        results.push({
          channel: "whatsapp",
          success: textResult.success,
          error: textResult.error,
        });
      }
    }

    // ==========================================
    // 5. Enviar Email (texto + PDF anexo)
    // ==========================================
    if (channels.includes("email")) {
      const tenantEmail = (tenant as any).email as string | undefined;
      if (!tenantEmail) {
        results.push({
          channel: "email",
          success: false,
          error: "Locatario sem email cadastrado",
        });
      } else {
        const attachments = pdfBuffer
          ? [{ filename: `boleto-${payment.code}.pdf`, content: pdfBuffer }]
          : undefined;

        const emailResult = await sendEmailMessage({
          to: tenantEmail,
          subject: rendered.subject,
          message: fullMessage,
          attachments,
        });

        await prisma.notification.create({
          data: {
            type: "EMAIL",
            channel: "email",
            recipientName: tenant.name,
            recipientEmail: tenantEmail,
            templateKey,
            subject: rendered.subject,
            message: fullMessage,
            status: emailResult.success ? "ENVIADO" : "FALHA",
            sentAt: emailResult.success ? new Date() : null,
            errorMessage: emailResult.error || null,
            paymentId: payment.id,
            contractId: payment.contractId,
            tenantId: tenant.id,
            metadata: JSON.stringify({
              messageId: emailResult.messageId,
              pdfAnexado: !!pdfBuffer,
              boletoAutoEmitido: boletoEmitido,
              manual: true,
            }),
          },
        });

        results.push({
          channel: "email",
          success: emailResult.success,
          error: emailResult.error,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      results,
      boletoEmitido,
      pdfEnviado: !!pdfBuffer,
      linhaDigitavel: payment.linhaDigitavel,
      summary: `${successCount} enviado(s), ${failCount} falha(s)${boletoEmitido ? " (boleto emitido automaticamente)" : ""}`,
    });
  } catch (error) {
    console.error("[Notify] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao enviar notificacao" },
      { status: 500 }
    );
  }
}
