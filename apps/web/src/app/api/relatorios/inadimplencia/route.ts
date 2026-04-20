import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

/**
 * GET /api/relatorios/inadimplencia
 * Lista todos os pagamentos vencidos e nao pagos agrupados por locatario.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar pagamentos em atraso: status PENDENTE/ATRASADO com dueDate < hoje
    const payments = await prisma.payment.findMany({
      where: {
        OR: [
          { status: "ATRASADO" },
          {
            AND: [
              { status: { in: ["PENDENTE", "PARCIAL"] } },
              { dueDate: { lt: today } },
            ],
          },
        ],
      },
      include: {
        tenant: { select: { id: true, name: true, cpfCnpj: true, phone: true, email: true } },
        owner: { select: { id: true, name: true } },
        contract: {
          select: {
            id: true,
            code: true,
            property: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    // Agrupar por locatario
    type TenantGroup = {
      tenant: {
        id: string;
        name: string;
        cpfCnpj: string;
        phone: string | null;
        email: string | null;
      } | null;
      totalDue: number;
      totalPaid: number;
      totalOpen: number;
      oldestDueDate: string | null;
      maxDiasAtraso: number;
      pagamentos: Array<{
        id: string;
        code: string;
        dueDate: string;
        value: number;
        paidValue: number;
        openValue: number;
        status: string;
        diasAtraso: number;
        contractCode: string;
        propertyTitle: string;
        ownerName: string;
      }>;
    };

    const groups = new Map<string, TenantGroup>();

    for (const p of payments) {
      const key = p.tenantId || "sem-locatario";
      if (!groups.has(key)) {
        groups.set(key, {
          tenant: p.tenant,
          totalDue: 0,
          totalPaid: 0,
          totalOpen: 0,
          oldestDueDate: null,
          maxDiasAtraso: 0,
          pagamentos: [],
        });
      }
      const g = groups.get(key)!;

      const dueDate = new Date(p.dueDate);
      const diasAtraso = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const paidValue = p.paidValue || 0;
      const openValue = Math.max(0, p.value - paidValue);

      g.totalDue += p.value;
      g.totalPaid += paidValue;
      g.totalOpen += openValue;
      if (diasAtraso > g.maxDiasAtraso) g.maxDiasAtraso = diasAtraso;
      if (!g.oldestDueDate || dueDate < new Date(g.oldestDueDate)) {
        g.oldestDueDate = dueDate.toISOString();
      }

      g.pagamentos.push({
        id: p.id,
        code: p.code,
        dueDate: p.dueDate.toISOString(),
        value: p.value,
        paidValue,
        openValue,
        status: p.status,
        diasAtraso,
        contractCode: p.contract?.code || "-",
        propertyTitle: p.contract?.property?.title || "-",
        ownerName: p.owner?.name || "-",
      });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const inadimplentes = Array.from(groups.values())
      .map((g) => ({
        ...g,
        totalDue: round2(g.totalDue),
        totalPaid: round2(g.totalPaid),
        totalOpen: round2(g.totalOpen),
      }))
      .sort((a, b) => b.totalOpen - a.totalOpen);

    const totais = {
      totalLocatarios: inadimplentes.length,
      totalPagamentos: payments.length,
      totalDue: round2(inadimplentes.reduce((s, g) => s + g.totalDue, 0)),
      totalPaid: round2(inadimplentes.reduce((s, g) => s + g.totalPaid, 0)),
      totalOpen: round2(inadimplentes.reduce((s, g) => s + g.totalOpen, 0)),
    };

    return NextResponse.json({
      dataReferencia: today.toISOString(),
      totais,
      inadimplentes,
    });
  } catch (error) {
    console.error("[Inadimplencia]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
