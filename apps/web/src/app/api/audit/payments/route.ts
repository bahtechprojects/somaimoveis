import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sicrediQueryLiquidados } from "@/lib/sicredi-client";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/payments
 * Audita pagamentos marcados como PAGO/LIQUIDADO.
 * Consulta a API de liquidados por dia do Sicredi para cruzar com o banco.
 *
 * Query params:
 *   ?dryRun=true (default) - apenas mostra o que seria revertido
 *   ?dryRun=false - reverte pagamentos nao-liquidados para PENDENTE
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") !== "false";

    // Buscar todos pagamentos marcados como PAGO com boleto
    const payments = await prisma.payment.findMany({
      where: {
        status: "PAGO",
        boletoStatus: "LIQUIDADO",
        nossoNumero: { not: null },
      },
      select: {
        id: true,
        code: true,
        nossoNumero: true,
        value: true,
        paidValue: true,
        paidAt: true,
        dueDate: true,
        boletoLiquidadoEm: true,
        contractId: true,
        tenant: { select: { name: true } },
        contract: { select: { code: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    if (payments.length === 0) {
      return NextResponse.json({
        dryRun,
        resumo: { totalVerificados: 0, confirmadosLiquidados: 0, naoLiquidados: 0, errosConsulta: 0 },
        message: "Nenhum pagamento PAGO/LIQUIDADO encontrado",
        detalhes: [],
      });
    }

    console.log(`[Audit] Verificando ${payments.length} pagamentos PAGO/LIQUIDADO...`);

    // Coletar datas unicas de paidAt para consultar liquidados por dia
    const datesSet = new Set<string>();
    for (const p of payments) {
      if (p.paidAt) {
        const d = new Date(p.paidAt);
        datesSet.add(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
      }
    }
    // Tambem consultar hoje e ontem como fallback
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    datesSet.add(`${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`);
    datesSet.add(`${String(ontem.getDate()).padStart(2, "0")}/${String(ontem.getMonth() + 1).padStart(2, "0")}/${ontem.getFullYear()}`);

    // Consultar liquidados no Sicredi para cada dia
    const liquidadosSet = new Set<string>(); // nossoNumeros realmente liquidados
    const liquidadosValor = new Map<string, number>(); // nossoNumero -> valorLiquidado
    let errosConsulta = 0;

    const dates = Array.from(datesSet);
    console.log(`[Audit] Consultando ${dates.length} dia(s) no Sicredi: ${dates.join(", ")}`);

    for (const dia of dates) {
      try {
        const result = await sicrediQueryLiquidados(dia);
        if (result.success && result.items) {
          for (const item of result.items) {
            liquidadosSet.add(item.nossoNumero);
            liquidadosValor.set(item.nossoNumero, item.valorLiquidado);
          }
          console.log(`[Audit] Dia ${dia}: ${result.items.length} liquidado(s)`);
        } else {
          console.warn(`[Audit] Erro ao consultar dia ${dia}: ${result.error}`);
          errosConsulta++;
        }
      } catch {
        errosConsulta++;
      }
    }

    console.log(`[Audit] Total liquidados no Sicredi: ${liquidadosSet.size}`);

    // Cruzar: pagamentos marcados PAGO vs liquidados reais no Sicredi
    const results: {
      code: string;
      nossoNumero: string;
      tenant: string;
      contrato: string;
      valorBanco: number;
      valorSicredi: number | null;
      paidAt: Date | null;
      realmenteLiquidado: boolean;
      action: string;
    }[] = [];

    let revertidos = 0;
    let confirmados = 0;

    for (const p of payments) {
      const realmenteLiquidado = liquidadosSet.has(p.nossoNumero!);
      const valorSicredi = liquidadosValor.get(p.nossoNumero!) ?? null;

      let action = "OK";

      if (!realmenteLiquidado) {
        if (!dryRun) {
          const now = new Date();
          const isOverdue = new Date(p.dueDate) < now;

          await prisma.payment.update({
            where: { id: p.id },
            data: {
              status: isOverdue ? "ATRASADO" : "PENDENTE",
              paidValue: null,
              paidAt: null,
              boletoStatus: "EMITIDO",
              boletoLiquidadoEm: null,
              paymentMethod: null,
            },
          });

          // Reverter OwnerEntries de REPASSE vinculados
          try {
            const paymentDueDate = new Date(p.dueDate);
            const monthStart = new Date(paymentDueDate.getFullYear(), paymentDueDate.getMonth(), 1);
            const monthEnd = new Date(paymentDueDate.getFullYear(), paymentDueDate.getMonth() + 1, 0, 23, 59, 59, 999);

            await prisma.ownerEntry.updateMany({
              where: {
                contractId: p.contractId,
                category: "REPASSE",
                status: "PAGO",
                dueDate: { gte: monthStart, lte: monthEnd },
              },
              data: {
                status: "PENDENTE",
                paidAt: null,
              },
            });
          } catch {
            // non-critical
          }

          action = "REVERTIDO";
          revertidos++;
        } else {
          action = "REVERTER (dry-run)";
          revertidos++;
        }
      } else {
        confirmados++;
      }

      results.push({
        code: p.code,
        nossoNumero: p.nossoNumero!,
        tenant: p.tenant?.name || "N/A",
        contrato: p.contract?.code || "N/A",
        valorBanco: p.value,
        valorSicredi,
        paidAt: p.paidAt,
        realmenteLiquidado,
        action,
      });
    }

    const naoLiquidados = results.filter((r) => !r.realmenteLiquidado);
    const valorIncorreto = naoLiquidados.reduce((sum, r) => sum + r.valorBanco, 0);

    return NextResponse.json({
      dryRun,
      resumo: {
        totalVerificados: payments.length,
        confirmadosLiquidados: confirmados,
        naoLiquidados: revertidos,
        errosConsulta,
        valorMarcadoIncorretamente: `R$ ${valorIncorreto.toFixed(2)}`,
        diasConsultados: dates,
        liquidadosNoSicredi: liquidadosSet.size,
      },
      instrucoes: dryRun
        ? "Execute com ?dryRun=false para reverter os pagamentos nao-liquidados"
        : `${revertidos} pagamento(s) revertido(s) para PENDENTE/ATRASADO`,
      detalhes: results,
    });
  } catch (error) {
    console.error("[Audit] Erro:", error);
    return NextResponse.json(
      { error: "Erro ao auditar pagamentos" },
      { status: 500 }
    );
  }
}
