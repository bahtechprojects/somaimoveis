"use client";

import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TenantEntry {
  id: string;
  tenantId: string;
  type: "DEBITO" | "CREDITO";
  category: string;
  description: string | null;
  value: number;
  dueDate: string;
  status: "PENDENTE" | "PAGO" | "CANCELADO";
  notes: string | null;
  createdAt: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  parentEntryId: string | null;
  isRecurring: boolean;
  recurringDay: number | null;
  tenant: {
    id: string;
    name: string;
  };
}

interface Tenant {
  id: string;
  name: string;
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  PENDENTE: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock },
  PAGO: { label: "Pago", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  CANCELADO: { label: "Cancelado", className: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
};

const categoryLabels: Record<string, string> = {
  ALUGUEL: "Aluguel",
  CONDOMINIO: "Condominio",
  IPTU: "IPTU",
  AGUA: "Agua",
  LUZ: "Luz",
  GAS: "Gas",
  MULTA: "Multa",
  REPARO: "Reparo",
  DESCONTO: "Desconto",
  ACORDO: "Acordo",
  OUTROS: "Outros",
};

const categories = [
  "ALUGUEL",
  "CONDOMINIO",
  "IPTU",
  "AGUA",
  "LUZ",
  "GAS",
  "MULTA",
  "REPARO",
  "DESCONTO",
  "ACORDO",
  "OUTROS",
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function LancamentosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><p className="text-sm text-muted-foreground">Carregando...</p></div>}>
      <LancamentosContent />
    </Suspense>
  );
}

