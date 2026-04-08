import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/audit/repasses - Lista repasses marcados como PAGO indevidamente
 * POST /api/audit/repasses - Reverte todos os repasses PAGO para PENDENTE
 */

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const pagoEntries = await prisma.ownerEntry.findMany({
    where: {
      category: "REPASSE",
      status: "PAGO",
    },
    include: {
      owner: { select: { name: true } },
      contract: { select: { code: true } },
    },
    orderBy: { dueDate: "desc" },
  });

  return NextResponse.json({
    total: pagoEntries.length,
    entries: pagoEntries.map((e) => ({
      id: e.id,
      owner: e.owner.name,
      contract: e.contract?.code || "-",
      value: e.value,
      dueDate: e.dueDate,
      paidAt: e.paidAt,
      description: e.description,
    })),
  });
}

export async function POST() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const result = await prisma.ownerEntry.updateMany({
    where: {
      category: "REPASSE",
      status: "PAGO",
    },
    data: {
      status: "PENDENTE",
      paidAt: null,
    },
  });

  return NextResponse.json({
    reverted: result.count,
    message: `${result.count} repasse(s) revertido(s) de PAGO para PENDENTE`,
  });
}
