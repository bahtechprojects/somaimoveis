"use client";

import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  ArrowDownRight,
  CalendarPlus,
  Receipt,
  Building2,
  Landmark,
  Download,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PaymentForm } from "@/components/forms/payment-form";
import { GenerateChargesDialog } from "@/components/forms/generate-charges-dialog";

interface Payment {
  id: string;
  code: string;
  contractId: string;
  tenantId: string;
  ownerId: string;
  value: number;
  paidValue: number | null;
  fineValue: number | null;
  interestValue: number | null;
  discountValue: number | null;
  dueDate: string;
  paidAt: string | null;
  status: string;
  paymentMethod: string | null;
  description: string | null;
  splitOwnerValue: number | null;
  splitAdminValue: number | null;
  notes: string | null;
  nossoNumero?: string;
  linhaDigitavel?: string;
  boletoStatus?: string;
  contract: {
    id: string;
    code: string;
    property: { title: string };
  };
  tenant: { id: string; name: string };
  owner: { id: string; name: string };
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  PAGO: { label: "Pago", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  PENDENTE: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  ATRASADO: { label: "Atrasado", className: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  CANCELADO: { label: "Cancelado", className: "bg-gray-100 text-gray-500 border-gray-200", icon: Clock },
  PARCIAL: { label: "Parcial", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Clock },
};

const methodLabels: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CARTAO: "Cartao",
  TRANSFERENCIA: "Transferencia",
  DINHEIRO: "Dinheiro",
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

interface PaymentBreakdown {
  aluguel: number;
  condominio: number;
  iptu: number;
  total: number;
}

function parseBreakdown(notes: string | null): PaymentBreakdown | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (typeof parsed.aluguel === "number") return parsed as PaymentBreakdown;
    return null;
  } catch {
    return null;
  }
}

export default function FinanceiroPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><p className="text-sm text-muted-foreground">Carregando...</p></div>}>
      <FinanceiroContent />
    </Suspense>
  );
}

function FinanceiroContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [boletoLoading, setBoletoLoading] = useState<Record<string, boolean>>({});
  const [notifyLoading, setNotifyLoading] = useState<Record<string, boolean>>({});

  async function fetchPayments() {
    setLoading(true);
    try {
      const response = await fetch("/api/payments");
      if (response.ok) {
        const data = await response.json();
        setPayments(data);
      }
    } catch (error) {
      console.error("Erro ao buscar pagamentos:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPayments();
  }, []);

  useEffect(() => {
    if (searchParams.get("novo") === "true") {
      setSelectedPayment(undefined);
      setFormOpen(true);
      router.replace("/financeiro");
    }
  }, [searchParams, router]);

  // Summary calculations
  const totalFaturamento = payments
    .filter((p) => p.status === "PAGO")
    .reduce((sum, p) => sum + (p.paidValue ?? p.value), 0);

  const totalAReceber = payments
    .filter((p) => p.status === "PENDENTE")
    .reduce((sum, p) => sum + p.value, 0);

  const totalEmAtraso = payments
    .filter((p) => p.status === "ATRASADO")
    .reduce((sum, p) => sum + p.value, 0);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const recebidoEsteMes = payments
    .filter((p) => {
      if (p.status !== "PAGO" || !p.paidAt) return false;
      const paidDate = new Date(p.paidAt);
      return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.paidValue ?? p.value), 0);

  // Client-side filtering by status tab
  const filteredByStatus = payments.filter((payment) => {
    if (activeTab === "todos") return true;
    if (activeTab === "pendentes") return payment.status === "PENDENTE";
    if (activeTab === "pagos") return payment.status === "PAGO";
    if (activeTab === "atrasados") return payment.status === "ATRASADO";
    if (activeTab === "emitidos") return payment.boletoStatus === "EMITIDO";
    return true;
  });

  // Client-side search
  const filteredPayments = filteredByStatus.filter((payment) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      payment.code.toLowerCase().includes(term) ||
      (payment.tenant?.name || "").toLowerCase().includes(term) ||
      (payment.owner?.name || "").toLowerCase().includes(term) ||
      (payment.contract?.code || "").toLowerCase().includes(term) ||
      (payment.contract?.property?.title || "").toLowerCase().includes(term) ||
      (payment.description || "").toLowerCase().includes(term)
    );
  });

  function handleNewPayment() {
    setSelectedPayment(undefined);
    setFormOpen(true);
  }

  function handleEditPayment(payment: Payment) {
    setSelectedPayment(payment);
    setFormOpen(true);
  }

  function handleDeleteClick(payment: Payment) {
    setPaymentToDelete(payment);
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!paymentToDelete) return;
    try {
      const response = await fetch(`/api/payments/${paymentToDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao excluir pagamento");
        return;
      }
      fetchPayments();
    } catch (error) {
      toast.error("Erro ao excluir pagamento");
    } finally {
      setDeleteDialogOpen(false);
      setPaymentToDelete(null);
    }
  }

  async function handleMarkAsPaid(payment: Payment) {
    try {
      const response = await fetch(`/api/payments/${payment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAGO",
          paidAt: new Date().toISOString(),
          paidValue: payment.value,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao atualizar pagamento");
        return;
      }
      fetchPayments();
    } catch (error) {
      toast.error("Erro ao atualizar pagamento");
    }
  }

  function handleFormSuccess() {
    fetchPayments();
  }

  const handleEmitBoleto = async (paymentId: string) => {
    setBoletoLoading(prev => ({ ...prev, [paymentId]: true }));
    try {
      const res = await fetch(`/api/payments/${paymentId}/boleto`, { method: "POST" });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Erro do servidor (${res.status}). Verifique as credenciais do Sicredi.`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao emitir boleto");
      toast.success("Boleto emitido com sucesso!");
      fetchPayments();
    } catch (err: any) {
      toast.error(err.message || "Erro ao emitir boleto");
    } finally {
      setBoletoLoading(prev => ({ ...prev, [paymentId]: false }));
    }
  };

  const handleDownloadBoleto = async (paymentId: string, code: string) => {
    try {
      const res = await fetch(`/api/payments/${paymentId}/boleto`);
      if (!res.ok) throw new Error("Erro ao baixar boleto");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `boleto-${code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar boleto");
    }
  };

  const handleEmitBoletosBatch = async () => {
    if (!confirm("Emitir boletos para todos os pagamentos pendentes?")) return;
    try {
      const res = await fetch("/api/payments/boleto/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Erro do servidor (${res.status}). Verifique as credenciais do Sicredi.`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao emitir boletos");
      toast.success(`${data.emitidos} boleto(s) emitido(s), ${data.erros?.length || 0} erro(s)`);
      fetchPayments();
    } catch (err: any) {
      toast.error(err.message || "Erro ao emitir boletos");
    }
  };

  const handleSendNotify = async (paymentId: string, channels: string[]) => {
    setNotifyLoading(prev => ({ ...prev, [paymentId]: true }));
    try {
      const res = await fetch(`/api/payments/${paymentId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Erro do servidor (${res.status}).`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar cobranca");
      const successResults = data.results?.filter((r: any) => r.success) || [];
      const failResults = data.results?.filter((r: any) => !r.success) || [];
      if (successResults.length > 0) {
        toast.success(`Cobranca enviada via ${successResults.map((r: any) => r.channel).join(", ")}`);
      }
      if (failResults.length > 0) {
        for (const f of failResults) {
          toast.error(`${f.channel}: ${f.error}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar cobranca");
    } finally {
      setNotifyLoading(prev => ({ ...prev, [paymentId]: false }));
    }
  };

  return (
    <div className="flex flex-col">
      <Header title="Financeiro" subtitle="Controle de pagamentos e receitas" />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Faturamento Total</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : formatCurrency(totalFaturamento)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Todos os pagos</p>
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
                  <p className="text-xs font-medium text-muted-foreground">A Receber</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : formatCurrency(totalAReceber)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {payments.filter((p) => p.status === "PENDENTE").length} cobrancas pendentes
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
                  <p className="text-xs font-medium text-muted-foreground">Em Atraso</p>
                  <p className="text-2xl font-bold mt-1 text-red-600">
                    {loading ? "..." : formatCurrency(totalEmAtraso)}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs text-red-500 font-medium">
                      {payments.filter((p) => p.status === "ATRASADO").length} cobranca(s) atrasada(s)
                    </span>
                  </div>
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
                  <p className="text-xs font-medium text-muted-foreground">Recebido este Mes</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : formatCurrency(recebidoEsteMes)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {payments.filter((p) => {
                      if (p.status !== "PAGO" || !p.paidAt) return false;
                      const paidDate = new Date(p.paidAt);
                      return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
                    }).length} pagamento(s)
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                  <DollarSign className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 p-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                  <TabsList className="h-9 sm:h-8">
                    <TabsTrigger value="todos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Todos</TabsTrigger>
                    <TabsTrigger value="pendentes" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Pendentes</TabsTrigger>
                    <TabsTrigger value="emitidos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Emitidos</TabsTrigger>
                    <TabsTrigger value="pagos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Pagos</TabsTrigger>
                    <TabsTrigger value="atrasados" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Atrasados</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button size="sm" variant="outline" className="gap-1.5 h-10 sm:h-8 text-xs" onClick={() => setGenerateOpen(true)}>
                  <CalendarPlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Gerar Cobrancas</span>
                  <span className="sm:hidden">Gerar</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 h-10 sm:h-8 text-xs" onClick={handleEmitBoletosBatch}>
                  <Receipt className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Emitir Boletos</span>
                  <span className="sm:hidden">Boletos</span>
                </Button>
                <Button size="sm" className="gap-1.5 h-10 sm:h-8 text-xs" onClick={handleNewPayment}>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Nova Cobranca</span>
                  <span className="sm:hidden">Nova</span>
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar pagamento..."
                  className="pl-9 h-10 sm:h-8 w-full sm:w-[200px] text-sm sm:text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredPayments.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "Nenhum pagamento encontrado para a busca."
                    : "Nenhum pagamento cadastrado."}
                </p>
              </div>
            ) : (
              <>
              {/* Mobile card view */}
              <div className="divide-y md:hidden">
                {filteredPayments.map((payment) => {
                  const status = statusConfig[payment.status] || {
                    label: payment.status,
                    className: "bg-muted text-muted-foreground",
                    icon: Clock,
                  };
                  const StatusIcon = status.icon;
                  const breakdown = parseBreakdown(payment.notes);
                  return (
                    <div key={payment.id} className="p-4 active:bg-muted/50 cursor-pointer" onClick={() => router.push(`/contratos/${payment.contractId}`)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{payment.tenant?.name || "N/A"}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {payment.contract.code} - {payment.contract.property?.title || "N/A"}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPayment(payment)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                            </DropdownMenuItem>
                            {payment.status !== "PAGO" && (
                              <DropdownMenuItem onClick={() => handleMarkAsPaid(payment)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Marcar como Pago
                              </DropdownMenuItem>
                            )}
                            {!payment.nossoNumero && (payment.status === "PENDENTE" || payment.status === "ATRASADO") && (
                              <DropdownMenuItem
                                disabled={boletoLoading[payment.id]}
                                onClick={(e) => { e.stopPropagation(); handleEmitBoleto(payment.id); }}
                              >
                                <Receipt className="h-3.5 w-3.5 mr-2" />
                                {boletoLoading[payment.id] ? "Emitindo..." : "Emitir Boleto"}
                              </DropdownMenuItem>
                            )}
                            {payment.nossoNumero && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadBoleto(payment.id, payment.code); }}>
                                <Receipt className="h-3.5 w-3.5 mr-2" /> Baixar Boleto
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem variant="destructive" onClick={() => handleDeleteClick(payment)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-[10px] h-5 border gap-1", status.className)}>
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </Badge>
                          {payment.boletoStatus && (
                            <Badge variant="outline" className="text-[10px] h-5 border gap-1 bg-blue-50 text-blue-700 border-blue-200">
                              <Receipt className="h-3 w-3" />
                              {payment.boletoStatus}
                            </Badge>
                          )}
                          {breakdown && breakdown.condominio > 0 && (
                            <Badge variant="outline" className="text-[10px] h-5 border gap-1 bg-orange-50 text-orange-700 border-orange-200">
                              <Building2 className="h-3 w-3" />
                              Cond.
                            </Badge>
                          )}
                          {breakdown && breakdown.iptu > 0 && (
                            <Badge variant="outline" className="text-[10px] h-5 border gap-1 bg-purple-50 text-purple-700 border-purple-200">
                              <Landmark className="h-3 w-3" />
                              IPTU
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">Venc: {formatDate(payment.dueDate)}</span>
                        </div>
                        <span className="font-semibold text-sm">{formatCurrency(payment.value)}</span>
                      </div>
                      {breakdown && (breakdown.condominio > 0 || breakdown.iptu > 0) && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Aluguel: {formatCurrency(breakdown.aluguel)}
                          {breakdown.condominio > 0 ? ` + Cond: ${formatCurrency(breakdown.condominio)}` : ""}
                          {breakdown.iptu > 0 ? ` + IPTU: ${formatCurrency(breakdown.iptu)}` : ""}
                        </p>
                      )}
                      {payment.paidAt && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Pago em {formatDate(payment.paidAt)}
                          {payment.paymentMethod ? ` via ${methodLabels[payment.paymentMethod] || payment.paymentMethod}` : ""}
                        </p>
                      )}
                      {payment.nossoNumero && (
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-3 text-xs gap-1 text-blue-600 border-blue-200"
                            onClick={(e) => { e.stopPropagation(); handleDownloadBoleto(payment.id, payment.code); }}
                          >
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-3 text-xs gap-1 text-green-600 border-green-200"
                                disabled={notifyLoading[payment.id]}
                              >
                                <Send className="h-3.5 w-3.5" />
                                {notifyLoading[payment.id] ? "Enviando..." : "Cobrar"}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendNotify(payment.id, ["whatsapp"]); }}>
                                WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendNotify(payment.id, ["email"]); }}>
                                Email
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendNotify(payment.id, ["whatsapp", "email"]); }}>
                                WhatsApp + Email
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop table view */}
              <div className="overflow-x-auto hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Contrato</TableHead>
                    <TableHead className="text-xs">Locatário</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs">Composição</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Pagamento</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Metodo</TableHead>
                    <TableHead className="text-xs">Boleto</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => {
                    const status = statusConfig[payment.status] || {
                      label: payment.status,
                      className: "bg-muted text-muted-foreground",
                      icon: Clock,
                    };
                    const StatusIcon = status.icon;
                    const breakdown = parseBreakdown(payment.notes);
                    return (
                      <TableRow key={payment.id} className="cursor-pointer" onClick={() => router.push(`/contratos/${payment.contractId}`)}>
                        <TableCell className="font-mono text-xs">{payment.code}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {payment.contract.code}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {payment.tenant?.name || "N/A"}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-right">
                          {formatCurrency(payment.value)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {breakdown && breakdown.condominio > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 border gap-1 bg-orange-50 text-orange-700 border-orange-200" title={`Condominio: ${formatCurrency(breakdown.condominio)}`}>
                                <Building2 className="h-3 w-3" />
                                Cond.
                              </Badge>
                            )}
                            {breakdown && breakdown.iptu > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 border gap-1 bg-purple-50 text-purple-700 border-purple-200" title={`IPTU mensal: ${formatCurrency(breakdown.iptu)}`}>
                                <Landmark className="h-3 w-3" />
                                IPTU
                              </Badge>
                            )}
                            {(!breakdown || (breakdown.condominio === 0 && breakdown.iptu === 0)) && (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(payment.dueDate)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {payment.paidAt ? formatDate(payment.paidAt) : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={cn("text-xs border gap-1", status.className)}>
                              <StatusIcon className="h-3 w-3" />
                              {status.label}
                            </Badge>
                            {payment.boletoStatus && (
                              <Badge variant="outline" className="text-xs border gap-1 bg-blue-50 text-blue-700 border-blue-200">
                                <Receipt className="h-3 w-3" />
                                {payment.boletoStatus}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {payment.paymentMethod ? (methodLabels[payment.paymentMethod] || payment.paymentMethod) : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                          {payment.nossoNumero ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1 text-blue-600 hover:text-blue-800"
                                onClick={(e) => { e.stopPropagation(); handleDownloadBoleto(payment.id, payment.code); }}
                              >
                                <Download className="h-3.5 w-3.5" />
                                PDF
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs gap-1 text-green-600 hover:text-green-800"
                                    disabled={notifyLoading[payment.id]}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    {notifyLoading[payment.id] ? "..." : "Cobrar"}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendNotify(payment.id, ["whatsapp"]); }}>
                                    WhatsApp
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendNotify(payment.id, ["email"]); }}>
                                    Email
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSendNotify(payment.id, ["whatsapp", "email"]); }}>
                                    WhatsApp + Email
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </>
                          ) : !payment.nossoNumero && (payment.status === "PENDENTE" || payment.status === "ATRASADO") ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground"
                              disabled={boletoLoading[payment.id]}
                              onClick={(e) => { e.stopPropagation(); handleEmitBoleto(payment.id); }}
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              {boletoLoading[payment.id] ? "..." : "Emitir"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditPayment(payment)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              {payment.status !== "PAGO" && (
                                <DropdownMenuItem onClick={() => handleMarkAsPaid(payment)}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                  Marcar como Pago
                                </DropdownMenuItem>
                              )}
                              {!payment.nossoNumero && (payment.status === "PENDENTE" || payment.status === "ATRASADO") && (
                                <DropdownMenuItem
                                  disabled={boletoLoading[payment.id]}
                                  onClick={(e) => { e.stopPropagation(); handleEmitBoleto(payment.id); }}
                                >
                                  <Receipt className="h-3.5 w-3.5 mr-2" />
                                  {boletoLoading[payment.id] ? "Emitindo..." : "Emitir Boleto"}
                                </DropdownMenuItem>
                              )}
                              {payment.nossoNumero && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadBoleto(payment.id, payment.code); }}>
                                  <Receipt className="h-3.5 w-3.5 mr-2" />
                                  Baixar Boleto
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleDeleteClick(payment)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generate Charges Dialog */}
      <GenerateChargesDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onSuccess={fetchPayments}
      />

      {/* Payment Form Dialog */}
      <PaymentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        payment={selectedPayment}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pagamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o pagamento{" "}
              <strong>{paymentToDelete?.code}</strong>? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
