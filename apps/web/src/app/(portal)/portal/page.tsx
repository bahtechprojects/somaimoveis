"use client";

import { useEffect, useState } from "react";
import { usePortal } from "@/components/portal/portal-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface DashboardData {
  totalProperties: number;
  activeContracts: number;
  totalMonthlyIncome: number;
  totalMonthlyOwnerIncome: number;
  pendingPayments: number;
  overduePayments: number;
  recentPayments: {
    id: string;
    code: string;
    value: number;
    paidValue: number | null;
    dueDate: string;
    paidAt: string | null;
    status: string;
    contract: {
      property: { title: string };
    };
    tenant: { name: string };
  }[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const statusConfig: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  PAGO: {
    label: "Pago",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  PENDENTE: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: Clock,
  },
  ATRASADO: {
    label: "Atrasado",
    className: "bg-red-100 text-red-700 border-red-200",
    icon: AlertTriangle,
  },
};

export default function PortalDashboardPage() {
  const { owner, fetchPortal } = usePortal();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await fetchPortal("/api/portal/dashboard");
        if (response.ok) {
          const data = await response.json();
          setDashboard(data);
        }
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [fetchPortal]);

  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? "Bom dia"
      : today.getHours() < 18
        ? "Boa tarde"
        : "Boa noite";

  const firstName = owner?.name?.split(" ")[0] || "Proprietario";

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-muted-foreground">
          Acompanhe o resumo dos seus imoveis e financeiro
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Total de Imoveis
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {loading ? "..." : dashboard?.totalProperties ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Imoveis cadastrados
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                <Building2 className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Contratos Ativos
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {loading ? "..." : dashboard?.activeContracts ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Contratos em vigencia
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Renda Mensal
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {loading
                    ? "..."
                    : formatCurrency(
                        dashboard?.totalMonthlyOwnerIncome ?? 0
                      )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sua parte (liquido de taxa)
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Pagamentos Pendentes
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {loading
                    ? "..."
                    : (dashboard?.pendingPayments ?? 0) +
                      (dashboard?.overduePayments ?? 0)}
                </p>
                {!loading &&
                  dashboard &&
                  dashboard.overduePayments > 0 && (
                    <p className="text-xs text-red-500 font-medium">
                      {dashboard.overduePayments} atrasado(s)
                    </p>
                  )}
                {!loading &&
                  dashboard &&
                  dashboard.overduePayments === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum atraso
                    </p>
                  )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="px-6 py-4 border-b">
            <h2 className="text-base font-semibold">Ultimos Pagamentos</h2>
            <p className="text-sm text-muted-foreground">
              Os 5 pagamentos mais recentes
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Carregando...</p>
            </div>
          ) : !dashboard?.recentPayments ||
            dashboard.recentPayments.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento encontrado
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Codigo</TableHead>
                    <TableHead className="text-xs">Imovel</TableHead>
                    <TableHead className="text-xs">Locatario</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.recentPayments.map((payment) => {
                    const status = statusConfig[payment.status] || {
                      label: payment.status,
                      className: "bg-muted text-muted-foreground",
                      icon: Clock,
                    };
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-xs">
                          {payment.code}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {payment.contract.property?.title || "N/A"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {payment.tenant?.name || "N/A"}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-right">
                          {formatCurrency(payment.value)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(payment.dueDate)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs border gap-1 ${status.className}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
