import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const status = searchParams.get("status"); // PENDENTE, PAGO, all

  const creditWhere: Record<string, unknown> = {
    type: "CREDITO",
    category: "REPASSE",
  };

  if (status && status !== "all") {
    creditWhere.status = status;
  }

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    creditWhere.dueDate = {
      gte: new Date(y, m - 1, 1),
      lt: new Date(y, m, 1),
    };
  }

  const ownerSelect = {
    id: true,
    name: true,
    cpfCnpj: true,
    phone: true,
    email: true,
    bankName: true,
    bankAgency: true,
    bankAccount: true,
    bankPix: true,
    bankPixType: true,
    thirdPartyName: true,
    thirdPartyDocument: true,
    thirdPartyBank: true,
    thirdPartyAgency: true,
    thirdPartyAccount: true,
    thirdPartyPixKeyType: true,
    thirdPartyPix: true,
    paymentDay: true,
  };

  const entries = await prisma.ownerEntry.findMany({
    where: creditWhere,
    include: { owner: { select: ownerSelect } },
    orderBy: { dueDate: "asc" },
  });

  // Buscar debitos PENDENTES dos proprietarios para descontar do repasse
  const ownerIds = [...new Set(entries.map((e) => e.ownerId))];
  const debitWhere: Record<string, unknown> = {
    type: "DEBITO",
    status: "PENDENTE",
    ownerId: { in: ownerIds },
  };
  // Se filtro de mes, pegar debitos do mesmo mes ou anteriores (acumulados)
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    debitWhere.OR = [
      { dueDate: { lt: new Date(y, m, 1) } },
      { dueDate: null },
    ];
  }
  const debitEntries = await prisma.ownerEntry.findMany({
    where: debitWhere,
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  // Group by owner
  const grouped: Record<
    string,
    {
      owner: (typeof entries)[0]["owner"];
      entries: typeof entries;
      debitEntries: typeof debitEntries;
      totalPendente: number;
      totalPago: number;
      totalDebitos: number;
      totalLiquido: number;
    }
  > = {};

  for (const entry of entries) {
    const oid = entry.ownerId;
    if (!grouped[oid]) {
      grouped[oid] = {
        owner: entry.owner,
        entries: [],
        debitEntries: [],
        totalPendente: 0,
        totalPago: 0,
        totalDebitos: 0,
        totalLiquido: 0,
      };
    }
    grouped[oid].entries.push(entry);
    if (entry.status === "PENDENTE") {
      grouped[oid].totalPendente += entry.value;
    } else if (entry.status === "PAGO") {
      grouped[oid].totalPago += entry.value;
    }
  }

  // Adicionar debitos aos grupos
  for (const debit of debitEntries) {
    const oid = debit.ownerId;
    if (grouped[oid]) {
      grouped[oid].debitEntries.push(debit);
      grouped[oid].totalDebitos += debit.value;
    }
  }

  // Calcular valor liquido (repasse - debitos)
  const result = Object.values(grouped)
    .map((g) => ({
      ...g,
      totalPendente: Math.round(g.totalPendente * 100) / 100,
      totalPago: Math.round(g.totalPago * 100) / 100,
      totalDebitos: Math.round(g.totalDebitos * 100) / 100,
      totalLiquido: Math.round((g.totalPendente - g.totalDebitos) * 100) / 100,
    }))
    .sort((a, b) => b.totalLiquido - a.totalLiquido);

  return NextResponse.json(result);
}

// PATCH - batch update: mark multiple entries as PAGO
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const { entryIds, status } = body;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    return NextResponse.json(
      { error: "entryIds deve ser um array nao vazio" },
      { status: 400 }
    );
  }

  const validStatuses = ["PAGO", "PENDENTE", "CANCELADO"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Status invalido. Use: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { status };
  if (status === "PAGO") {
    data.paidAt = new Date();
  } else if (status === "PENDENTE") {
    data.paidAt = null;
  }

  const updated = await prisma.ownerEntry.updateMany({
    where: { id: { in: entryIds } },
    data,
  });

  return NextResponse.json({
    updated: updated.count,
    message: `${updated.count} repasse(s) atualizado(s) para ${status}`,
  });
}
