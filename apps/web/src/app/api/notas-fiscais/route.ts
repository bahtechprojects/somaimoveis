import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/notas-fiscais?month=YYYY-MM
 * Lista as notas fiscais a emitir no mes (taxa de administracao de cada contrato).
 * Cada contrato ativo gera uma NF da taxa de administracao.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const monthStr = searchParams.get("month");

    let targetYear: number, targetMonth: number;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      const [y, m] = monthStr.split("-").map(Number);
      targetYear = y;
      targetMonth = m - 1;
    } else {
      const now = new Date();
      targetYear = now.getFullYear();
      targetMonth = now.getMonth();
    }

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    const mLabel = `${String(targetMonth + 1).padStart(2, "0")}/${targetYear}`;

    // Buscar entries REPASSE/GARANTIA do mes com notes (que tem adminFee)
    const entries = await prisma.ownerEntry.findMany({
      where: {
        type: "CREDITO",
        category: { in: ["REPASSE", "GARANTIA"] },
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELADO" },
      },
      include: {
        owner: { select: { id: true, name: true, cpfCnpj: true } },
      },
      orderBy: [{ owner: { name: "asc" } }, { createdAt: "asc" }],
    });

    // Buscar contratos relacionados
    const contractIds = entries
      .map((e) => e.contractId)
      .filter((id): id is string => !!id);
    const contracts = contractIds.length > 0
      ? await prisma.contract.findMany({
          where: { id: { in: contractIds } },
          select: { id: true, code: true, rentalValue: true, adminFeePercent: true },
        })
      : [];
    const contractMap = new Map(contracts.map((c) => [c.id, c]));

    // Buscar status de NF emitida do AppSetting
    const nfKey = `nf_emitidas_${targetYear}_${String(targetMonth + 1).padStart(2, "0")}`;
    const nfSetting = await prisma.appSetting.findUnique({ where: { key: nfKey } });
    const nfEmitidas: Record<string, { emitida: boolean; numero?: string; data?: string }> =
      nfSetting ? JSON.parse(nfSetting.value) : {};

    const notas = entries.map((entry) => {
      const contract = entry.contractId ? contractMap.get(entry.contractId) || null : null;
      let adminFeePercent = contract?.adminFeePercent || 10;
      let adminFeeValue = 0;
      let aluguelBruto = 0;

      if (entry.notes) {
        try {
          const n = JSON.parse(entry.notes);
          if (n.adminFeePercent) adminFeePercent = n.adminFeePercent;
          if (n.adminFeeValue) adminFeeValue = n.adminFeeValue;
          if (n.aluguelBruto) aluguelBruto = n.aluguelBruto;
        } catch {}
      }

      // Se nao tem adminFeeValue nos notes, calcular
      if (!adminFeeValue && contract) {
        aluguelBruto = contract.rentalValue;
        adminFeeValue = Math.round(aluguelBruto * (adminFeePercent / 100) * 100) / 100;
      }

      const nfStatus = nfEmitidas[entry.id] || { emitida: false };

      return {
        entryId: entry.id,
        owner: entry.owner,
        contract,
        aluguelBruto: Math.round(aluguelBruto * 100) / 100,
        adminFeePercent,
        adminFeeValue: Math.round(adminFeeValue * 100) / 100,
        repasseValue: entry.value,
        nfEmitida: nfStatus.emitida,
        nfNumero: nfStatus.numero || "",
        nfData: nfStatus.data || "",
      };
    });

    const totalAdminFee = notas.reduce((s, n) => s + n.adminFeeValue, 0);
    const totalEmitidas = notas.filter((n) => n.nfEmitida).length;

    return NextResponse.json({
      month: mLabel,
      total: notas.length,
      emitidas: totalEmitidas,
      pendentes: notas.length - totalEmitidas,
      totalAdminFee: Math.round(totalAdminFee * 100) / 100,
      notas,
    });
  } catch (error) {
    console.error("[Notas Fiscais GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notas-fiscais
 * Marca NFs como emitidas ou pendentes.
 * Body: { month: "YYYY-MM", entryIds: string[], emitida: boolean, numero?: string }
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { month, entryIds, emitida, numero } = body;

    if (!month || !Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json({ error: "month e entryIds obrigatorios" }, { status: 400 });
    }

    const [y, m] = month.split("-").map(Number);
    const nfKey = `nf_emitidas_${y}_${String(m).padStart(2, "0")}`;

    const existing = await prisma.appSetting.findUnique({ where: { key: nfKey } });
    const nfEmitidas: Record<string, { emitida: boolean; numero?: string; data?: string }> =
      existing ? JSON.parse(existing.value) : {};

    const now = new Date().toISOString().split("T")[0];
    for (const id of entryIds) {
      nfEmitidas[id] = {
        emitida: emitida !== false,
        numero: numero || nfEmitidas[id]?.numero || "",
        data: emitida !== false ? now : "",
      };
    }

    await prisma.appSetting.upsert({
      where: { key: nfKey },
      update: { value: JSON.stringify(nfEmitidas) },
      create: { key: nfKey, value: JSON.stringify(nfEmitidas) },
    });

    return NextResponse.json({
      updated: entryIds.length,
      message: `${entryIds.length} NF(s) ${emitida !== false ? "marcada(s) como emitida(s)" : "revertida(s) para pendente"}`,
    });
  } catch (error) {
    console.error("[Notas Fiscais PATCH]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
