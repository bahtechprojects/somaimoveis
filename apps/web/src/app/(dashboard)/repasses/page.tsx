"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  CheckCircle2,
  Clock,
  DollarSign,
  Users,
  Download,
  Send,
  ChevronDown,
  ChevronRight,
  Banknote,
  Copy,
  FileText,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OwnerData {
  id: string;
  name: string;
  cpfCnpj: string;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  bankPix: string | null;
  bankPixType: string | null;
  thirdPartyName: string | null;
  thirdPartyDocument: string | null;
  thirdPartyBank: string | null;
  thirdPartyAgency: string | null;
  thirdPartyAccount: string | null;
  thirdPartyPixKeyType: string | null;
  thirdPartyPix: string | null;
  paymentDay: number;
}

interface OwnerEntry {
  id: string;
  type: string;
  category: string;
  description: string;
  value: number;
  dueDate: string | null;
  paidAt: string | null;
  status: string;
  ownerId: string;
  contractId: string | null;
  propertyId: string | null;
  notes: string | null;
}

interface OwnerGroup {
  owner: OwnerData;
  entries: OwnerEntry[];
  debitEntries?: OwnerEntry[];
  totalPendente: number;
  totalPago: number;
  totalDebitos?: number;
  totalLiquido?: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function getPixDisplay(owner: OwnerData): string {
  const pix = owner.thirdPartyPix || owner.bankPix;
  const tipo = owner.thirdPartyPixKeyType || owner.bankPixType;
  if (!pix) return "Nao cadastrado";
  return tipo ? `${tipo}: ${pix}` : pix;
}

function getBankDisplay(owner: OwnerData): string {
  const name = owner.thirdPartyBank || owner.bankName;
  const ag = owner.thirdPartyAgency || owner.bankAgency;
  const cc = owner.thirdPartyAccount || owner.bankAccount;
  if (!name && !ag && !cc) return "";
  return [name, ag ? `Ag: ${ag}` : "", cc ? `CC: ${cc}` : ""]
    .filter(Boolean)
    .join(" | ");
}

function getRecipientName(owner: OwnerData): string {
  return owner.thirdPartyName || owner.name;
}

export default function RepassesPage() {
  const [groups, setGroups] = useState<OwnerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pendentes");
  const [month, setMonth] = useState(getCurrentMonth());
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"PAGO" | "PENDENTE">("PAGO");
  const [actionLoading, setActionLoading] = useState(false);
  const [cnabLoading, setCnabLoading] = useState(false);
  const [guaranteeLoading, setGuaranteeLoading] = useState<Record<string, boolean>>({});

  async function handleGuarantee(ownerId: string, ownerName: string) {
    if (!confirm(`Garantir aluguel atrasado de ${ownerName} para ${formatMonthLabel(month)}?\n\nIsso cria um crédito de garantia na conta do proprietário.`)) return;
    setGuaranteeLoading((prev) => ({ ...prev, [ownerId]: true }));
    try {
      const res = await fetch("/api/payments/guarantee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, month }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao garantir");
      toast.success(data.message);
      fetchRepasses();
    } catch (err: any) {
      toast.error(err.message || "Erro ao garantir aluguel");
    } finally {
      setGuaranteeLoading((prev) => ({ ...prev, [ownerId]: false }));
    }
  }

  async function fetchRepasses() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (activeTab !== "todos") {
        params.set("status", activeTab === "pendentes" ? "PENDENTE" : "PAGO");
      }
      const response = await fetch(`/api/repasses?${params}`);
      if (response.ok) {
        const data = await response.json();
        setGroups(data);
      }
    } catch (error) {
      console.error("Erro ao buscar repasses:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRepasses();
    setSelectedEntries(new Set());
    setExpandedOwners(new Set());
  }, [month, activeTab]);

