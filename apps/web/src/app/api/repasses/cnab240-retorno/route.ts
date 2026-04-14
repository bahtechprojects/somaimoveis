import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { parseCnab240Retorno } from "@/lib/cnab240-retorno";

/**
 * POST /api/repasses/cnab240-retorno
 * Importa arquivo de retorno CNAB 240 Sicredi (.RET)
 * Faz o match com OwnerEntries pendentes e opcionalmente marca como PAGO.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const autoConfirm = formData.get("autoConfirm") === "true";

    if (!file) {
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    }

    const content = await file.text();
    const retorno = parseCnab240Retorno(content);

    // Match pagamentos do retorno com OwnerEntries no banco
    // O documentoEmpresa no CNAB remessa é "REP-{8 últimos dígitos do CPF}"
    // Buscar todas entries CREDITO pendentes ou pagas para match
    const allEntries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        status: { in: ["PENDENTE", "PAGO"] },
      },
      include: {
        owner: { select: { id: true, name: true, cpfCnpj: true } },
      },
    });

    // Indexar entries por CPF (últimos 8 dígitos) para match rápido
    const entriesByCpfSuffix: Record<string, typeof allEntries> = {};
    for (const entry of allEntries) {
      const cpfClean = entry.owner.cpfCnpj.replace(/\D/g, "");
      const suffix = cpfClean.slice(-8);
      const key = `REP-${suffix}`;
      if (!entriesByCpfSuffix[key]) entriesByCpfSuffix[key] = [];
      entriesByCpfSuffix[key].push(entry);
    }

    const resultados: {
      favorecido: string;
      documento: string;
      valor: number;
      status: "sucesso" | "erro" | "sem_match";
      ocorrencias: string;
      entryId?: string;
      ownerName?: string;
      marcadoPago?: boolean;
    }[] = [];

    const entryIdsToMarkPago: string[] = [];

    for (const pgto of retorno.pagamentos) {
      const docEmpresa = pgto.documentoEmpresa.trim();

      // Tentar match pelo documentoEmpresa
      const matchedEntries = entriesByCpfSuffix[docEmpresa] || [];

      // Filtrar para PENDENTE (preferir match com pendente)
      const pendentes = matchedEntries.filter(e => e.status === "PENDENTE");
      const matchEntry = pendentes.length > 0 ? pendentes[0] : (matchedEntries.length > 0 ? matchedEntries[0] : null);

      const ocorrenciasStr = pgto.ocorrencias.map(o => `${o.codigo}: ${o.descricao}`).join("; ");

      if (!matchEntry) {
        resultados.push({
          favorecido: pgto.favorecidoNome,
          documento: docEmpresa,
          valor: pgto.valorPagamento,
          status: pgto.sucesso ? "sucesso" : "erro",
          ocorrencias: ocorrenciasStr,
        });
        continue;
      }

      const resultado: typeof resultados[0] = {
        favorecido: pgto.favorecidoNome,
        documento: docEmpresa,
        valor: pgto.valorPagamento,
        status: pgto.sucesso ? "sucesso" : "erro",
        ocorrencias: ocorrenciasStr,
        entryId: matchEntry.id,
        ownerName: matchEntry.owner.name,
        marcadoPago: false,
      };

      // Se sucesso e autoConfirm, marcar para PAGO
      if (pgto.sucesso && autoConfirm && matchEntry.status === "PENDENTE") {
        entryIdsToMarkPago.push(matchEntry.id);
        resultado.marcadoPago = true;
      }

      resultados.push(resultado);
    }

    // Batch update: marcar como PAGO
    let totalMarcados = 0;
    if (entryIdsToMarkPago.length > 0) {
      const updated = await prisma.ownerEntry.updateMany({
        where: { id: { in: entryIdsToMarkPago } },
        data: { status: "PAGO", paidAt: new Date() },
      });
      totalMarcados = updated.count;
    }

    return NextResponse.json({
      arquivo: {
        banco: retorno.banco,
        empresa: retorno.empresa,
        dataGeracao: retorno.dataGeracao,
        sequencial: retorno.sequencialArquivo,
        totalLotes: retorno.totalLotes,
        totalRegistros: retorno.totalRegistros,
      },
      resumo: {
        totalPagamentos: retorno.pagamentos.length,
        sucesso: retorno.resumo.sucesso,
        erro: retorno.resumo.erro,
        valorTotal: retorno.resumo.valorTotal,
        valorEfetivado: retorno.resumo.valorEfetivado,
        matchados: resultados.filter(r => r.entryId).length,
        semMatch: resultados.filter(r => !r.entryId).length,
        marcadosPago: totalMarcados,
      },
      resultados,
    });
  } catch (error) {
    console.error("[CNAB240 Retorno]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar arquivo de retorno" },
      { status: 500 }
    );
  }
}
