import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/webhook-verify";

// GET - Health check para verificacao do endpoint pelo Sicredi
export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "sicredi-webhook" });
}

// POST - Recebe eventos de webhook do Sicredi (LIQUIDACAO de boletos)
// Sem autenticacao - chamado pelos servidores do Sicredi
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.SICREDI_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get("x-webhook-signature") || "";
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);

    // Log completo do payload para debug
    console.log("[Sicredi Webhook]", JSON.stringify(body));

    // Payload do Sicredi Webhook conforme manual v3.9:
    // {
    //   "agencia": "9999", "posto": "99", "beneficiario": "12345",
    //   "nossoNumero": "221000144",
    //   "dataEvento": [2024,3,20,11,40,39,24000000],
    //   "movimento": "LIQUIDACAO_PIX",
    //   "valorLiquidacao": "101.01",
    //   "valorDesconto": "0", "valorJuros": "0", "valorMulta": "0", "valorAbatimento": "0",
    //   "dataPrevisaoPagamento": [2024,3,20],
    //   "idEventoWebhook": "N000...LIQUIDACAO_PIX"
    // }

    const nossoNumero = body.nossoNumero;
    const movimento = (body.movimento || "").toString().toUpperCase();

    console.log(`[Sicredi Webhook] movimento: "${movimento}" | nossoNumero: ${nossoNumero || "N/A"} | idEvento: ${body.idEventoWebhook || "N/A"}`);

    // Tipos validos de liquidacao conforme manual Sicredi v3.9
    const LIQUIDACOES = [
      "LIQUIDACAO_PIX",
      "LIQUIDACAO_REDE",
      "LIQUIDACAO_COMPE_H5",
      "LIQUIDACAO_COMPE_H6",
      "LIQUIDACAO_COMPE_H8",
      "LIQUIDACAO_CARTORIO",
    ];
    const isLiquidacao = LIQUIDACOES.includes(movimento);
    const isEstorno = movimento === "ESTORNO_LIQUIDACAO_REDE";

    // Ignorar estornos (log mas nao processa - TODO: implementar reversao de estorno)
    if (isEstorno) {
      console.warn(
        `[Sicredi Webhook] ⚠️ ESTORNO recebido! nossoNumero: ${nossoNumero}, valor: ${body.valorLiquidacao || "?"}`
      );
      return NextResponse.json({
        success: true,
        message: "Estorno recebido - registrado no log",
        nossoNumero,
        movimento,
      });
    }

    // Se nao e liquidacao, ignorar (nao deveria acontecer pois contrato filtra por LIQUIDACAO)
    if (!isLiquidacao) {
      console.warn(
        `[Sicredi Webhook] Evento "${movimento}" NAO e liquidacao, ignorando. nossoNumero: ${nossoNumero || "N/A"}`
      );
      return NextResponse.json({
        success: true,
        message: `Evento "${movimento}" ignorado (somente liquidacoes sao processadas)`,
        nossoNumero,
        movimento,
      });
    }

    // Extrair valor pago e data do payload oficial
    const valorPago = body.valorLiquidacao || body.valorPago || body.valor;
    const valorDesconto = body.valorDesconto ? Number(body.valorDesconto) : 0;
    const valorJuros = body.valorJuros ? Number(body.valorJuros) : 0;
    const valorMulta = body.valorMulta ? Number(body.valorMulta) : 0;

    // dataEvento vem como array: [YYYY,MM,DD,HH,mm,ss,ns]
    let dataPagamento: Date | null = null;
    if (Array.isArray(body.dataEvento) && body.dataEvento.length >= 3) {
      const [y, m, d, h = 12, min = 0, s = 0] = body.dataEvento;
      dataPagamento = new Date(y, m - 1, d, h, min, s);
    } else if (Array.isArray(body.dataPrevisaoPagamento) && body.dataPrevisaoPagamento.length >= 3) {
      const [y, m, d] = body.dataPrevisaoPagamento;
      dataPagamento = new Date(y, m - 1, d, 12, 0, 0);
    }

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
      include: { owner: true, contract: { select: { id: true } } },
    });

    if (!payment) {
      console.warn(
        `[Sicredi Webhook] ⚠️ BOLETO FANTASMA LIQUIDADO - nossoNumero ${nossoNumero} NAO existe no banco! Valor: ${valorPago || "?"}`
      );
      console.warn(
        `[Sicredi Webhook] Payload completo do fantasma:`,
        JSON.stringify(body)
      );
      return NextResponse.json({
        success: true,
        message: "Boleto fantasma - nossoNumero nao vinculado a pagamento",
        nossoNumero,
        valorPago,
      });
    }

    // Validar valor pago vs valor esperado
    const valorPagoNum = valorPago ? Number(valorPago) : null;
    if (valorPagoNum && Math.abs(valorPagoNum - payment.value) > 0.10) {
      console.warn(
        `[Sicredi Webhook] ⚠️ VALOR DIFERENTE - ${payment.code}: esperado R$ ${payment.value.toFixed(2)}, recebido R$ ${valorPagoNum.toFixed(2)} (diff: R$ ${(valorPagoNum - payment.value).toFixed(2)})`
      );
    }

    // Montar dados de pagamento
    const paidAt = dataPagamento || new Date();

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "PAGO",
        paidValue: valorPagoNum ?? payment.value,
        paidAt,
        boletoStatus: "LIQUIDADO",
        boletoLiquidadoEm: new Date(),
        paymentMethod: "BOLETO",
        description: `Sicredi: ${movimento} | Valor: R$ ${(valorPagoNum ?? payment.value).toFixed(2)} | Juros: R$ ${valorJuros.toFixed(2)} | Multa: R$ ${valorMulta.toFixed(2)} | Desconto: R$ ${valorDesconto.toFixed(2)} | ID: ${body.idEventoWebhook || "N/A"}`,
      },
    });

    console.log(
      `[Sicredi Webhook] ✅ ${payment.code} LIQUIDADO via ${movimento} - R$ ${(valorPagoNum ?? payment.value).toFixed(2)} (juros: ${valorJuros}, multa: ${valorMulta}, desconto: ${valorDesconto})`
    );

    // NÃO marcar repasses como PAGO automaticamente.
    // O repasse só deve ser marcado como PAGO quando o dinheiro for
    // efetivamente transferido ao proprietário (via CNAB240 ou manualmente).

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
