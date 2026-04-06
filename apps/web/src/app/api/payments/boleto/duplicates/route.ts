import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sicrediCancelBoleto, sicrediQueryBoleto } from "@/lib/sicredi-client";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/payments/boleto/duplicates
 * Lista pagamentos que podem ter boletos duplicados no Sicredi.
 * Consulta o Sicredi por seuNumero (payment.code) para detectar múltiplos boletos.
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    // Buscar pagamentos com boleto emitido
    const payments = await prisma.payment.findMany({
      where: {
        nossoNumero: { not: null },
        boletoStatus: { in: ["EMITIDO", "REGISTRADO"] },
        status: { in: ["PENDENTE", "ATRASADO"] },
      },
      select: {
        id: true,
        code: true,
        nossoNumero: true,
        value: true,
        dueDate: true,
        tenant: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({
      total: payments.length,
      payments: payments.map((p) => ({
        id: p.id,
        code: p.code,
        nossoNumero: p.nossoNumero,
        value: p.value,
        dueDate: p.dueDate,
        tenant: p.tenant?.name || "—",
      })),
      message:
        "Use POST com { nossoNumero: '...' } para cancelar um boleto específico no Sicredi, ou POST com { action: 'check', code: '...' } para consultar boletos de um pagamento.",
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
      // Verificar se esse nossoNumero está vinculado a algum pagamento ativo no nosso banco
      const linkedPayment = await prisma.payment.findFirst({
        where: { nossoNumero },
        select: { id: true, code: true, status: true },
      });

      if (linkedPayment) {
        // Se está vinculado, perguntar se quer desvincular também
        const { clearFromDb } = body;
        if (clearFromDb) {
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
      }

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

      return NextResponse.json({
        success: true,
        message: `Boleto ${nossoNumero} cancelado no Sicredi com sucesso`,
        linkedPayment: linkedPayment
          ? { id: linkedPayment.id, code: linkedPayment.code }
          : null,
        clearedFromDb: !!body.clearFromDb,
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
