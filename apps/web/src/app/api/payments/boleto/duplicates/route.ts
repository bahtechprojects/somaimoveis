import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sicrediCancelBoleto, sicrediQueryBoleto } from "@/lib/sicredi-client";
import { requireAuth, isAuthError } from "@/lib/api-auth";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
            await delay(300);
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
        scan: "POST { action: 'scan' } — varre nossoNumero fantasmas no Sicredi (demora ~7 min)",
        cancelGhosts: "POST { action: 'cancel-ghosts', nossoNumeros: ['...'] } — cancela fantasmas em lote",
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
 * - { action: "scan" } → Varre nossoNumero fantasmas que existem no Sicredi mas não no banco
 * - { action: "cancel-ghosts", nossoNumeros: [...] } → Cancela lista de fantasmas em lote
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { action } = body;

    // ========================================
    // SCAN - Varrer fantasmas no Sicredi
    // ========================================
    if (action === "scan") {
      // Buscar todos nossoNumero do banco
      const dbPayments = await prisma.payment.findMany({
        where: { nossoNumero: { not: null } },
        select: { nossoNumero: true },
      });
      const dbNumbers = new Set(dbPayments.map((p) => p.nossoNumero!));

      // Determinar range (menor ao maior nossoNumero)
      const allNumbers = Array.from(dbNumbers).map(Number).sort((a, b) => a - b);
      if (allNumbers.length === 0) {
        return NextResponse.json({ ghosts: [], message: "Nenhum boleto no banco" });
      }

      const minNum = allNumbers[0];
      const maxNum = allNumbers[allNumbers.length - 1];
      const totalToScan = maxNum - minNum + 1 - dbNumbers.size;

      console.log(`[Scan] Range: ${minNum} a ${maxNum} (${totalToScan} números para verificar)`);

      const ghosts: { nossoNumero: string; situacao: string; valor?: number; dataVencimento?: string }[] = [];
      let checked = 0;
      let errors = 0;

      for (let num = minNum; num <= maxNum; num++) {
        const numStr = String(num);
        // Pular se já está no banco (é válido)
        if (dbNumbers.has(numStr)) continue;

        checked++;
        try {
          const result = await sicrediQueryBoleto(numStr);
          if (result.success && result.situacao) {
            // Boleto existe no Sicredi mas não no banco = fantasma!
            ghosts.push({
              nossoNumero: numStr,
              situacao: result.situacao,
              valor: result.valor || result.valorNominal,
              dataVencimento: result.dataVencimento,
            });
            console.log(`[Scan] FANTASMA encontrado: ${numStr} - ${result.situacao}`);
          }
        } catch {
          errors++;
        }

        // Delay de 300ms entre consultas
        await delay(300);
      }

      // Separar fantasmas por situação
      const emAberto = ghosts.filter((g) => g.situacao === "EM_ABERTO" || g.situacao === "REGISTRADO");
      const outros = ghosts.filter((g) => g.situacao !== "EM_ABERTO" && g.situacao !== "REGISTRADO");

      return NextResponse.json({
        scan: {
          range: `${minNum} a ${maxNum}`,
          numerosNoBanco: dbNumbers.size,
          numerosVerificados: checked,
          errosConsulta: errors,
        },
        ghosts: {
          total: ghosts.length,
          emAberto: emAberto.length,
          outros: outros.length,
          cancelar: emAberto,
          jaBaixados: outros,
        },
        nextStep: emAberto.length > 0
          ? `POST { action: "cancel-ghosts", nossoNumeros: [${emAberto.map((g) => `"${g.nossoNumero}"`).join(", ")}] }`
          : "Nenhum fantasma em aberto para cancelar",
      });
    }

    // ========================================
    // CANCEL-GHOSTS - Cancelar fantasmas em lote
    // ========================================
    if (action === "cancel-ghosts") {
      const { nossoNumeros } = body as { nossoNumeros?: string[] };
      if (!nossoNumeros || nossoNumeros.length === 0) {
        return NextResponse.json(
          { error: "nossoNumeros[] é obrigatório" },
          { status: 400 }
        );
      }

      // Verificar quais NÃO estão no banco (só cancelar fantasmas, não boletos reais)
      const dbPayments = await prisma.payment.findMany({
        where: { nossoNumero: { in: nossoNumeros } },
        select: { nossoNumero: true, code: true },
      });
      const dbNumbers = new Set(dbPayments.map((p) => p.nossoNumero));

      const results: { nossoNumero: string; success: boolean; error?: string; skipped?: boolean }[] = [];

      for (let i = 0; i < nossoNumeros.length; i++) {
        const num = nossoNumeros[i];

        // Proteger: não cancelar boleto que está no banco (é o válido)
        if (dbNumbers.has(num)) {
          results.push({ nossoNumero: num, success: false, skipped: true, error: "Boleto vinculado no banco - não é fantasma" });
          continue;
        }

        try {
          const result = await sicrediCancelBoleto(num);
          results.push({ nossoNumero: num, success: result.success, error: result.error });
          if (result.success) {
            console.log(`[Cancel-Ghosts] Cancelado: ${num}`);
          } else {
            console.log(`[Cancel-Ghosts] Falha: ${num} - ${result.error}`);
          }
        } catch (err) {
          results.push({ nossoNumero: num, success: false, error: err instanceof Error ? err.message : "Erro" });
        }

        // Delay entre cancelamentos
        if (i < nossoNumeros.length - 1) {
          await delay(500);
        }
      }

      const cancelados = results.filter((r) => r.success).length;
      const falhas = results.filter((r) => !r.success && !r.skipped).length;
      const pulados = results.filter((r) => r.skipped).length;

      return NextResponse.json({
        summary: `${cancelados} cancelado(s), ${falhas} falha(s), ${pulados} pulado(s)`,
        cancelados,
        falhas,
        pulados,
        results,
      });
    }

    // ========================================
    // CHECK - Consultar um boleto no Sicredi
    // ========================================
    const { nossoNumero } = body;

    if (!nossoNumero && action !== "scan") {
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

    // ========================================
    // CANCEL - Cancelar um boleto específico
    // ========================================
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
      { error: "action deve ser 'check', 'cancel', 'scan' ou 'cancel-ghosts'" },
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
