import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/relatorios/contratos-vencendo?days=90
 * Lista contratos ativos com endDate nos proximos N dias (default 90).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const daysStr = searchParams.get("days");
    const days = daysStr && !isNaN(parseInt(daysStr)) ? Math.max(1, Math.min(365, parseInt(daysStr))) : 90;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + days);
    limitDate.setHours(23, 59, 59, 999);

    const contracts = await prisma.contract.findMany({
      where: {
        status: { in: ["ATIVO", "PENDENTE_RENOVACAO"] },
        endDate: { gte: today, lte: limitDate },
      },
      include: {
        owner: { select: { id: true, name: true, cpfCnpj: true, phone: true } },
        tenant: { select: { id: true, name: true, cpfCnpj: true, phone: true, email: true } },
        property: { select: { id: true, title: true, street: true, number: true, neighborhood: true, city: true } },
      },
      orderBy: { endDate: "asc" },
    });

    const rows = contracts.map((c) => {
      const endDate = new Date(c.endDate);
      const diasRestantes = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const p = c.property;
      const endereco = p
        ? [
            p.street ? `${p.street}${p.number ? `, ${p.number}` : ""}` : null,
            p.neighborhood,
            p.city,
          ]
            .filter(Boolean)
            .join(" | ")
        : "";

      return {
        contractId: c.id,
        code: c.code,
        status: c.status,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        diasRestantes,
        urgencia: diasRestantes <= 30 ? "ALTA" : diasRestantes <= 60 ? "MEDIA" : "BAIXA",
        rentalValue: c.rentalValue,
        property: p
          ? {
              id: p.id,
              title: p.title,
              address: endereco,
            }
          : null,
        owner: c.owner,
        tenant: c.tenant,
      };
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totais = {
      total: rows.length,
      alta: rows.filter((r) => r.urgencia === "ALTA").length,
      media: rows.filter((r) => r.urgencia === "MEDIA").length,
      baixa: rows.filter((r) => r.urgencia === "BAIXA").length,
      totalAluguel: round2(rows.reduce((s, r) => s + r.rentalValue, 0)),
    };

    return NextResponse.json({
      dataReferencia: today.toISOString(),
      periodoDias: days,
      totais,
      contratos: rows,
    });
  } catch (error) {
    console.error("[Contratos Vencendo]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
