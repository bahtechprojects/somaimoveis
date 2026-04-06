import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sicrediCancelBoleto, sicrediQueryBoleto } from "@/lib/sicredi-client";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/payments/boleto/duplicates
 * Lista todos os boletos emitidos com status no Sicredi.
 * Consulta cada um no Sicredi para mostrar situação real.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const withSicredi = searchParams.get("sicredi") === "true";

    // Buscar pagamentos com boleto emitido
    const payments = await prisma.payment.findMany({
      where: {
        nossoNumero: { not: null },
      },
      select: {
        id: true,
        code: true,
        nossoNumero: true,
        linhaDigitavel: true,
        value: true,
        dueDate: true,
        status: true,
        boletoStatus: true,
        boletoEmitidoEm: true,
        tenant: { select: { name: true, cpfCnpj: true } },
        owner: { select: { name: true } },
        contract: { select: { code: true } },
      },
      orderBy: { dueDate: "desc" },
    });

    // Se solicitado, consultar cada um no Sicredi para ver status real
    let enriched = payments.map((p) => ({
      id: p.id,
      code: p.code,
      contractCode: p.contract?.code || "—",
      nossoNumero: p.nossoNumero,
      linhaDigitavel: p.linhaDigitavel,
      value: p.value,
      dueDate: p.dueDate,
      status: p.status,
      boletoStatus: p.boletoStatus,
      boletoEmitidoEm: p.boletoEmitidoEm,
      tenant: p.tenant?.name || "—",
      tenantCpfCnpj: p.tenant?.cpfCnpj || "—",
      owner: p.owner?.name || "—",
      sicredi: null as any,
    }));

    if (withSicredi) {
      // Consultar no Sicredi (com delay para não bater rate limit)
      for (let i = 0; i < enriched.length; i++) {
        const p = enriched[i];
        if (p.nossoNumero) {
          try {
            const sicrediData = await sicrediQueryBoleto(p.nossoNumero);
            enriched[i] = { ...p, sicredi: sicrediData };
          } catch {
            enriched[i] = { ...p, sicredi: { error: "Falha na consulta" } };
          }
          // Delay de 300ms entre consultas para evitar rate limit
          if (i < enriched.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      }
    }

    return NextResponse.json({
      total: enriched.length,
      boletos: enriched,
      usage: {
        list: "GET /api/payments/boleto/duplicates — lista boletos do banco",
        listWithSicredi: "GET /api/payments/boleto/duplicates?sicredi=true — lista com status do Sicredi (mais lento)",
        check: "POST { action: 'check', nossoNumero: '...' } — consulta um boleto no Sicredi",
        cancel: "POST { action: 'cancel', nossoNumero: '...' } — cancela boleto no Sicredi",
        cancelAndClear: "POST { action: 'cancel', nossoNumero: '...', clearFromDb: true } — cancela e limpa do banco",
      },
    });
  } catch (error) {
    console.error("[Duplicates] Error:", error);
    return NextResponse.json(
      { error: "Erro ao buscar pagamentos" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payments/boleto/duplicates
 * Ações:
 * - { action: "check", nossoNumero: "..." } → Consulta status de um boleto no Sicredi
 * - { action: "cancel", nossoNumero: "..." } → Cancela (baixa) um boleto duplicado no Sicredi
 * - { action: "cancel", nossoNumero: "...", clearFromDb: true } → Cancela e limpa dados do banco
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { action, nossoNumero } = body;

    if (!nossoNumero) {
      return NextResponse.json(
        { error: "nossoNumero é obrigatório" },
        { status: 400 }
      );
    }

    if (action === "check") {
      const result = await sicrediQueryBoleto(nossoNumero);
      return NextResponse.json({
        nossoNumero,
        sicrediData: result,
      });
    }

    if (action === "cancel") {
      // Verificar se esse nossoNumero está vinculado a algum pagamento no nosso banco
      const linkedPayment = await prisma.payment.findFirst({
        where: { nossoNumero },
        select: { id: true, code: true, status: true },
      });

      // Cancelar no Sicredi
      const result = await sicrediCancelBoleto(nossoNumero);

      if (!result.success) {
        return NextResponse.json(
          {
            error: `Erro ao cancelar boleto: ${result.error}`,
            nossoNumero,
            linkedPayment: linkedPayment
              ? { id: linkedPayment.id, code: linkedPayment.code }
              : null,
          },
          { status: 400 }
        );
      }

      // Se solicitado, limpar dados do boleto no banco
      if (linkedPayment && body.clearFromDb) {
        await prisma.payment.update({
          where: { id: linkedPayment.id },
          data: {
            nossoNumero: null,
            linhaDigitavel: null,
            codigoBarras: null,
            pixCopiaECola: null,
            boletoStatus: null,
            boletoEmitidoEm: null,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Boleto ${nossoNumero} cancelado no Sicredi com sucesso`,
        linkedPayment: linkedPayment
          ? { id: linkedPayment.id, code: linkedPayment.code }
          : null,
        clearedFromDb: !!(linkedPayment && body.clearFromDb),
      });
    }

    return NextResponse.json(
      { error: "action deve ser 'check' ou 'cancel'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Duplicates] Error:", error);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500 }
    );
  }
}
