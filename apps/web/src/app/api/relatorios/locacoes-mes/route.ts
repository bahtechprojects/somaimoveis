import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/relatorios/locacoes-mes?month=YYYY-MM
 * Retorna os contratos de LOCACAO cujo startDate cai no mes informado.
 * Relatorio de "imoveis alugados no mes X".
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

    // Buscar contratos cujo startDate cai no mes alvo
    const contracts = await prisma.contract.findMany({
      where: {
        startDate: { gte: monthStart, lte: monthEnd },
        type: { in: ["LOCACAO", "ADMINISTRACAO"] },
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            type: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
          },
        },
        owner: { select: { id: true, name: true, cpfCnpj: true } },
        tenant: { select: { id: true, name: true, cpfCnpj: true } },
      },
      orderBy: { startDate: "asc" },
    });

    const rows = contracts.map((c) => {
      const p = c.property;
      const addr = p
        ? [
            p.street ? `${p.street}${p.number ? `, ${p.number}` : ""}${p.complement ? ` - ${p.complement}` : ""}` : null,
            p.neighborhood,
            p.city && p.state ? `${p.city}/${p.state}` : p.city,
          ]
            .filter(Boolean)
            .join(" | ")
        : "";

      return {
        contractId: c.id,
        code: c.code,
        status: c.status,
        type: c.type,
        startDate: c.startDate,
        endDate: c.endDate,
        rentalValue: c.rentalValue,
        adminFeePercent: c.adminFeePercent,
        property: p ? { id: p.id, title: p.title, type: p.type, address: addr } : null,
        owner: c.owner,
        tenant: c.tenant,
      };
    });

    const totalAluguel = rows.reduce((s, r) => s + (r.rentalValue || 0), 0);
    const totalAdminFee = rows.reduce(
      (s, r) => s + (r.rentalValue || 0) * ((r.adminFeePercent || 0) / 100),
      0
    );

    return NextResponse.json({
      month: mLabel,
      total: rows.length,
      totalAluguel: Math.round(totalAluguel * 100) / 100,
      totalAdminFee: Math.round(totalAdminFee * 100) / 100,
      locacoes: rows,
    });
  } catch (error) {
    console.error("[Relatorio Locacoes-Mes]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
