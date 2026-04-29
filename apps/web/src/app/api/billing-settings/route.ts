import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/billing-settings — singleton, cria se nao existir
 * PUT /api/billing-settings — atualiza
 */
export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  let settings = await prisma.billingSettings.findFirst();
  if (!settings) {
    settings = await prisma.billingSettings.create({ data: {} });
  }
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    let existing = await prisma.billingSettings.findFirst();
    if (!existing) {
      existing = await prisma.billingSettings.create({ data: {} });
    }

    const data: Record<string, unknown> = {};
    if (body.multaTipo !== undefined) data.multaTipo = body.multaTipo;
    if (body.multaValor !== undefined)
      data.multaValor = body.multaValor === "" ? 0 : parseFloat(body.multaValor);
    if (body.multaAposVenc !== undefined) data.multaAposVenc = !!body.multaAposVenc;

    if (body.jurosTipo !== undefined) data.jurosTipo = body.jurosTipo;
    if (body.jurosValor !== undefined)
      data.jurosValor = body.jurosValor === "" ? 0 : parseFloat(body.jurosValor);

    if (body.validadeAposVencimentoDias !== undefined)
      data.validadeAposVencimentoDias = parseInt(body.validadeAposVencimentoDias) || 0;

    if (body.mensagemPadrao !== undefined) data.mensagemPadrao = body.mensagemPadrao || null;
    if (body.notes !== undefined) data.notes = body.notes || null;

    const updated = await prisma.billingSettings.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("[Billing Settings PUT]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao salvar configuracoes" },
      { status: 500 }
    );
  }
}
