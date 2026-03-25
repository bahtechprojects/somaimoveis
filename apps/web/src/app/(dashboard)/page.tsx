"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UpcomingPayments } from "@/components/dashboard/upcoming-payments";
import { OccupancyChart } from "@/components/dashboard/occupancy-chart";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ContractsExpiring } from "@/components/dashboard/contracts-expiring";
import {
  Building2,
  DollarSign,
  FileText,
  AlertTriangle,
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  time: string;
  value?: number;
}

interface UpcomingPaymentItem {
  id: string;
  tenant: string;
  property: string;
  value: number;
  dueDate: string;
  daysUntil: number;
}

interface ContractExpiringItem {
  id: string;
  tenant: string;
  property: string;
  endDate: string;
  daysLeft: number;
  rentalValue: number;
}

interface RevenueByMonthItem {
  month: string;
  value: number;
}

interface DashboardData {
  properties: {
    total: number;
    rented: number;
    available: number;
    maintenance: number;
    occupancyRate: number;
  };
  contracts: {
    total: number;
    active: number;
    renewal: number;
  };
  financial: {
    totalRevenue: number;
    overdueCount: number;
    overdueAmount: number;
    pendingCount: number;
    pendingAmount: number;
  };
  people: {
    owners: number;
    tenants: number;
  };
  recentActivity: ActivityItem[];
  upcomingPayments: UpcomingPaymentItem[];
  contractsExpiring: ContractExpiringItem[];
  revenueByMonth: RevenueByMonthItem[];
}

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1).replace(".", ",")}K`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setDashboard)
      .catch(() => {});
  }, []);

  const userName = session?.user?.name || "Usuário";
  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? "Bom dia"
      : today.getHours() < 18
        ? "Boa tarde"
        : "Boa noite";

  const formattedDate = today.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const inadimplencia = dashboard && dashboard.contracts.active > 0
    ? ((dashboard.financial.overdueCount / dashboard.contracts.active) * 100).toFixed(1).replace(".", ",")
    : "0";

  return (
    <div className="flex flex-col">
      <Header
        title={`${greeting}, ${userName.split(" ")[0]}`}
        subtitle={formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Imóveis"
            value={dashboard ? String(dashboard.properties.total) : "..."}
            icon={Building2}
            trend={{ value: 0, label: `${dashboard?.properties.available || 0} disponiveis` }}
            iconColor="bg-violet-100 text-violet-600"
          />
          <StatCard
            title="Receita Mensal"
            value={dashboard ? formatCurrency(dashboard.financial.totalRevenue) : "..."}
            icon={DollarSign}
            trend={{ value: 0, label: `${dashboard?.contracts.active || 0} contratos ativos` }}
            iconColor="bg-emerald-100 text-emerald-600"
          />
          <StatCard
            title="Contratos Ativos"
            value={dashboard ? String(dashboard.contracts.active) : "..."}
            icon={FileText}
            trend={{ value: 0, label: `${dashboard?.contracts.total || 0} total` }}
            iconColor="bg-blue-100 text-blue-600"
          />
          <StatCard
            title="Inadimplencia"
            value={dashboard ? `${inadimplencia}%` : "..."}
            icon={AlertTriangle}
            trend={{
              value: -(dashboard?.financial.overdueCount || 0),
              label: dashboard?.financial.overdueCount
                ? `${dashboard.financial.overdueCount} pagamento(s) atrasado(s)`
                : "Nenhum atraso",
            }}
            iconColor="bg-amber-100 text-amber-600"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <RevenueChart data={dashboard?.revenueByMonth || []} />
          </div>
          <OccupancyChart
            properties={
              dashboard?.properties || {
                total: 0,
                rented: 0,
                available: 0,
                maintenance: 0,
              }
            }
          />
        </div>

        {/* Activity and Payments Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RecentActivity activities={dashboard?.recentActivity || []} />
          <UpcomingPayments payments={dashboard?.upcomingPayments || []} />
          <ContractsExpiring contracts={dashboard?.contractsExpiring || []} />
        </div>
      </div>
    </div>
  );
}