function LancamentosContent() {
  const [entries, setEntries] = useState<TenantEntry[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<TenantEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formTenantId, setFormTenantId] = useState("");
  const [formType, setFormType] = useState<"DEBITO" | "CREDITO">("DEBITO");
  const [formCategory, setFormCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formInstallments, setFormInstallments] = useState("1");
  const [formIsRecurring, setFormIsRecurring] = useState(false);

  async function fetchEntries() {
    setLoading(true);
    try {
      const response = await fetch("/api/tenant-entries");
      if (response.ok) {
        const data = await response.json();
        setEntries(data);
      }
    } catch (error) {
      console.error("Erro ao buscar lancamentos:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTenants() {
    try {
      const response = await fetch("/api/tenants");
      if (response.ok) {
        const data = await response.json();
        setTenants(data);
      }
    } catch (error) {
      console.error("Erro ao buscar locatarios:", error);
    }
  }

  useEffect(() => {
    fetchEntries();
    fetchTenants();
  }, []);

  // Filter by type tab
  const filteredByType = entries.filter((entry) => {
    if (activeTab === "todos") return true;
    if (activeTab === "debitos") return entry.type === "DEBITO";
    if (activeTab === "creditos") return entry.type === "CREDITO";
    return true;
  });

  // Filter by status
  const filteredByStatus = filteredByType.filter((entry) => {
    if (statusFilter === "todos") return true;
    return entry.status === statusFilter;
  });

  // Search filter
  const filteredEntries = filteredByStatus.filter((entry) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      (entry.tenant?.name || "").toLowerCase().includes(term) ||
      (entry.description || "").toLowerCase().includes(term)
    );
  });

  // Summary
  const totalDebitos = entries
    .filter((e) => e.type === "DEBITO" && e.status !== "CANCELADO")
    .reduce((sum, e) => sum + e.value, 0);
  const totalCreditos = entries
    .filter((e) => e.type === "CREDITO" && e.status !== "CANCELADO")
    .reduce((sum, e) => sum + e.value, 0);

  function resetForm() {
    setFormTenantId("");
    setFormType("DEBITO");
    setFormCategory("");
    setFormDescription("");
    setFormValue("");
    setFormDueDate("");
    setFormNotes("");
    setFormInstallments("1");
    setFormIsRecurring(false);
  }

  function handleNewEntry() {
    resetForm();
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTenantId || !formCategory || !formValue || !formDueDate) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/tenant-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: formTenantId,
          type: formType,
          category: formCategory,
          description: formDescription || null,
          value: parseFloat(formValue),
          dueDate: formDueDate,
          notes: formNotes || null,
          installments: parseInt(formInstallments) || 1,
          isRecurring: formIsRecurring,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao criar lancamento");
        return;
      }
      setFormOpen(false);
      resetForm();
      fetchEntries();
    } catch (error) {
      toast.error("Erro ao criar lancamento");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleteClick(entry: TenantEntry) {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!entryToDelete) return;
    try {
      const response = await fetch(`/api/tenant-entries/${entryToDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao excluir lancamento");
        return;
      }
      fetchEntries();
    } catch (error) {
      toast.error("Erro ao excluir lancamento");
    } finally {
      setDeleteDialogOpen(false);
      setEntryToDelete(null);
    }
  }

  return (
    <div className="flex flex-col">
      <Header title="Lançamentos" subtitle="Débitos e créditos dos locatários" />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Lançamentos</p>
                  <p className="text-2xl font-bold mt-1">{loading ? "..." : entries.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Debitos</p>
                  <p className="text-2xl font-bold mt-1 text-red-600">
                    {loading ? "..." : formatCurrency(totalDebitos)}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                  <ArrowDownRight className="h-5 w-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Creditos</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-600">
                    {loading ? "..." : formatCurrency(totalCreditos)}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Entries Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 p-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                  <TabsList className="h-9 sm:h-8">
                    <TabsTrigger value="todos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Todos</TabsTrigger>
                    <TabsTrigger value="debitos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Debitos</TabsTrigger>
                    <TabsTrigger value="creditos" className="text-xs h-8 sm:h-7 px-2.5 sm:px-3">Creditos</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-10 sm:h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="gap-1.5 h-10 sm:h-8 text-xs ml-auto" onClick={handleNewEntry}>
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Novo Lancamento</span>
                  <span className="sm:hidden">Novo</span>
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por locatario ou descricao..."
                  className="pl-9 h-10 sm:h-8 w-full sm:w-[280px] text-sm sm:text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "Nenhum lancamento encontrado para a busca."
                    : "Nenhum lancamento cadastrado."}
                </p>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="divide-y md:hidden">
                  {filteredEntries.map((entry) => {
                    const status = statusConfig[entry.status] || statusConfig.PENDENTE;
                    const StatusIcon = status.icon;
                    const isDebito = entry.type === "DEBITO";
                    return (
                      <div key={entry.id} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold">{entry.tenant?.name || "N/A"}</p>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] h-5 border",
                                  isDebito
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                )}
                              >
                                {isDebito ? "Debito" : "Credito"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {categoryLabels[entry.category] || entry.category}
                              {entry.description ? ` - ${entry.description}` : ""}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem variant="destructive" onClick={() => handleDeleteClick(entry)}>
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
                            <span className="text-xs text-muted-foreground">Venc: {formatDate(entry.dueDate)}</span>
                            {entry.installmentTotal && entry.installmentTotal > 1 && (
                              <Badge variant="outline" className="text-[10px] h-5 border bg-blue-50 text-blue-700 border-blue-200">
                                {entry.installmentNumber}/{entry.installmentTotal}
                              </Badge>
                            )}
                            {entry.isRecurring && (
                              <span title="Recorrente"><Repeat className="h-3.5 w-3.5 text-purple-500" /></span>
                            )}
                          </div>
                          <span className={cn("font-semibold text-sm", isDebito ? "text-red-600" : "text-emerald-600")}>
                            {isDebito ? "- " : "+ "}{formatCurrency(entry.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table view */}
                <div className="overflow-x-auto hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs">Locatário</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Categoria</TableHead>
                        <TableHead className="text-xs">Descricao</TableHead>
                        <TableHead className="text-xs">Parcela</TableHead>
                        <TableHead className="text-xs text-right">Valor (R$)</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry) => {
                        const status = statusConfig[entry.status] || statusConfig.PENDENTE;
                        const StatusIcon = status.icon;
                        const isDebito = entry.type === "DEBITO";
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs">
                              {formatDate(entry.dueDate)}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              {entry.tenant?.name || "N/A"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs border",
                                  isDebito
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                )}
                              >
                                {isDebito ? "Debito" : "Credito"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {categoryLabels[entry.category] || entry.category}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {entry.description || "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1.5">
                                {entry.installmentTotal && entry.installmentTotal > 1 ? (
                                  <Badge variant="outline" className="text-xs border bg-blue-50 text-blue-700 border-blue-200">
                                    {entry.installmentNumber}/{entry.installmentTotal}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                                {entry.isRecurring && (
                                  <span title="Recorrente"><Repeat className="h-3.5 w-3.5 text-purple-500" /></span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className={cn("text-xs font-semibold text-right", isDebito ? "text-red-600" : "text-emerald-600")}>
                              {isDebito ? "- " : "+ "}{formatCurrency(entry.value)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-xs border gap-1", status.className)}>
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => handleDeleteClick(entry)}
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

      {/* New Entry Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Novo Lancamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenantId">Locatário</Label>
              <Select value={formTenantId} onValueChange={setFormTenantId}>
                <SelectTrigger id="tenantId">
                  <SelectValue placeholder="Selecione o locatario" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as "DEBITO" | "CREDITO")}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBITO">Debito</SelectItem>
                    <SelectItem value="CREDITO">Credito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {categoryLabels[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descricao</Label>
              <Input
                id="description"
                placeholder="Descricao do lancamento"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="value">Valor (R$)</Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Data de Vencimento</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="installments">Número de Parcelas</Label>
                <Input
                  id="installments"
                  type="number"
                  min="1"
                  max="60"
                  value={formInstallments}
                  onChange={(e) => setFormInstallments(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="isRecurring">Recorrente</Label>
                <div className="flex items-center h-10">
                  <Switch
                    id="isRecurring"
                    checked={formIsRecurring}
                    onCheckedChange={setFormIsRecurring}
                  />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {formIsRecurring ? "Sim" : "Nao"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input
                id="notes"
                placeholder="Observações adicionais (opcional)"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !formTenantId || !formCategory || !formValue || !formDueDate}>
                {submitting ? "Salvando..." : "Criar Lancamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lancamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lancamento de{" "}
              <strong>{entryToDelete?.tenant?.name}</strong>? Esta acao nao pode ser desfeita.
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
