"use client";

import { useEffect, useState, useCallback } from "react";
import { usePortal } from "@/components/portal/portal-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Receipt,
  Calendar,
  DollarSign,
  TrendingUp,
  Minus,
  ChevronDown,
  ChevronUp,
  Printer,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface MonthPayment {
  id: string;
  code: string;
  dueDate: string;
  paidAt: string | null;
  status: string;
  value: number;
  paidValue: number | null;
  splitOwnerValue: number | null;
  splitAdminValue: number | null;
  description: string | null;
  property: string;
  tenant: string;
}

interface MonthGroup {
  month: number;
  year: number;
  label: string;
  payments: MonthPayment[];
  totals: {
    totalValue: number;
    totalPaid: number;
    totalOwner: number;
    totalAdmin: number;
  };
}

interface StatementData {
  months: MonthGroup[];
  grandTotals: {
    totalValue: number;
    totalPaid: number;
    totalOwner: number;
    totalAdmin: number;
  };
  ownerName: string;
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

export default function PortalStatementPage() {
  const { fetchPortal } = usePortal();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(
    String(currentYear)
  );

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const loadStatement = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchPortal(
        `/api/portal/statement?year=${selectedYear}`
      );
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error("Erro ao carregar extrato:", error);
    } finally {
      setLoading(false);
    }
  }, [fetchPortal, selectedYear]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!data) return;
    const allKeys = data.months.map((m) => `${m.year}-${m.month}`);
    setExpandedMonths(new Set(allKeys));
  };

  const collapseAll = () => {
    setExpandedMonths(new Set());
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Extrato Financeiro
          </h1>
          <p className="text-muted-foreground">
            {data?.ownerName
              ? `Extrato de ${data.ownerName} - ${selectedYear}`
              : `Extrato financeiro de ${selectedYear}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger size="sm" className="w-[100px] text-xs">
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

          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={expandedMonths.size > 0 ? collapseAll : expandAll}
          >
            {expandedMonths.size > 0 ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Recolher
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Expandir
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 print:hidden"
            onClick={handlePrint}
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Monthly Breakdown */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Carregando extrato...
            </p>
          </div>
        </div>
      ) : !data || data.months.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Nenhum dado encontrado para {selectedYear}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Month Cards */}
          <div className="space-y-4">
            {data.months.map((month) => {
              const key = `${month.year}-${month.month}`;
              const isExpanded = expandedMonths.has(key);

              return (
                <Card key={key} className="border-0 shadow-sm overflow-hidden">
                  {/* Month Header - Clickable */}
                  <button
                    className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleMonth(key)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">
                          {month.label}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {month.payments.length} pagamento(s)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Quick Stats */}
                      <div className="hidden sm:flex items-center gap-4 text-right">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">
                            Total
                          </p>
                          <p className="text-sm font-semibold">
                            {formatCurrency(month.totals.totalValue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">
                            Sua Parte
                          </p>
                          <p className="text-sm font-semibold text-emerald-700">
                            {formatCurrency(month.totals.totalOwner)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">
                            Taxa Admin.
                          </p>
                          <p className="text-sm font-medium text-muted-foreground">
                            {formatCurrency(month.totals.totalAdmin)}
                          </p>
                        </div>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {/* Mobile Stats (visible when collapsed on small screens) */}
                  <div className="sm:hidden px-4 pb-3 flex items-center gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                      <p className="text-xs font-semibold">
                        {formatCurrency(month.totals.totalValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Sua Parte</p>
                      <p className="text-xs font-semibold text-emerald-700">
                        {formatCurrency(month.totals.totalOwner)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Taxa</p>
                      <p className="text-xs font-medium text-muted-foreground">
                        {formatCurrency(month.totals.totalAdmin)}
                      </p>
                    </div>
                  </div>

                  {/* Expanded Payment Details */}
                  {isExpanded && (
                    <div className="border-t overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs">Codigo</TableHead>
                            <TableHead className="text-xs">Imovel</TableHead>
                            <TableHead className="text-xs">
                              Locatario
                            </TableHead>
                            <TableHead className="text-xs">
                              Vencimento
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              Valor
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              Sua Parte
                            </TableHead>
                            <TableHead className="text-xs text-right">
                              Taxa Admin.
                            </TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {month.payments.map((payment) => {
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
                                  {payment.property}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {payment.tenant}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {formatDate(payment.dueDate)}
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-right">
                                  {formatCurrency(payment.value)}
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-right text-emerald-700">
                                  {payment.splitOwnerValue != null
                                    ? formatCurrency(payment.splitOwnerValue)
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-xs text-right text-muted-foreground">
                                  {payment.splitAdminValue != null
                                    ? formatCurrency(payment.splitAdminValue)
                                    : "-"}
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
                </Card>
              );
            })}
          </div>

          {/* Grand Total */}
          <Card className="border-0 shadow-sm bg-primary/5">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Resumo Anual - {selectedYear}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Total de todos os meses
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Valor Total
                    </p>
                    <p className="text-lg font-bold">
                      {formatCurrency(data.grandTotals.totalValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sua Parte</p>
                    <p className="text-lg font-bold text-emerald-700">
                      {formatCurrency(data.grandTotals.totalOwner)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Taxa Admin.
                    </p>
                    <p className="text-lg font-bold text-muted-foreground">
                      {formatCurrency(data.grandTotals.totalAdmin)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
