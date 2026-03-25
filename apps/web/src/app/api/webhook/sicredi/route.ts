import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp-sender";

// GET - Health check para verificacao do endpoint pelo Sicredi
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "sicredi-webhook" });
}

// POST - Recebe eventos de webhook do Sicredi (LIQUIDACAO de boletos)
// Sem autenticacao - chamado pelos servidores do Sicredi
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log completo do payload para debug
    console.log("[Sicredi Webhook]", JSON.stringify(body));

    // Extrair campos do payload de forma flexivel
    // O Sicredi pode enviar em diferentes formatos
    const nossoNumero =
      body.nossoNumero ||
      body.boleto?.nossoNumero ||
      body.cobranca?.nossoNumero ||
      body.data?.nossoNumero;

    const valorPago =
      body.valorPago ||
      body.valor ||
      body.boleto?.valorPago ||
      body.boleto?.valor ||
      body.data?.valorPago ||
      body.data?.valor;

    const dataPagamento =
      body.dataPagamento ||
      body.dataLiquidacao ||
      body.boleto?.dataPagamento ||
      body.data?.dataPagamento;

    if (!nossoNumero) {
      console.warn(
        "[Sicredi Webhook] nossoNumero nao encontrado no payload:",
        JSON.stringify(body)
      );
      return NextResponse.json({ success: true, message: "nossoNumero ausente, ignorado" });
    }

    // Buscar pagamento pelo nossoNumero
    const payment = await prisma.payment.findFirst({
      where: { nossoNumero },
      include: { owner: true },
    });

    if (!payment) {
      console.warn(
        `[Sicredi Webhook] Pagamento nao encontrado para nossoNumero: ${nossoNumero}`
      );
      // Retorna 200 para nao causar retry do Sicredi
      return NextResponse.json({
        success: true,
        message: "Pagamento nao encontrado",
      });
    }

    // Atualizar o pagamento com dados da liquidacao
    const paidAt = dataPagamento ? new Date(dataPagamento) : new Date();

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAGO",
        paidValue: valorPago ? Number(valorPago) : payment.value,
        paidAt,
        boletoStatus: "LIQUIDADO",
        boletoLiquidadoEm: new Date(),
        paymentMethod: "BOLETO",
      },
    });

    console.log(
      `[Sicredi Webhook] Pagamento ${payment.code} atualizado para LIQUIDADO`
    );

    if (!payment.owner) {
      console.warn("[Sicredi Webhook] Payment has no owner linked:", payment.id);
    }

    // Notificacao WhatsApp ao proprietario (opcional, nao falha se der erro)
    try {
      const ownerPhone = payment.owner?.phone;
      if (ownerPhone) {
        const valorFormatado = (valorPago ? Number(valorPago) : payment.value)
          .toFixed(2)
          .replace(".", ",");
        const dataFormatada = paidAt.toLocaleDateString("pt-BR");

        await sendWhatsAppMessage({
          to: ownerPhone,
          message: `Pagamento recebido! Boleto ${payment.code} no valor de R$ ${valorFormatado} foi pago em ${dataFormatada}.`,
        });
        console.log(
          `[Sicredi Webhook] WhatsApp enviado para proprietario ${payment.owner?.name}`
        );
      }
    } catch (whatsappError) {
      console.error(
        "[Sicredi Webhook] Erro ao enviar WhatsApp (nao-critico):",
        whatsappError
      );
    }

    return NextResponse.json({
      success: true,
      paymentId: updated.id,
      status: "LIQUIDADO",
    });
  } catch (error) {
    console.error("[Sicredi Webhook] Erro ao processar webhook:", error);
    // Retorna 200 mesmo em erro para evitar retries infinitos
    return NextResponse.json(
      { success: false, error: "Erro interno ao processar webhook" },
      { status: 200 }
    );
  }
}
