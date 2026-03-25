"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FileText,
  ExternalLink,
  Building2,
  Users,
  UserCheck,
  Calendar,
  Shield,
  Clock,
  Download,
  Paperclip,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContractForm } from "@/components/forms/contract-form";
import { BillingTimeline } from "@/components/billing/billing-timeline";

// ---------- Types ----------

interface Payment {
  id: string;
  code: string;
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
  irrfValue: number | null;
  irrfRate: number | null;
  grossToOwner: number | null;
  netToOwner: number | null;
  notes: string | null;
}

interface Contract {
  id: string;
  code: string;
  type: string;
  status: string;
  propertyId: string;
  property: { id: string; title: string; address?: string };
  ownerId: string;
  owner: { id: string; name: string; email?: string; paymentDay?: number };
  tenantId: string;
  tenant: { id: string; name: string; email?: string; paymentDay?: number };
  rentalValue: number;
  adminFeePercent: number;
  paymentDay: number;
  startDate: string;
  endDate: string;
  guaranteeType: string | null;
  guaranteeValue: number | null;
  guaranteeNotes: string | null;
  intermediationFee: number | null;
  intermediationInstallments: number | null;
  adjustmentIndex: string | null;
  adjustmentMonth: number | null;
  lastAdjustmentPercent: number | null;
  lastAdjustmentDate: string | null;
  documentUrl: string | null;
  notes: string | null;
  createdAt: string;
  payments: Payment[];
}

interface ContractDocument {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  size: number | null;
  category: string | null;
  createdAt: string;
}

// ---------- Config maps ----------