  // Summary
  const totalPendente = groups.reduce((sum, g) => sum + g.totalPendente, 0);
  const totalPago = groups.reduce((sum, g) => sum + g.totalPago, 0);
  const totalDebitos = groups.reduce((sum, g) => sum + (g.totalDebitos || 0), 0);
  const totalLiquido = groups.reduce((sum, g) => sum + (g.totalLiquido ?? g.totalPendente), 0);
  const totalProprietarios = groups.length;
  const totalEntries = groups.reduce((sum, g) => sum + g.entries.length, 0);

  // Filter by search
  const filteredGroups = groups.filter((g) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      g.owner.name.toLowerCase().includes(term) ||
      g.owner.cpfCnpj.includes(term) ||
      (g.owner.thirdPartyName || "").toLowerCase().includes(term)
    );
  });

  function toggleOwner(ownerId: string) {
    setExpandedOwners((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  }

  function toggleSelectAll(ownerId: string, entries: OwnerEntry[]) {
    const pendingIds = entries
      .filter((e) => e.status === "PENDENTE")
      .map((e) => e.id);
    const allSelected = pendingIds.every((id) => selectedEntries.has(id));

    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pendingIds.forEach((id) => next.delete(id));
      } else {
        pendingIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleEntry(entryId: string) {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function selectAllPending() {
    const allPendingIds = groups.flatMap((g) =>
      g.entries.filter((e) => e.status === "PENDENTE").map((e) => e.id)
    );
    setSelectedEntries(new Set(allPendingIds));
  }

  function clearSelection() {
    setSelectedEntries(new Set());
  }

  function openConfirmDialog(action: "PAGO" | "PENDENTE") {
    setConfirmAction(action);
    setConfirmDialogOpen(true);
  }

  async function handleBatchUpdate() {
    setActionLoading(true);
    try {
      const response = await fetch("/api/repasses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryIds: Array.from(selectedEntries),
          status: confirmAction,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Erro ao atualizar repasses");
        return;
      }
      toast.success(data.message);
      setSelectedEntries(new Set());
      fetchRepasses();
    } catch (error) {
      toast.error("Erro ao atualizar repasses");
    } finally {
      setActionLoading(false);
      setConfirmDialogOpen(false);
    }
  }

  async function handleExportCSV() {
    try {
      const params = new URLSearchParams({ format: "csv" });
      if (month) params.set("month", month);
      if (selectedEntries.size > 0) {
        // Get unique owner IDs from selected entries
        const ownerIds = new Set<string>();
        groups.forEach((g) => {
          if (g.entries.some((e) => selectedEntries.has(e.id))) {
            ownerIds.add(g.owner.id);
          }
        });
        params.set("ownerIds", Array.from(ownerIds).join(","));
      }

      const response = await fetch(`/api/repasses/export?${params}`);
      if (!response.ok) throw new Error("Erro ao exportar");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `remessa-pix-${month || "todos"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Arquivo CSV exportado com sucesso!");
    } catch (error) {
      toast.error("Erro ao exportar remessa PIX");
    }
  }

  async function handleGenerateCnab() {
    setCnabLoading(true);
    try {
      // Get selected owner IDs if any entries are selected
      let ownerIds: string[] | undefined;
      if (selectedEntries.size > 0) {
        const ids = new Set<string>();
        groups.forEach((g) => {
          if (g.entries.some((e) => selectedEntries.has(e.id))) {
            ids.add(g.owner.id);
          }
        });
        ownerIds = Array.from(ids);
      }

      const response = await fetch("/api/repasses/cnab240", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          ownerIds,
          formaPagamento: "PIX",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.erros?.length > 0) {
          const errosList = data.erros
            .map((e: { proprietario: string; motivo: string }) => `${e.proprietario}: ${e.motivo}`)
            .join("\n");
          toast.error(`${data.error}\n${errosList}`);
        } else {
          toast.error(data.error || "Erro ao gerar remessa CNAB");
        }
        return;
      }

      const blob = await response.blob();
      const totalPgtos = response.headers.get("X-Total-Pagamentos") || "0";
      const valorTotal = response.headers.get("X-Valor-Total") || "0";
      const errosHeader = response.headers.get("X-Erros");
      const erros = errosHeader ? JSON.parse(errosHeader) : [];

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="(.+)"/);
      a.download = filenameMatch ? filenameMatch[1] : `remessa-${month}.rem`;
      a.click();
      URL.revokeObjectURL(url);

      let msg = `Remessa CNAB 240 gerada: ${totalPgtos} pagamento(s), R$ ${parseFloat(valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
      if (erros.length > 0) {
        msg += `. ${erros.length} proprietario(s) ignorado(s) por dados bancarios incompletos.`;
      }
      toast.success(msg);
    } catch (error) {
      toast.error("Erro ao gerar remessa CNAB 240");
    } finally {
      setCnabLoading(false);
    }
  }

  function copyPixKey(owner: OwnerData) {
    const pix = owner.thirdPartyPix || owner.bankPix;
    if (pix) {
      navigator.clipboard.writeText(pix);
      toast.success(`Chave PIX copiada: ${pix}`);
    }
  }

  const selectedTotal = groups.reduce((sum, g) => {
    return (
      sum +
      g.entries
        .filter((e) => selectedEntries.has(e.id))
        .reduce((s, e) => s + e.value, 0)
    );
  }, 0);

  return (
    <div className="flex flex-col">
      <Header title="Repasses" subtitle="Gerenciamento de repasses aos proprietarios" />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">A Repassar (Liquido)</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : formatCurrency(totalLiquido)}
                  </p>
                  {totalDebitos > 0 && (
                    <p className="text-xs text-red-500 mt-0.5">
                      Bruto: {formatCurrency(totalPendente)} | Debitos: -{formatCurrency(totalDebitos)}
                    </p>
                  )}
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
                  <p className="text-xs font-medium text-muted-foreground">Ja Repassado</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : formatCurrency(totalPago)}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Proprietarios</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : totalProprietarios}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Lancamentos</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : totalEntries}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                  <DollarSign className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Selection bar */}
        {selectedEntries.size > 0 && (
          <Card className="border-0 shadow-sm bg-primary/5">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {selectedEntries.size} selecionado(s)
                  </Badge>
                  <span className="text-sm font-semibold">
                    Total: {formatCurrency(selectedTotal)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={clearSelection}
                  >
                    Limpar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={handleExportCSV}
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={handleGenerateCnab}
                    disabled={cnabLoading}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {cnabLoading ? "Gerando..." : "CNAB 240"}
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => openConfirmDialog("PAGO")}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Confirmar Repasse
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 p-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                  <TabsList className="h-9 sm:h-8">
                    <TabsTrigger value="pendentes" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">
                      A Repassar
                    </TabsTrigger>
                    <TabsTrigger value="pagos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">
                      Repassados
                    </TabsTrigger>
                    <TabsTrigger value="todos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">
                      Todos
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-10 sm:h-8 w-auto text-sm sm:text-xs"
                />

                {activeTab === "pendentes" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-10 sm:h-8 text-xs"
                      onClick={selectAllPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Selecionar Todos</span>
                      <span className="sm:hidden">Todos</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-10 sm:h-8 text-xs"
                      onClick={handleExportCSV}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Exportar CSV</span>
                      <span className="sm:hidden">CSV</span>
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 h-10 sm:h-8 text-xs bg-blue-600 hover:bg-blue-700"
                      onClick={handleGenerateCnab}
                      disabled={cnabLoading}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {cnabLoading ? "Gerando..." : "Gerar Remessa CNAB"}
                      </span>
                      <span className="sm:hidden">
                        {cnabLoading ? "..." : "CNAB"}
                      </span>
                    </Button>
                  </>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar proprietario..."
                  className="pl-9 h-10 sm:h-8 w-full sm:w-[250px] text-sm sm:text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "Nenhum proprietario encontrado."
                    : `Nenhum repasse ${activeTab === "pendentes" ? "a repassar" : activeTab === "pagos" ? "repassado" : ""} para ${formatMonthLabel(month)}.`}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile view */}
                <div className="divide-y md:hidden">
                  {filteredGroups.map((group) => {
                    const isExpanded = expandedOwners.has(group.owner.id);
                    const pendingEntries = group.entries.filter(
                      (e) => e.status === "PENDENTE"
                    );
                    const allSelected =
                      pendingEntries.length > 0 &&
                      pendingEntries.every((e) => selectedEntries.has(e.id));

                    return (
                      <div key={group.owner.id}>
                        {/* Owner header */}
                        <div
                          className="p-4 cursor-pointer active:bg-muted/50"
                          onClick={() => toggleOwner(group.owner.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-3 min-w-0">
                              {activeTab === "pendentes" && pendingEntries.length > 0 && (
                                <Checkbox
                                  checked={allSelected}
                                  onCheckedChange={() =>
                                    toggleSelectAll(group.owner.id, group.entries)
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-0.5"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">
                                  {group.owner.name}
                                </p>
                                {group.owner.thirdPartyName && (
                                  <p className="text-[11px] text-muted-foreground">
                                    Recebedor: {group.owner.thirdPartyName}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {group.entries.length} lancamento(s) | Dia {group.owner.paymentDay}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                {group.totalPendente > 0 && (
                                  <p className="text-sm font-bold text-yellow-600">
                                    {formatCurrency(group.totalLiquido ?? group.totalPendente)}
                                  </p>
                                )}
                                {(group.totalDebitos ?? 0) > 0 && (
                                  <p className="text-[11px] text-red-500">
                                    Debitos: -{formatCurrency(group.totalDebitos!)}
                                  </p>
                                )}
                                {group.totalPago > 0 && (
                                  <p className="text-xs text-emerald-600">
                                    Pago: {formatCurrency(group.totalPago)}
                                  </p>
                                )}
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded entries */}
                        {isExpanded && (
                          <div className="bg-muted/30 border-t">
                            {/* Bank info */}
                            <div className="px-4 py-2 border-b bg-muted/50">
                              <div className="flex items-center justify-between">
                                <div className="text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1.5">
                                    <Banknote className="h-3.5 w-3.5" />
                                    <span className="font-medium">
                                      {getRecipientName(group.owner)}
                                    </span>
                                  </div>
                                  {getBankDisplay(group.owner) && (
                                    <p className="mt-0.5 ml-5">
                                      {getBankDisplay(group.owner)}
                                    </p>
                                  )}
                                  <p className="mt-0.5 ml-5">
                                    PIX: {getPixDisplay(group.owner)}
                                  </p>
                                </div>
                                {(group.owner.bankPix || group.owner.thirdPartyPix) && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => copyPixKey(group.owner)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Entry list */}
                            {group.entries.map((entry) => (
                              <div
                                key={entry.id}
                                className="px-4 py-2.5 border-b last:border-0 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {entry.status === "PENDENTE" && (
                                    <Checkbox
                                      checked={selectedEntries.has(entry.id)}
                                      onCheckedChange={() => toggleEntry(entry.id)}
                                    />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-xs truncate">{entry.description}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      Venc: {formatDate(entry.dueDate)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] h-5 border",
                                      entry.status === "PAGO"
                                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                        : "bg-yellow-100 text-yellow-700 border-yellow-200"
                                    )}
                                  >
                                    {entry.status === "PAGO" ? "Pago" : "Pendente"}
                                  </Badge>
                                  <span className="text-sm font-semibold">
                                    {formatCurrency(entry.value)}
                                  </span>
                                </div>
                              </div>
                            ))}

                            {/* Debitos pendentes */}
                            {(group.debitEntries?.length ?? 0) > 0 && (
                              <div className="border-t bg-red-50/50">
                                <div className="px-4 py-1.5 text-[11px] font-semibold text-red-600 uppercase">
                                  Debitos a descontar
                                </div>
                                {group.debitEntries!.map((debit) => (
                                  <div
                                    key={debit.id}
                                    className="px-4 py-2 border-t border-red-100 flex items-center justify-between"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs truncate text-red-700">{debit.description}</p>
                                      <p className="text-[11px] text-red-400">
                                        {debit.category} | {formatDate(debit.dueDate)}
                                      </p>
                                    </div>
                                    <span className="text-sm font-semibold text-red-600">
                                      -{formatCurrency(debit.value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Valor liquido */}
                            {(group.totalDebitos ?? 0) > 0 && (
                              <div className="px-4 py-2 border-t bg-muted/50 flex items-center justify-between">
                                <span className="text-xs font-semibold">Valor Liquido</span>
                                <span className="text-sm font-bold">
                                  {formatCurrency(group.totalLiquido ?? group.totalPendente)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop view */}
                <div className="hidden md:block">
                  {filteredGroups.map((group) => {
                    const isExpanded = expandedOwners.has(group.owner.id);
                    const pendingEntries = group.entries.filter(
                      (e) => e.status === "PENDENTE"
                    );
                    const allSelected =
                      pendingEntries.length > 0 &&
                      pendingEntries.every((e) => selectedEntries.has(e.id));

                    return (
                      <div key={group.owner.id} className="border-b last:border-0">
                        {/* Owner row */}
                        <div
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
                            isExpanded && "bg-muted/30"
                          )}
                          onClick={() => toggleOwner(group.owner.id)}
                        >
                          {activeTab === "pendentes" && pendingEntries.length > 0 && (
                            <Checkbox
                              checked={allSelected}
                              onCheckedChange={() =>
                                toggleSelectAll(group.owner.id, group.entries)
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}

                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{group.owner.name}</p>
                              <span className="text-xs text-muted-foreground">
                                ({group.owner.cpfCnpj})
                              </span>
                            </div>
                            {group.owner.thirdPartyName && (
                              <p className="text-xs text-muted-foreground">
                                Recebedor: {group.owner.thirdPartyName}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {group.entries.length} lancamento(s) | Dia{" "}
                                {group.owner.paymentDay}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {(group.owner.bankPix || group.owner.thirdPartyPix) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyPixKey(group.owner);
                                  }}
                                  title="Copiar chave PIX"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>

                            {group.totalPendente > 0 && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                                Créditos: {formatCurrency(group.totalPendente)}
                              </Badge>
                            )}
                            {(group.totalDebitos ?? 0) > 0 && (
                              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                                Débitos: -{formatCurrency(group.totalDebitos!)}
                              </Badge>
                            )}
                            {group.totalPendente > 0 && (
                              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs font-bold">
                                Líq: {formatCurrency(group.totalLiquido ?? group.totalPendente)}
                              </Badge>
                            )}
                            {group.totalPago > 0 && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                                {formatCurrency(group.totalPago)}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Expanded section */}
                        {isExpanded && (
                          <div className="bg-muted/20">
                            {/* Bank info bar */}
                            <div className="px-6 py-2 bg-muted/40 border-y flex items-center gap-6 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Banknote className="h-3.5 w-3.5" />
                                <span className="font-medium">
                                  {getRecipientName(group.owner)}
                                </span>
                              </div>
                              {getBankDisplay(group.owner) && (
                                <span>{getBankDisplay(group.owner)}</span>
                              )}
                              <span>PIX: {getPixDisplay(group.owner)}</span>
                              {activeTab === "pendentes" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] gap-1 text-amber-700 border-amber-300 hover:bg-amber-50 ml-auto"
                                  disabled={guaranteeLoading[group.owner.id]}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGuarantee(group.owner.id, group.owner.name);
                                  }}
                                >
                                  <Shield className="h-3 w-3" />
                                  {guaranteeLoading[group.owner.id] ? "..." : "Garantir Aluguel"}
                                </Button>
                              )}
                            </div>

                            {/* Composição resumida */}
                            {(() => {
                              const creditsByCategory: Record<string, number> = {};
                              for (const e of group.entries) {
                                if (e.status === "CANCELADO") continue;
                                creditsByCategory[e.category] = (creditsByCategory[e.category] || 0) + e.value;
                              }
                              const debitsByCategory: Record<string, number> = {};
                              for (const d of (group.debitEntries || [])) {
                                debitsByCategory[d.category] = (debitsByCategory[d.category] || 0) + d.value;
                              }
                              const totalCreditos = Object.values(creditsByCategory).reduce((s, v) => s + v, 0);
                              const totalDebitos = Object.values(debitsByCategory).reduce((s, v) => s + v, 0);
                              const categoryLabels: Record<string, string> = {
                                REPASSE: "Repasse Aluguel",
                                GARANTIA: "Garantia Aluguel",
                                IPTU: "Crédito IPTU",
                                CONDOMINIO: "Crédito Condomínio",
                                INTERMEDIACAO: "Intermediação",
                                REPARO: "Reparo",
                                TAXA_BANCARIA: "Taxa Bancária",
                                DESCONTO: "Desconto",
                                ACORDO: "Acordo",
                                OUTROS: "Outros",
                              };
                              return (
                                <div className="px-6 py-2 border-b bg-slate-50/50 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
                                  {Object.entries(creditsByCategory).map(([cat, val]) => (
                                    <span key={cat} className="text-emerald-700 font-medium">
                                      + {categoryLabels[cat] || cat}: {formatCurrency(Math.round(val * 100) / 100)}
                                    </span>
                                  ))}
                                  {Object.entries(debitsByCategory).map(([cat, val]) => (
                                    <span key={cat} className="text-red-600 font-medium">
                                      - {categoryLabels[cat] || cat}: {formatCurrency(Math.round(val * 100) / 100)}
                                    </span>
                                  ))}
                                  <span className="font-bold text-xs ml-auto">
                                    = {formatCurrency(Math.round((totalCreditos - totalDebitos) * 100) / 100)}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Entries table */}
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                  {activeTab === "pendentes" && (
                                    <TableHead className="w-10"></TableHead>
                                  )}
                                  <TableHead className="text-xs">Descricao</TableHead>
                                  <TableHead className="text-xs">Vencimento</TableHead>
                                  <TableHead className="text-xs">Status</TableHead>
                                  <TableHead className="text-xs text-right">Valor</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.entries.map((entry) => (
                                  <TableRow key={entry.id} className="hover:bg-muted/30">
                                    {activeTab === "pendentes" && (
                                      <TableCell>
                                        {entry.status === "PENDENTE" && (
                                          <Checkbox
                                            checked={selectedEntries.has(entry.id)}
                                            onCheckedChange={() => toggleEntry(entry.id)}
                                          />
                                        )}
                                      </TableCell>
                                    )}
                                    <TableCell className="text-xs">
                                      <div className="flex items-center gap-1.5">
                                        {entry.category !== "REPASSE" && (
                                          <Badge variant="outline" className={cn(
                                            "text-[9px] h-4 px-1 border shrink-0",
                                            entry.category === "IPTU" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                            entry.category === "CONDOMINIO" ? "bg-orange-50 text-orange-700 border-orange-200" :
                                            entry.category === "GARANTIA" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                            "bg-slate-50 text-slate-600 border-slate-200"
                                          )}>
                                            {entry.category === "GARANTIA" ? (
                                              <span className="flex items-center gap-0.5"><Shield className="h-2.5 w-2.5" /> GARANTIA</span>
                                            ) : entry.category}
                                          </Badge>
                                        )}
                                        {entry.notes && entry.category === "REPASSE" ? (() => {
                                          try {
                                            const n = JSON.parse(entry.notes!);
                                            if (!n.adminFeePercent) return <span>{entry.description}</span>;
                                            return (
                                              <TooltipProvider delayDuration={200}>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="cursor-help underline decoration-dotted">{entry.description}</span>
                                                  </TooltipTrigger>
                                                  <TooltipContent side="bottom" className="max-w-xs p-3 space-y-1">
                                                    <p className="font-medium border-b pb-1 mb-1 text-xs">Composição do Repasse</p>
                                                    <p className="text-xs">Aluguel bruto: {formatCurrency(n.aluguelBruto)}</p>
                                                    <p className="text-xs text-red-600">- Taxa adm ({n.adminFeePercent}%): {formatCurrency(n.adminFeeValue)}</p>
                                                    {n.intermediacao > 0 && (
                                                      <p className="text-xs text-red-600">- Intermediação: {formatCurrency(n.intermediacao)}</p>
                                                    )}
                                                    {n.irrfValue > 0 && (
                                                      <p className="text-xs text-red-600">- IRRF ({(n.irrfRate * 100).toFixed(1)}%): {formatCurrency(n.irrfValue)}</p>
                                                    )}
                                                    <p className="text-xs font-semibold border-t pt-1 mt-1">= Líquido: {formatCurrency(n.netToOwner)}</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            );
                                          } catch { return <span>{entry.description}</span>; }
                                        })() : <span>{entry.description}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      {formatDate(entry.dueDate)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "text-[10px] h-5 border",
                                          entry.status === "PAGO"
                                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                            : "bg-yellow-100 text-yellow-700 border-yellow-200"
                                        )}
                                      >
                                        {entry.status === "PAGO" ? "Pago" : "Pendente"}
                                      </Badge>
                                      {entry.paidAt && (
                                        <span className="ml-2 text-[11px] text-muted-foreground">
                                          {formatDate(entry.paidAt)}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-semibold">
                                      {formatCurrency(entry.value)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>

                            {/* Debitos a descontar */}
                            {(group.debitEntries?.length ?? 0) > 0 && (
                              <div className="border-t bg-red-50/50">
                                <div className="px-6 py-1.5 text-[11px] font-semibold text-red-600 uppercase border-b border-red-100">
                                  Debitos a descontar do repasse
                                </div>
                                <Table>
                                  <TableBody>
                                    {group.debitEntries!.map((debit) => {
                                      const isCarryover = debit.dueDate && month
                                        ? new Date(debit.dueDate) < new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]) - 1, 1)
                                        : false;
                                      return (
                                        <TableRow key={debit.id} className="hover:bg-red-50">
                                          {activeTab === "pendentes" && <TableCell className="w-10" />}
                                          <TableCell className="text-xs text-red-700">
                                            <div className="flex items-center gap-1.5">
                                              {isCarryover && (
                                                <Badge variant="outline" className="text-[9px] h-4 px-1 border bg-orange-50 text-orange-600 border-orange-200 shrink-0">
                                                  Mês anterior
                                                </Badge>
                                              )}
                                              <span>{debit.description}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-xs text-red-500">
                                            {formatDate(debit.dueDate)}
                                          </TableCell>
                                          <TableCell>
                                            <Badge variant="outline" className="text-[10px] h-5 border bg-red-100 text-red-700 border-red-200">
                                              {debit.category}
                                            </Badge>
                                          </TableCell>
                                          <TableCell className="text-right text-xs font-semibold text-red-600">
                                            -{formatCurrency(debit.value)}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            {/* Valor liquido */}
                            {(group.totalDebitos ?? 0) > 0 && (
                              <div className="px-6 py-2 border-t bg-muted/40 flex items-center justify-between">
                                <span className="text-xs font-semibold">Valor Liquido do Repasse</span>
                                <span className="text-sm font-bold">
                                  {formatCurrency(group.totalLiquido ?? group.totalPendente)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "PAGO"
                ? "Confirmar Repasse"
                : "Reverter para Pendente"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "PAGO"
                ? `Deseja marcar ${selectedEntries.size} repasse(s) como PAGO no valor total de ${formatCurrency(selectedTotal)}? Esta acao confirma que o repasse foi realizado.`
                : `Deseja reverter ${selectedEntries.size} repasse(s) para PENDENTE?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchUpdate}
              disabled={actionLoading}
              className={
                confirmAction === "PAGO"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : ""
              }
            >
              {actionLoading
                ? "Processando..."
                : confirmAction === "PAGO"
                  ? "Confirmar Repasse"
                  : "Reverter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
