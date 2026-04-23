"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  TrendingUp,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Building2,
  FileText,
  CreditCard,
  Trophy,
  Printer,
  Calendar,
  Users,
  AlertOctagon,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Property {
  id: string;
  title: string;
  status: string;
  type: string;
  rentalValue: number | null;
  ownerId: string;
  owner?: { id: string; name: string };
}

interface Contract {
  id: string;
  code: string;
  status: string;
  rentalValue: number;
  startDate: string;
  endDate: string;
  property: { id: string; title: string };
  owner: { id: string; name: string };
  tenant: { id: string; name: string };
}

interface Payment {
  id: string;
  code: string;
  value: number;
  paidValue: number | null;
  dueDate: string;
  paidAt: string | null;
  status: string;
  paymentMethod: string | null;
  contract: { id: string; code: string; property: { title: string } };
  tenant: { id: string; name: string };
  owner: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")}K`;
  }
  return formatCurrency(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// Status configs
const propertyStatusConfig: Record<string, { label: string; className: string; color: string }> = {
  ALUGADO: { label: "Alugado", className: "bg-primary/10 text-primary border-primary/20", color: "bg-primary" },
  DISPONIVEL: { label: "Disponível", className: "bg-emerald-100 text-emerald-700 border-emerald-200", color: "bg-emerald-500" },
  MANUTENCAO: { label: "Manutenção", className: "bg-amber-100 text-amber-700 border-amber-200", color: "bg-amber-500" },
  INATIVO: { label: "Inativo", className: "bg-muted text-muted-foreground", color: "bg-gray-400" },
};

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  PAGO: { label: "Pago", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  PENDENTE: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  ATRASADO: { label: "Atrasado", className: "bg-red-100 text-red-700 border-red-200" },
  CANCELADO: { label: "Cancelado", className: "bg-gray-100 text-gray-500 border-gray-200" },
  PARCIAL: { label: "Parcial", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

const contractStatusConfig: Record<string, { label: string; className: string }> = {
  ATIVO: { label: "Ativo", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  PENDENTE_RENOVACAO: { label: "Renovação", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ENCERRADO: { label: "Encerrado", className: "bg-gray-100 text-gray-500 border-gray-200" },
  CANCELADO: { label: "Cancelado", className: "bg-red-100 text-red-700 border-red-200" },
};

const methodLabels: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CARTAO: "Cartao",
  TRANSFERENCIA: "Transferencia",
  DINHEIRO: "Dinheiro",
};

type PeriodOption = "3m" | "6m" | "12m" | "all";

const periodOptions: { value: PeriodOption; label: string }[] = [
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Todo periodo" },
];

// ---------------------------------------------------------------------------
// Helper components: cards de relatorios em PDF
// ---------------------------------------------------------------------------

type CardColor = "primary" | "red" | "amber" | "green" | "blue";

const colorClasses: Record<CardColor, { bg: string; text: string; border: string; btn: string }> = {
  primary: {
    bg: "bg-primary/10",
    text: "text-primary",
    border: "hover:border-primary/50",
    btn: "",
  },
  red: {
    bg: "bg-red-100",
    text: "text-red-600",
    border: "hover:border-red-300",
    btn: "bg-red-600 hover:bg-red-700",
  },
  amber: {
    bg: "bg-amber-100",
    text: "text-amber-600",
    border: "hover:border-amber-300",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  green: {
    bg: "bg-green-100",
    text: "text-green-600",
    border: "hover:border-green-300",
    btn: "bg-green-600 hover:bg-green-700",
  },
  blue: {
    bg: "bg-blue-100",
    text: "text-blue-600",
    border: "hover:border-blue-300",
    btn: "bg-blue-600 hover:bg-blue-700",
  },
};

function CardShell({
  icon,
  title,
  description,
  color = "primary",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: CardColor;
  children: React.ReactNode;
}) {
  const c = colorClasses[color];
  return (
    <div className={`flex flex-col gap-2 p-3 border rounded-lg transition-colors ${c.border}`}>
      <div className="flex items-start gap-2">
        <div className={`h-8 w-8 rounded-md ${c.bg} ${c.text} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function RelatorioMonthCard({
  icon,
  title,
  description,
  color = "primary",
  onGenerate,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: CardColor;
  onGenerate: (month: string) => void;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const c = colorClasses[color];

  return (
    <CardShell icon={icon} title={title} description={description} color={color}>
      <div className="flex gap-2 mt-1">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border bg-background flex-1 min-w-0"
        />
        <Button
          size="sm"
          className={`h-8 text-xs gap-1 shrink-0 text-white ${c.btn}`}
          onClick={() => onGenerate(month)}
        >
          <Printer className="h-3.5 w-3.5" />
          Gerar
        </Button>
      </div>
    </CardShell>
  );
}

function RelatorioInstantCard({
  icon,
  title,
  description,
  color = "primary",
  onGenerate,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: CardColor;
  onGenerate: () => void;
}) {
  const c = colorClasses[color];
  return (
    <CardShell icon={icon} title={title} description={description} color={color}>
      <Button
        size="sm"
        className={`h-8 text-xs gap-1 mt-1 text-white ${c.btn}`}
        onClick={onGenerate}
      >
        <Printer className="h-3.5 w-3.5" />
        Gerar Relatorio
      </Button>
    </CardShell>
  );
}

function RelatorioDaysCard({
  icon,
  title,
  description,
  color = "primary",
  onGenerate,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: CardColor;
  onGenerate: (days: number) => void;
}) {
  const [days, setDays] = useState(90);
  const c = colorClasses[color];
  return (
    <CardShell icon={icon} title={title} description={description} color={color}>
      <div className="flex gap-2 mt-1">
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="h-8 px-2 text-xs rounded-md border bg-background flex-1 min-w-0"
        >
          <option value={30}>Proximos 30 dias</option>
          <option value={60}>Proximos 60 dias</option>
          <option value={90}>Proximos 90 dias</option>
          <option value={180}>Proximos 180 dias</option>
        </select>
        <Button
          size="sm"
          className={`h-8 text-xs gap-1 shrink-0 text-white ${c.btn}`}
          onClick={() => onGenerate(days)}
        >
          <Printer className="h-3.5 w-3.5" />
          Gerar
        </Button>
      </div>
    </CardShell>
  );
}

function RelatorioOwnerYearCard({
  icon,
  title,
  description,
  color = "primary",
  onGenerate,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color?: CardColor;
  onGenerate: (ownerId: string, year: number) => void;
}) {
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);
  const [ownerId, setOwnerId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0));
  const c = colorClasses[color];

  useEffect(() => {
    fetch("/api/owners")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setOwners(list.map((o: any) => ({ id: o.id, name: o.name })));
      })
      .catch(console.error);
  }, []);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  return (
    <CardShell icon={icon} title={title} description={description} color={color}>
      <div className="flex flex-col gap-2 mt-1">
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="h-8 px-2 text-xs rounded-md border bg-background"
        >
          <option value="">Selecione o proprietario</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="h-8 px-2 text-xs rounded-md border bg-background flex-1 min-w-0"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                Ano {y}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            className={`h-8 text-xs gap-1 shrink-0 text-white ${c.btn}`}
            disabled={!ownerId}
            onClick={() => ownerId && onGenerate(ownerId, year)}
          >
            <Printer className="h-3.5 w-3.5" />
            Gerar
          </Button>
        </div>
      </div>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RelatoriosPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodOption>("12m");

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const [propsRes, contractsRes, paymentsRes] = await Promise.all([
          fetch("/api/properties"),
          fetch("/api/contracts"),
          fetch("/api/payments"),
        ]);
        const [propsData, contractsData, paymentsData] = await Promise.all([
          propsRes.ok ? propsRes.json() : [],
          contractsRes.ok ? contractsRes.json() : [],
          paymentsRes.ok ? paymentsRes.json() : [],
        ]);
        setProperties(propsData);
        setContracts(contractsData);
        setPayments(paymentsData);
      } catch (error) {
        console.error("Erro ao buscar dados dos relatorios:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // ---- Period filter date ----
  const periodStartDate = useMemo(() => {
    if (period === "all") return null;
    const now = new Date();
    const months = period === "3m" ? 3 : period === "6m" ? 6 : 12;
    return new Date(now.getFullYear(), now.getMonth() - months, 1);
  }, [period]);

  // ---- Filtered payments by period ----
  const filteredPayments = useMemo(() => {
    if (!periodStartDate) return payments;
    return payments.filter((p) => new Date(p.dueDate) >= periodStartDate);
  }, [payments, periodStartDate]);

  // ---- Financial Summary ----
  const financialSummary = useMemo(() => {
    const paid = filteredPayments.filter((p) => p.status === "PAGO");
    const pending = filteredPayments.filter((p) => p.status === "PENDENTE");
    const overdue = filteredPayments.filter((p) => p.status === "ATRASADO");

    const totalPaid = paid.reduce((sum, p) => sum + (p.paidValue ?? p.value), 0);
    const totalPending = pending.reduce((sum, p) => sum + p.value, 0);
    const totalOverdue = overdue.reduce((sum, p) => sum + p.value, 0);
    const totalAll = totalPaid + totalPending + totalOverdue;
    const inadimplencia = totalAll > 0 ? (totalOverdue / totalAll) * 100 : 0;

    return { totalPaid, totalPending, totalOverdue, inadimplencia, paidCount: paid.length, pendingCount: pending.length, overdueCount: overdue.length };
  }, [filteredPayments]);

  // ---- Monthly Revenue (last 12 months) ----
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months: { label: string; total: number; month: number; year: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: MONTH_NAMES[d.getMonth()],
        total: 0,
        month: d.getMonth(),
        year: d.getFullYear(),
      });
    }

    for (const p of payments) {
      if (p.status !== "PAGO" || !p.paidAt) continue;
      const paidDate = new Date(p.paidAt);
      const entry = months.find(
        (m) => m.month === paidDate.getMonth() && m.year === paidDate.getFullYear()
      );
      if (entry) {
        entry.total += p.paidValue ?? p.value;
      }
    }

    return months;
  }, [payments]);

  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map((m) => m.total), 1);

  // ---- Property Occupancy ----
  const occupancy = useMemo(() => {
    const counts: Record<string, number> = {
      ALUGADO: 0,
      DISPONIVEL: 0,
      MANUTENCAO: 0,
      INATIVO: 0,
    };
    for (const p of properties) {
      if (counts[p.status] !== undefined) counts[p.status]++;
      else counts[p.status] = (counts[p.status] || 0) + 1;
    }
    const total = properties.length || 1;
    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      percentage: (count / total) * 100,
      config: propertyStatusConfig[status] || { label: status, className: "", color: "bg-gray-300" },
    }));
  }, [properties]);

  const occupancyRate = properties.length > 0
    ? ((occupancy.find((o) => o.status === "ALUGADO")?.count || 0) / properties.length) * 100
    : 0;

  // ---- Contracts Summary ----
  const contractsSummary = useMemo(() => {
    const now = new Date();
    const active = contracts.filter((c) => c.status === "ATIVO");
    const activeTotal = active.reduce((sum, c) => sum + c.rentalValue, 0);

    const expiringIn = (days: number) => {
      const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      return active.filter((c) => {
        const end = new Date(c.endDate);
        return end >= now && end <= limit;
      });
    };

    const expiring30 = expiringIn(30);
    const expiring60 = expiringIn(60);
    const expiring90 = expiringIn(90);

    return { activeCount: active.length, activeTotal, expiring30, expiring60, expiring90 };
  }, [contracts]);

  // ---- Top Owners ----
  const topOwners = useMemo(() => {
    const ownerMap = new Map<string, {
      name: string;
      propertyCount: number;
      totalRentalValue: number;
      activeContracts: number;
    }>();

    for (const prop of properties) {
      const ownerId = prop.ownerId;
      const ownerName = prop.owner?.name || "Desconhecido";
      if (!ownerMap.has(ownerId)) {
        ownerMap.set(ownerId, { name: ownerName, propertyCount: 0, totalRentalValue: 0, activeContracts: 0 });
      }
      const entry = ownerMap.get(ownerId)!;
      entry.propertyCount++;
      entry.totalRentalValue += prop.rentalValue || 0;
    }

    for (const contract of contracts) {
      if (contract.status === "ATIVO" && ownerMap.has(contract.owner.id)) {
        ownerMap.get(contract.owner.id)!.activeContracts++;
      }
    }

    return Array.from(ownerMap.values())
      .sort((a, b) => b.totalRentalValue - a.totalRentalValue)
      .slice(0, 10);
  }, [properties, contracts]);

  // ---- Payments by Method ----
  const paymentsByMethod = useMemo(() => {
    const methodMap = new Map<string, { count: number; total: number }>();

    for (const p of filteredPayments) {
      if (p.status !== "PAGO") continue;
      const method = p.paymentMethod || "NAO_INFORMADO";
      if (!methodMap.has(method)) {
        methodMap.set(method, { count: 0, total: 0 });
      }
      const entry = methodMap.get(method)!;
      entry.count++;
      entry.total += p.paidValue ?? p.value;
    }

    const entries = Array.from(methodMap.entries()).map(([method, data]) => ({
      method,
      label: methodLabels[method] || "Nao informado",
      ...data,
    }));

    return entries.sort((a, b) => b.total - a.total);
  }, [filteredPayments]);

  const maxMethodTotal = Math.max(...paymentsByMethod.map((m) => m.total), 1);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Relatórios" subtitle="Análise e indicadores do portfólio" />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Header title="Relatórios" subtitle="Análise e indicadores do portfólio" />

      <div className="p-4 sm:p-6 space-y-6">
        {/* ---- Period Selector ---- */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          <span className="text-sm font-medium text-muted-foreground mr-1 shrink-0">Período:</span>
          {periodOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs shrink-0"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* ---- Relatórios PDF rápidos ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              Relatorios em PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <RelatorioMonthCard
                icon={<Calendar className="h-5 w-5" />}
                title="Locacoes do Mes"
                description="Imoveis alugados no mes selecionado"
                onGenerate={(month) =>
                  window.open(`/relatorios/locacoes-mes?month=${month}`, "_blank")
                }
              />
              <RelatorioInstantCard
                icon={<AlertOctagon className="h-5 w-5" />}
                title="Inadimplencia"
                description="Locatarios com pagamentos em atraso"
                color="red"
                onGenerate={() =>
                  window.open(`/relatorios/inadimplencia`, "_blank")
                }
              />
              <RelatorioDaysCard
                icon={<CalendarClock className="h-5 w-5" />}
                title="Contratos Vencendo"
                description="Contratos com termino proximo"
                color="amber"
                onGenerate={(days) =>
                  window.open(`/relatorios/contratos-vencendo?days=${days}`, "_blank")
                }
              />
              <RelatorioMonthCard
                icon={<RefreshCw className="h-5 w-5" />}
                title="Reajustes a Aplicar"
                description="Contratos com aniversario no mes"
                color="green"
                onGenerate={(month) =>
                  window.open(`/relatorios/reajustes?month=${month}`, "_blank")
                }
              />
              <RelatorioMonthCard
                icon={<ShieldAlert className="h-5 w-5" />}
                title="Contratos Seguro Fianca"
                description="Verificar se o seguro foi cobrado no mes"
                onGenerate={(month) =>
                  window.open(`/relatorios/seguro-fianca?month=${month}`, "_blank")
                }
              />
              <RelatorioOwnerYearCard
                icon={<Users className="h-5 w-5" />}
                title="Extrato Anual do Proprietario"
                description="Repasses do ano para declaracao de IR"
                color="blue"
                onGenerate={(ownerId, year) =>
                  window.open(
                    `/relatorios/extrato-proprietario?ownerId=${ownerId}&year=${year}`,
                    "_blank"
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* RESUMO FINANCEIRO                                                */}
        {/* ================================================================ */}
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Resumo Financeiro
          </h2>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total Faturado</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrencyShort(financialSummary.totalPaid)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{financialSummary.paidCount} pagamento(s)</p>
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
                    <p className="text-xs font-medium text-muted-foreground">Total A Receber</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrencyShort(financialSummary.totalPending)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{financialSummary.pendingCount} cobranca(s)</p>
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
                    <p className="text-xs font-medium text-muted-foreground">Total Em Atraso</p>
                    <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrencyShort(financialSummary.totalOverdue)}</p>
                    <p className="text-xs text-red-500 mt-1">{financialSummary.overdueCount} cobranca(s)</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Taxa de Inadimplencia</p>
                    <p className={cn("text-2xl font-bold mt-1", financialSummary.inadimplencia > 10 ? "text-red-600" : "text-foreground")}>
                      {financialSummary.inadimplencia.toFixed(1).replace(".", ",")}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">atraso / total</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                    <ShieldAlert className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Revenue Chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Faturamento Mensal</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Ultimos 12 meses (pagamentos recebidos)</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    {formatCurrencyShort(monthlyRevenue[monthlyRevenue.length - 1]?.total || 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">mes atual</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-5">
              <div className="flex items-end justify-between gap-1 sm:gap-2 h-[140px] overflow-x-auto">
                {monthlyRevenue.map((m, i) => {
                  const height = maxMonthlyRevenue > 0 ? (m.total / maxMonthlyRevenue) * 100 : 0;
                  const isCurrent = i === monthlyRevenue.length - 1;
                  return (
                    <div key={`${m.label}-${m.year}`} className="flex-1 min-w-[28px] flex flex-col items-center gap-1">
                      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap hidden sm:block">
                        {m.total > 0 ? formatCurrencyShort(m.total) : "-"}
                      </span>
                      <div className="w-full flex justify-center">
                        <div
                          className={cn(
                            "w-full max-w-[28px] sm:max-w-[36px] rounded-t-md transition-all",
                            isCurrent ? "bg-primary" : "bg-primary/20 hover:bg-primary/40"
                          )}
                          style={{ height: `${Math.max(height, 2)}px` }}
                        />
                      </div>
                      <span className={cn("text-[10px] sm:text-xs", isCurrent ? "font-semibold text-primary" : "text-muted-foreground")}>
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================================================================ */}
        {/* OCUPACAO DOS IMOVEIS + CONTRATOS                                 */}
        {/* ================================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ocupacao */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-semibold">Ocupacao dos Imoveis</CardTitle>
                </div>
                <span className="text-2xl font-bold text-primary">{occupancyRate.toFixed(0)}%</span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {/* Stacked bar */}
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted mb-5">
                {occupancy.map((item) => (
                  <div
                    key={item.status}
                    className={cn("h-full transition-all", item.config.color)}
                    style={{ width: `${item.percentage}%` }}
                  />
                ))}
              </div>

              {/* Legend with details */}
              <div className="space-y-3">
                {occupancy.map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-3 w-3 rounded-sm shrink-0", item.config.color)} />
                      <span className="text-sm">{item.config.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{item.count}</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total de imoveis</span>
                  <span className="font-semibold">{properties.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contratos */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Contratos</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              {/* Active stats */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-700 font-medium">Contratos Ativos</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">{contractsSummary.activeCount}</p>
                </div>
                <div className="bg-primary/5 rounded-lg p-3">
                  <p className="text-xs text-primary font-medium">Valor Total Mensal</p>
                  <p className="text-2xl font-bold text-primary mt-1">{formatCurrencyShort(contractsSummary.activeTotal)}</p>
                </div>
              </div>

              {/* Expiring counts */}
              <p className="text-xs font-medium text-muted-foreground mb-3">Vencendo em breve</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-red-50">
                  <span className="text-sm text-red-700">Proximo 30 dias</span>
                  <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">{contractsSummary.expiring30.length}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50">
                  <span className="text-sm text-amber-700">Proximo 60 dias</span>
                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">{contractsSummary.expiring60.length}</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-yellow-50">
                  <span className="text-sm text-yellow-700">Proximo 90 dias</span>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">{contractsSummary.expiring90.length}</Badge>
                </div>
              </div>

              {/* List expiring soon */}
              {contractsSummary.expiring30.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-2">Vencendo nos proximos 30 dias:</p>
                  <div className="space-y-1.5">
                    {contractsSummary.expiring30.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                        <div>
                          <span className="font-medium">{c.code}</span>
                          <span className="text-muted-foreground ml-2">{c.tenant?.name || "N/A"}</span>
                        </div>
                        <span className="text-muted-foreground">{formatDate(c.endDate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ================================================================ */}
        {/* TOP PROPRIETARIOS                                                */}
        {/* ================================================================ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">Top Proprietarios</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {topOwners.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Nenhum proprietario encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs w-12 text-center">#</TableHead>
                    <TableHead className="text-xs">Proprietário</TableHead>
                    <TableHead className="text-xs text-center">Imóveis</TableHead>
                    <TableHead className="text-xs text-right">Valor Locação Total</TableHead>
                    <TableHead className="text-xs text-center">Contratos Ativos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topOwners.map((owner, i) => (
                    <TableRow key={`${owner.name}-${i}`}>
                      <TableCell className="text-center">
                        <span className={cn(
                          "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold",
                          i === 0 ? "bg-yellow-100 text-yellow-700" :
                          i === 1 ? "bg-gray-200 text-gray-600" :
                          i === 2 ? "bg-orange-100 text-orange-700" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{owner.name}</TableCell>
                      <TableCell className="text-sm text-center">{owner.propertyCount}</TableCell>
                      <TableCell className="text-sm font-semibold text-right">{formatCurrency(owner.totalRentalValue)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                          {owner.activeContracts}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================ */}
        {/* PAGAMENTOS POR METODO                                            */}
        {/* ================================================================ */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">Pagamentos por Metodo</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            {paymentsByMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento no periodo.</p>
            ) : (
              <div className="space-y-4">
                {paymentsByMethod.map((item) => {
                  const barWidth = maxMethodTotal > 0 ? (item.total / maxMethodTotal) * 100 : 0;
                  return (
                    <div key={item.method}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.label}</span>
                          <Badge variant="outline" className="text-xs bg-muted">{item.count} pgto(s)</Badge>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(item.total)}</span>
                      </div>
                      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Total */}
                <div className="pt-3 border-t flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Total recebido</span>
                  <span className="text-sm font-bold">
                    {formatCurrency(paymentsByMethod.reduce((sum, m) => sum + m.total, 0))}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
