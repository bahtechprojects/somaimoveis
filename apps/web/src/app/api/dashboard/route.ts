import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  try {
  const now = new Date();
  const in90Days = new Date();
  in90Days.setDate(now.getDate() + 90);

  const sevenMonthsAgo = new Date();
  sevenMonthsAgo.setMonth(now.getMonth() - 7);
  sevenMonthsAgo.setDate(1);
  sevenMonthsAgo.setHours(0, 0, 0, 0);

  const [
    totalProperties,
    rentedProperties,
    availableProperties,
    maintenanceProperties,
    totalContracts,
    activeContracts,
    renewalContracts,
    totalOwners,
    totalTenants,
    payments,
    recentPayments,
    upcomingPaymentsRaw,
    contractsExpiringRaw,
    paidPaymentsForRevenue,
  ] = await Promise.all([
    prisma.property.count({ where: { active: true } }),
    prisma.property.count({ where: { status: "ALUGADO", active: true } }),
    prisma.property.count({ where: { status: "DISPONIVEL", active: true } }),
    prisma.property.count({ where: { status: "MANUTENCAO", active: true } }),
    prisma.contract.count(),
    prisma.contract.count({ where: { status: "ATIVO" } }),
    prisma.contract.count({ where: { status: "PENDENTE_RENOVACAO" } }),
    prisma.owner.count({ where: { active: true } }),
    prisma.tenant.count({ where: { active: true } }),
    prisma.payment.findMany({
      orderBy: { dueDate: "desc" },
      take: 20,
      include: { tenant: true, contract: { include: { property: true } } },
    }),
    prisma.payment.findMany({
      where: { status: "PAGO" },
      orderBy: { paidAt: "desc" },
      take: 5,
    }),
    prisma.payment.findMany({
      where: { status: "PENDENTE", dueDate: { gte: now } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: {
        tenant: { select: { name: true } },
        contract: { include: { property: { select: { title: true } } } },
      },
    }),
    prisma.contract.findMany({
      where: { status: "ATIVO", endDate: { gte: now, lte: in90Days } },
      orderBy: { endDate: "asc" },
      take: 5,
      include: {
        tenant: { select: { name: true } },
        property: { select: { title: true } },
      },
    }),
    prisma.payment.findMany({
      where: {
        status: "PAGO",
        paidAt: { gte: sevenMonthsAgo },
      },
      select: { paidAt: true, paidValue: true },
    }),
  ]);

  const totalRevenue = payments
    .filter((p) => p.status === "PAGO")
    .reduce((sum, p) => sum + (p.paidValue || 0), 0);

  const overduePayments = payments.filter((p) => p.status === "ATRASADO");
  const pendingPayments = payments.filter((p) => p.status === "PENDENTE");

  const occupancyRate =
    totalProperties > 0
      ? Math.round((rentedProperties / totalProperties) * 100)
      : 0;

  // Build recentActivity from payments
  const recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    time: string;
    value?: number;
  }> = [];

  const paidItems = payments
    .filter((p) => p.status === "PAGO" && p.paidAt)
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      type: "payment" as const,
      title: "Pagamento recebido",
      description: `Aluguel - ${p.contract?.property?.title || "Imovel"} - ${p.tenant?.name || "Locatario"}`,
      time: p.paidAt!.toISOString(),
      value: p.paidValue || p.value,
    }));

  const overdueItems = payments
    .filter((p) => p.status === "ATRASADO")
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      type: "overdue" as const,
      title: "Pagamento atrasado",
      description: `Aluguel - ${p.contract?.property?.title || "Imovel"} - ${p.tenant?.name || "Locatario"}`,
      time: p.dueDate.toISOString(),
      value: p.value,
    }));

  const combined = [...paidItems, ...overdueItems]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5);

  recentActivity.push(...combined);

  // Build upcomingPayments
  const upcomingPayments = upcomingPaymentsRaw.map((p) => {
    const dueDate = new Date(p.dueDate);
    const diffTime = dueDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
      id: p.id,
      tenant: p.tenant?.name || "Locatario",
      property: p.contract?.property?.title || "Imovel",
      value: p.value,
      dueDate: p.dueDate.toISOString(),
      daysUntil,
    };
  });

  // Build contractsExpiring
  const contractsExpiring = contractsExpiringRaw.map((c) => {
    const endDate = new Date(c.endDate);
    const diffTime = endDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
      id: c.id,
      tenant: c.tenant?.name || "Locatario",
      property: c.property?.title || "Imovel",
      endDate: c.endDate.toISOString(),
      daysLeft,
      rentalValue: c.rentalValue,
    };
  });

  // Build revenueByMonth
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const revenueMap = new Map<string, number>();

  // Initialize last 7 months
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    revenueMap.set(key, 0);
  }

  for (const p of paidPaymentsForRevenue) {
    if (p.paidAt) {
      const d = new Date(p.paidAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (revenueMap.has(key)) {
        revenueMap.set(key, (revenueMap.get(key) || 0) + (p.paidValue || 0));
      }
    }
  }

  const revenueByMonth = Array.from(revenueMap.entries()).map(([key, value]) => {
    const [, monthStr] = key.split("-");
    const monthIndex = parseInt(monthStr, 10) - 1;
    return { month: monthNames[monthIndex], value };
  });

  return NextResponse.json({
    properties: {
      total: totalProperties,
      rented: rentedProperties,
      available: availableProperties,
      maintenance: maintenanceProperties,
      occupancyRate,
    },
    contracts: {
      total: totalContracts,
      active: activeContracts,
      renewal: renewalContracts,
    },
    financial: {
      totalRevenue,
      overdueCount: overduePayments.length,
      overdueAmount: overduePayments.reduce((sum, p) => sum + p.value, 0),
      pendingCount: pendingPayments.length,
      pendingAmount: pendingPayments.reduce((sum, p) => sum + p.value, 0),
    },
    people: {
      owners: totalOwners,
      tenants: totalTenants,
    },
    recentPayments: payments.slice(0, 10),
    recentActivity,
    upcomingPayments,
    contractsExpiring,
    revenueByMonth,
  });
  } catch (error) {
    console.error("[Dashboard GET] Error:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