const contractStatusConfig: Record<string, { label: string; className: string }> = {
  ATIVO: { label: "Ativo", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  PENDENTE_RENOVACAO: { label: "Renovacao", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ENCERRADO: { label: "Encerrado", className: "bg-muted text-muted-foreground" },
  CANCELADO: { label: "Cancelado", className: "bg-red-100 text-red-700 border-red-200" },
};

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  PAGO: { label: "Pago", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  PENDENTE: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  ATRASADO: { label: "Atrasado", className: "bg-red-100 text-red-700 border-red-200" },
  CANCELADO: { label: "Cancelado", className: "bg-gray-100 text-gray-500 border-gray-200" },
  PARCIAL: { label: "Parcial", className: "bg-blue-100 text-blue-700 border-blue-200" },
};

const guaranteeTypeLabels: Record<string, string> = {
  FIADOR: "Fiador",
  CAUCAO: "Caucao",
  SEGURO_FIANCA: "Seguro Fianca",
  TITULO_CAPITALIZACAO: "Titulo Capitalizacao",
  SEM_GARANTIA: "Sem Garantia",
};

const contractTypeLabels: Record<string, string> = {
  LOCACAO: "Locacao",
  VENDA: "Venda",
  TEMPORADA: "Temporada",
};

const monthLabels: Record<number, string> = {
  1: "Janeiro",
  2: "Fevereiro",
  3: "Marco",
  4: "Abril",
  5: "Maio",
  6: "Junho",
  7: "Julho",
  8: "Agosto",
  9: "Setembro",
  10: "Outubro",
  11: "Novembro",
  12: "Dezembro",
};

// ---------- Helpers ----------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateLong(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ---------- Sub-components ----------

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

// ---------- Main Page ----------

export default function ContratoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [relatedDocs, setRelatedDocs] = useState<{ id: string; code: string; type: string; status: string; startDate: string; documentUrl?: string }[]>([]);
  const [reajusteDialogOpen, setReajusteDialogOpen] = useState(false);
  const [reajustePercent, setReajustePercent] = useState("");
  const [reajusteLoading, setReajusteLoading] = useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewEndDate, setRenewEndDate] = useState("");
  const [renewRentalValue, setRenewRentalValue] = useState("");
  const [renewLoading, setRenewLoading] = useState(false);
  const [contractDocs, setContractDocs] = useState<ContractDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  async function fetchContract() {
    setLoading(true);
    setNotFound(false);
    try {
      const response = await fetch(`/api/contracts/${contractId}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setContract(data);
        // Fetch related docs (same tenant, different type)
        if (data.tenantId) {
          fetch(`/api/contracts?tenantId=${data.tenantId}`)
            .then(r => r.json())
            .then(res => {
              const items = Array.isArray(res) ? res : res.data || [];
              setRelatedDocs(items.filter((c: any) => c.id !== data.id && c.type !== "LOCACAO"));
            })
            .catch(() => {});
        }
      }
    } catch (error) {
      console.error("Erro ao buscar contrato:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchContractDocs() {
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/documents?entityType=CONTRACT&entityId=${contractId}`);
      if (res.ok) {
        const data = await res.json();
        setContractDocs(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    if (contractId) {
      fetchContract();
      fetchContractDocs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  async function handleDeleteConfirm() {
    if (!contract) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Erro ao excluir contrato");
        return;
      }
      router.push("/contratos");
    } catch (error) {
      alert("Erro ao excluir contrato");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  function handleFormSuccess() {
    fetchContract();
  }

  async function handleApplyReajuste() {
    if (!contract || !reajustePercent) return;
    setReajusteLoading(true);
    try {
      const percent = parseFloat(reajustePercent);
      if (isNaN(percent) || percent <= 0) {
        alert("Informe um percentual valido.");
        return;
      }
      const newRentalValue = contract.rentalValue * (1 + percent / 100);
      const response = await fetch(`/api/contracts/${contract.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rentalValue: Math.round(newRentalValue * 100) / 100,
          lastAdjustmentPercent: percent,
          lastAdjustmentDate: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Erro ao aplicar reajuste");
        return;
      }
      setReajusteDialogOpen(false);
      setReajustePercent("");
      fetchContract();
    } catch (error) {
      alert("Erro ao aplicar reajuste");
    } finally {
      setReajusteLoading(false);
    }
  }

  async function handleRenewContract() {
    if (!contract) return;
    setRenewLoading(true);
    try {
      // Calculate renewalMonths from endDate if provided
      let renewalMonths: number | undefined;
      if (renewEndDate) {
        const oldEnd = new Date(contract.endDate);
        const newEnd = new Date(renewEndDate);
        if (newEnd <= oldEnd) {
          alert("A nova data de termino deve ser posterior a data de termino atual.");
          return;
        }
        // Calculate months difference from old endDate + 1 day to new endDate
        const newStart = new Date(oldEnd);
        newStart.setDate(newStart.getDate() + 1);
        renewalMonths = (newEnd.getFullYear() - newStart.getFullYear()) * 12 + (newEnd.getMonth() - newStart.getMonth());
        if (renewalMonths < 1) renewalMonths = 1;
      }

      const payload: Record<string, unknown> = {};
      if (renewalMonths != null) payload.renewalMonths = renewalMonths;
      if (renewRentalValue && !isNaN(parseFloat(renewRentalValue))) {
        payload.rentalValue = parseFloat(renewRentalValue);
      }

      const response = await fetch(`/api/contracts/${contract.id}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Erro ao renovar contrato");
        return;
      }

      const newContract = await response.json();
      setRenewDialogOpen(false);
      setRenewEndDate("");
      setRenewRentalValue("");
      // Navigate to the new contract
      router.push(`/contratos/${newContract.id}`);
    } catch (error) {
      alert("Erro ao renovar contrato");
    } finally {
      setRenewLoading(false);
    }
  }

  // ---------- Loading state ----------

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Contrato" subtitle="Carregando detalhes..." />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ---------- 404 state ----------

  if (notFound || !contract) {
    return (
      <div className="flex flex-col">
        <Header title="Contrato" subtitle="Contrato nao encontrado" />
        <div className="p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <FileText className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">Contrato nao encontrado.</p>
            <Button variant="outline" onClick={() => router.push("/contratos")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Contratos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Computed values ----------

  const statusCfg = contractStatusConfig[contract.status] || {
    label: contract.status,
    className: "bg-muted text-muted-foreground",
  };

  const typeLabel = contractTypeLabels[contract.type] || contract.type;

  const adminValue = (contract.rentalValue * contract.adminFeePercent) / 100;
  const ownerNetValue = contract.rentalValue - adminValue;

  // IRRF: check the latest payment for IRRF data
  const latestPaymentWithIrrf = contract.payments.find((p) => p.irrfValue && p.irrfValue > 0);
  const hasIrrf = !!latestPaymentWithIrrf;

  const totalReceived = contract.payments
    .filter((p) => p.status === "PAGO" || p.status === "PARCIAL")
    .reduce((sum, p) => sum + (p.paidValue ?? 0), 0);

  const totalOverdue = contract.payments
    .filter((p) => p.status === "ATRASADO")
    .reduce((sum, p) => sum + p.value, 0);

  const paidCount = contract.payments.filter((p) => p.status === "PAGO").length;
  const pendingCount = contract.payments.filter((p) => p.status === "PENDENTE").length;
  const overdueCount = contract.payments.filter((p) => p.status === "ATRASADO").length;

  return (
    <div className="flex flex-col">
      <Header title="Contrato" subtitle="Detalhes do contrato" />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Back button + Header */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => router.push("/contratos")}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Contratos
          </Button>

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    {contract.code}
                  </h2>
                  <Badge variant="outline" className={cn("text-xs border", statusCfg.className)}>
                    {statusCfg.label}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {typeLabel}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Criado em {formatDateLong(contract.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {(contract.status === "ATIVO" || contract.status === "PENDENTE_RENOVACAO") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setRenewDialogOpen(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Renovar Contrato
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setReajusteDialogOpen(true)}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Aplicar Reajuste
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setFormOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Button>
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">Valor Aluguel</p>
              </div>
              <p className="text-xl font-bold text-primary mt-1">
                {formatCurrency(contract.rentalValue)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Taxa Adm.</p>
              </div>
              <p className="text-xl font-bold text-foreground mt-1">
                {formatCurrency(adminValue)}
              </p>
              <p className="text-xs text-muted-foreground">{contract.adminFeePercent}%</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <p className="text-xs font-medium text-muted-foreground">Total Recebido</p>
              </div>
              <p className="text-xl font-bold text-emerald-600 mt-1">
                {formatCurrency(totalReceived)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <p className="text-xs font-medium text-muted-foreground">Total em Atraso</p>
              </div>
              <p className="text-xl font-bold text-red-600 mt-1">
                {formatCurrency(totalOverdue)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            {/* Informacoes do Contrato */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <SectionTitle icon={FileText} title="Informacoes do Contrato" />
                <div className="divide-y">
                  <InfoRow label="Codigo" value={contract.code} />
                  <InfoRow
                    label="Tipo"
                    value={
                      <Badge variant="secondary" className="text-xs">
                        {typeLabel}
                      </Badge>
                    }
                  />
                  <InfoRow
                    label="Status"
                    value={
                      <Badge variant="outline" className={cn("text-xs border", statusCfg.className)}>
                        {statusCfg.label}
                      </Badge>
                    }
                  />
                  <InfoRow label="Data Inicio" value={formatDate(contract.startDate)} />
                  <InfoRow label="Data Termino" value={formatDate(contract.endDate)} />
                  <InfoRow label="Dia Pagamento Locatario" value={`Dia ${contract.tenant?.paymentDay || contract.paymentDay}`} />
                  <InfoRow label="Dia Pagamento Proprietario" value={`Dia ${contract.owner?.paymentDay || 10}`} />
                  <InfoRow
                    label="Indice de Reajuste"
                    value={contract.adjustmentIndex || "Nao definido"}
                  />
                  <InfoRow
                    label="Mes de Reajuste"
                    value={
                      contract.adjustmentMonth
                        ? monthLabels[contract.adjustmentMonth] || String(contract.adjustmentMonth)
                        : "Nao definido"
                    }
                  />
                  <InfoRow
                    label="Taxa Intermediacao"
                    value={
                      contract.intermediationFee != null
                        ? `${contract.intermediationFee}%`
                        : "-"
                    }
                  />
                  <InfoRow
                    label="Parcelas Intermediacao"
                    value={contract.intermediationInstallments ?? "-"}
                  />
                  {(contract.lastAdjustmentPercent != null || contract.lastAdjustmentDate) && (
                    <InfoRow
                      label="Ultimo Reajuste"
                      value={
                        <span>
                          {contract.lastAdjustmentPercent != null
                            ? `${contract.lastAdjustmentPercent}%`
                            : "-"}
                          {contract.lastAdjustmentDate && (
                            <span className="text-muted-foreground ml-2">
                              em {formatDate(contract.lastAdjustmentDate)}
                            </span>
                          )}
                        </span>
                      }
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Valores */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <SectionTitle icon={DollarSign} title="Valores" />
                <div className="divide-y">
                  <InfoRow label="Valor Aluguel" value={formatCurrency(contract.rentalValue)} />
                  <InfoRow label="Taxa Administrativa" value={`${contract.adminFeePercent}%`} />
                  <InfoRow label="Valor Administrativo" value={formatCurrency(adminValue)} />
                  <InfoRow label="Bruto ao Proprietario" value={formatCurrency(ownerNetValue)} />
                  {hasIrrf && latestPaymentWithIrrf ? (
                    <>
                      <InfoRow
                        label="IRRF Retido"
                        value={
                          <span className="text-amber-600 font-semibold">
                            {formatCurrency(latestPaymentWithIrrf.irrfValue!)}
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              ({((latestPaymentWithIrrf.irrfRate || 0) * 100).toFixed(1)}%)
                            </span>
                          </span>
                        }
                      />
                      <InfoRow
                        label="Liquido ao Proprietario"
                        value={
                          <span className="text-emerald-600 font-semibold">
                            {formatCurrency(latestPaymentWithIrrf.netToOwner ?? ownerNetValue)}
                          </span>
                        }
                      />
                    </>
                  ) : (
                    <InfoRow
                      label="Liquido ao Proprietario"
                      value={
                        <span className="text-emerald-600 font-semibold">
                          {formatCurrency(ownerNetValue)}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            (isento IRRF)
                          </span>
                        </span>
                      }
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pagamentos */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                <div className="p-6 pb-4">
                  <SectionTitle icon={DollarSign} title="Pagamentos" />

                  {/* Summary bar */}
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-muted-foreground">
                        Pagos: <span className="font-medium text-foreground">{paidCount}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                      <span className="text-muted-foreground">
                        Pendentes: <span className="font-medium text-foreground">{pendingCount}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-muted-foreground">
                        Atrasados: <span className="font-medium text-foreground">{overdueCount}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {contract.payments.length === 0 ? (
                  <div className="flex items-center justify-center py-8 border-t">
                    <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Codigo</TableHead>
                        <TableHead className="text-xs">Valor</TableHead>
                        <TableHead className="text-xs">Vencimento</TableHead>
                        <TableHead className="text-xs">Data Pgto.</TableHead>
                        <TableHead className="text-xs">Valor Pago</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Metodo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contract.payments.map((payment) => {
                        const pStatus = paymentStatusConfig[payment.status] || {
                          label: payment.status,
                          className: "bg-muted text-muted-foreground",
                        };
                        return (
                          <TableRow key={payment.id}>
                            <TableCell className="text-xs font-medium">
                              {payment.code}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatCurrency(payment.value)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(payment.dueDate)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {payment.paidAt ? formatDate(payment.paidAt) : "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {payment.paidValue != null
                                ? formatCurrency(payment.paidValue)
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("text-xs border", pStatus.className)}
                              >
                                {pStatus.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {payment.paymentMethod || "-"}
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

          {/* Right column - 1/3 */}
          <div className="space-y-6">
            {/* Partes */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <SectionTitle icon={Users} title="Partes" />
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Imovel</p>
                    <Link
                      href={`/imoveis/${contract.propertyId}`}
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {contract.property?.title || "N/A"}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Proprietario</p>
                    <Link
                      href={`/proprietarios/${contract.ownerId}`}
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {contract.owner.name}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Locatario</p>
                    <Link
                      href={`/locatarios/${contract.tenantId}`}
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      {contract.tenant?.name || "N/A"}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Garantia */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <SectionTitle icon={Shield} title="Garantia" />
                <div className="divide-y">
                  <InfoRow
                    label="Tipo"
                    value={
                      contract.guaranteeType
                        ? guaranteeTypeLabels[contract.guaranteeType] || contract.guaranteeType
                        : "Nao definido"
                    }
                  />
                  <InfoRow
                    label="Valor"
                    value={
                      contract.guaranteeValue != null
                        ? formatCurrency(contract.guaranteeValue)
                        : "-"
                    }
                  />
                  {contract.guaranteeNotes && (
                    <div className="py-2.5">
                      <p className="text-sm text-muted-foreground mb-1">Observacoes</p>
                      <p className="text-sm">{contract.guaranteeNotes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Documento */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <SectionTitle icon={FileText} title="Documento" />
                {contract.documentUrl ? (
                  <div className="flex items-center gap-4">
                    <a
                      href={contract.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      Visualizar PDF
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={contract.documentUrl}
                      download={`${contract.code}.pdf`}
                      className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
                    >
                      Baixar PDF
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
                )}
              </CardContent>
            </Card>

            {/* Documentos Anexados (API) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6">
                <SectionTitle icon={Paperclip} title="Documentos" />
                {docsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : contractDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
                ) : (
                  <div className="space-y-2">
                    {contractDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(doc.createdAt)}
                              {doc.size != null && (
                                <span className="ml-2">
                                  {doc.size < 1024
                                    ? `${doc.size} B`
                                    : doc.size < 1048576
                                    ? `${(doc.size / 1024).toFixed(0)} KB`
                                    : `${(doc.size / 1048576).toFixed(1)} MB`}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <a
                          href={doc.url}
                          download={doc.name}
                          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0 ml-2"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Baixar
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Documentos Relacionados (Vistorias, Procurações, etc.) */}
            {relatedDocs.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <SectionTitle icon={FileText} title="Documentos Vinculados" />
                  <div className="space-y-2">
                    {relatedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.code}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.type === "VISTORIA" ? "Vistoria" : doc.type === "PROCURACAO" ? "Procuracao" : doc.type === "ADMINISTRACAO" ? "Administracao" : doc.type === "ADITIVO" ? "Aditivo" : doc.type}
                              {doc.startDate ? ` - ${formatDate(doc.startDate)}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.documentUrl && (
                            <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" /> PDF
                            </a>
                          )}
                          <Link href={`/contratos/${doc.id}`} className="text-xs text-primary hover:underline">
                            Ver detalhes
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Observacoes */}
            {contract.notes && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <SectionTitle icon={Clock} title="Observacoes" />
                  <p className="text-sm text-muted-foreground">{contract.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Billing Timeline - show for the most recent non-paid payment */}
        {contract.payments.length > 0 && (() => {
          const relevantPayment = contract.payments.find(
            (p: Payment) => p.status === "ATRASADO" || p.status === "PENDENTE"
          ) || contract.payments[0];
          return (
            <BillingTimeline
              dueDate={relevantPayment.dueDate}
              status={relevantPayment.status}
              paidAt={relevantPayment.paidAt}
              value={relevantPayment.value}
              fineValue={relevantPayment.fineValue}
              interestValue={relevantPayment.interestValue}
            />
          );
        })()}
      </div>

      {/* Contract Form Dialog */}
      <ContractForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contract={contract}
        onSuccess={handleFormSuccess}
      />

      {/* Reajuste Dialog */}
      <Dialog open={reajusteDialogOpen} onOpenChange={setReajusteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar Reajuste</DialogTitle>
            <DialogDescription>
              Valor atual do aluguel: {formatCurrency(contract.rentalValue)}.
              Informe o percentual de reajuste a ser aplicado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reajustePercent">Percentual (%)</Label>
              <Input
                id="reajustePercent"
                type="number"
                step="0.01"
                placeholder="Ex: 5.5"
                value={reajustePercent}
                onChange={(e) => setReajustePercent(e.target.value)}
              />
            </div>
            {reajustePercent && !isNaN(parseFloat(reajustePercent)) && parseFloat(reajustePercent) > 0 && (
              <p className="text-sm text-muted-foreground">
                Novo valor:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(
                    contract.rentalValue * (1 + parseFloat(reajustePercent) / 100)
                  )}
                </span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReajusteDialogOpen(false);
                setReajustePercent("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleApplyReajuste} disabled={reajusteLoading}>
              {reajusteLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renewal Dialog */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renovar Contrato</DialogTitle>
            <DialogDescription>
              O contrato atual ({contract.code}) sera encerrado e um novo contrato sera criado
              com inicio em {formatDate(new Date(new Date(contract.endDate).getTime() + 86400000).toISOString())}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="renewEndDate">Nova Data de Termino</Label>
              <Input
                id="renewEndDate"
                type="date"
                value={renewEndDate}
                onChange={(e) => setRenewEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se nao informado, sera calculado com base no periodo padrao de renovacao (12 meses).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="renewRentalValue">Novo Valor do Aluguel (opcional)</Label>
              <Input
                id="renewRentalValue"
                type="number"
                step="0.01"
                placeholder={`Atual: ${formatCurrency(contract.rentalValue)}`}
                value={renewRentalValue}
                onChange={(e) => setRenewRentalValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Deixe vazio para manter o valor atual.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenewDialogOpen(false);
                setRenewEndDate("");
                setRenewRentalValue("");
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleRenewContract} disabled={renewLoading}>
              {renewLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Renovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato{" "}
              <strong>{contract.code}</strong>? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
