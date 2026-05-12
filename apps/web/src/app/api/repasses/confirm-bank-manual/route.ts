import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * POST /api/repasses/confirm-bank-manual
 *
 * Marca bankConfirmed=true em notes das OwnerEntries especificadas
 * (move da aba "⏳ Não Confirmados" pra "✅ Confirmados Banco").
 *
 * Use quando o admin sabe que o banco efetivou o pagamento mas
 * nao tem como importar o .RET (ou quer marcar manualmente).
 *
 * Body: { entryIds: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { entryIds } = body;

    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json(
        { error: "entryIds deve ser um array nao vazio" },
        { status: 400 }
      );
    }

    // Busca as entries pra ler notes atuais
    const entries = await prisma.ownerEntry.findMany({
      where: { id: { in: entryIds } },
      select: { id: true, notes: true, status: true },
    });

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma entry encontrada" },
        { status: 404 }
      );
    }

    const confirmedAt = new Date().toISOString();
    let totalConfirmados = 0;

    for (const entry of entries) {
      // So confirma se ja esta PAGO
      if (entry.status !== "PAGO") continue;
      let notesObj: Record<string, unknown> = {};
      try {
        notesObj = JSON.parse(entry.notes || "{}");
      } catch { /* ignore parse error, comeca limpo */ }
      // Skip se ja confirmado
      if (notesObj.bankConfirmed === true) continue;
      notesObj.bankConfirmed = true;
      notesObj.bankConfirmedAt = confirmedAt;
      notesObj.bankConfirmedManually = true;
      notesObj.bankConfirmedBy = auth.user.id;
      await prisma.ownerEntry.update({
        where: { id: entry.id },
        data: { notes: JSON.stringify(notesObj) },
      });
      totalConfirmados++;
    }

    return NextResponse.json({
      mode: "APPLIED",
      total: totalConfirmados,
      message: `${totalConfirmados} entry(ies) marcada(s) como confirmada(s) pelo banco.`,
    });
  } catch (error) {
    console.error("[confirm-bank-manual] Erro:", error);
    return NextResponse.json(
      { error: "Erro", details: error instanceof Error ? error.message : "desconhecido" },
      { status: 500 }
    );
  }
}
