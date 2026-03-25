"use client";

import { useEffect, useState, useCallback } from "react";
import { usePortal } from "@/components/portal/portal-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
} from "lucide-react";

interface Payment {
  id: string;
  code: string;
  value: number;
  paidValue: number | null;
  dueDate: string;
  paidAt: string | null;
  status: string;
  description: string | null;
  splitOwnerValue: number | null;
  splitAdminValue: number | null;
  contract: {
    id: string;
    code: string;
    property: { title: string };
  };
  tenant: { id: string; name: string };
}

interface FinancialData {
  payments: Payment[];
  summary: {
    totalReceived: number;
    totalPending: number;
    totalOverdue: number;
    totalOwnerReceived: number;
  };
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
  CANCELADO: {
    label: "Cancelado",
    className: "bg-gray-100 text-gray-500 border-gray-200",
    icon: Clock,
  },
  PARCIAL: {
    label: "Parcial",
    className: "bg-blue-100 text-blue-700 border-blue-200",
    icon: Clock,
  },
};

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

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

export default function PortalFinancialPage() {
  const { fetchPortal } = usePortal();
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>(
    String(now.getFullYear())
  );
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Generate year options (current year +/- 2 years)
  const currentYear = now.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const loadFinancial = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      if (selectedMonth !== "all") params.set("month", selectedMonth);
      if (selectedYear) params.set("year", selectedYear);

      const url = `/api/portal/financial${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetchPortal(url);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Erro ao carregar financeiro:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchPortal, selectedMonth, selectedYear, selectedStatus]);

  useEffect(() => {
    loadFinancial();
  }, [loadFinancial]);

  const payments = data?.payments || [];
  const summary = data?.summary || {
    totalReceived: 0,
    totalPending: 0,
    totalOverdue: 0,
    totalOwnerReceived: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground">
          Acompanhe seus pagamentos e receitas
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Total Recebido
                </p>
                <p className="text-2xl font-bold mt-1">
                  {loading ? "..." : formatCurrency(summary.totalReceived)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sua parte:{" "}
                  {loading
                    ? "..."
                    : formatCurrency(summary.totalOwnerReceived)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Total Pendente
                </p>
                <p className="text-2xl font-bold mt-1">
                  {loading ? "..." : formatCurrency(summary.totalPending)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Aguardando pagamento
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Total Atrasado
                </p>
                <p className="text-2xl font-bold mt-1 text-red-600">
                  {loading ? "..." : formatCurrency(summary.totalOverdue)}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  Pagamentos vencidos
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 p-4 border-b">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mes:</span>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger size="sm" className="w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {monthNames.map((name, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Ano:</span>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger size="sm" className="w-[90px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status:</span>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger size="sm" className="w-[120px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PAGO">Pago</SelectItem>
                  <SelectItem value="PENDENTE">Pendente</SelectItem>
                  <SelectItem value="ATRASADO">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Carregando...</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <DollarSign className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento encontrado para os filtros selecionados
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Imóvel</TableHead>
                    <TableHead className="text-xs">Locatário</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs text-right">
                      Valor Pago
                    </TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Pagamento</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
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
                        <TableCell className="text-xs text-right">
                          {payment.paidValue
                            ? formatCurrency(payment.paidValue)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(payment.dueDate)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {payment.paidAt ? formatDate(payment.paidAt) : "-"}
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
