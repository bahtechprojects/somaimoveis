"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  History,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditUser {
  id: string;
  name: string;
  email: string;
}

interface AuditLog {
  id: string;
  userId: string | null;
  user: AuditUser | null;
  action: "CREATE" | "UPDATE" | "DELETE";
  entity: string;
  entityId: string;
  entityCode: string | null;
  entityName: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const entityLabels: Record<string, string> = {
  Contract: "Contrato",
  Owner: "Proprietário",
  Tenant: "Locatário",
  Property: "Imóvel",
  Payment: "Pagamento",
  OwnerEntry: "Lançamento (Proprietário)",
  TenantEntry: "Lançamento (Locatário)",
  User: "Usuário",
};

const actionLabels: Record<string, { label: string; className: string; Icon: typeof Plus }> = {
  CREATE: {
    label: "Criou",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Icon: Plus,
  },
  UPDATE: {
    label: "Editou",
    className: "bg-blue-100 text-blue-700 border-blue-200",
    Icon: Pencil,
  },
  DELETE: {
    label: "Excluiu",
    className: "bg-red-100 text-red-700 border-red-200",
    Icon: Trash2,
  },
};

function formatDateTime(s: string): string {
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  const [filters, setFilters] = useState({
    entity: "all",
    action: "all",
    userId: "all",
    search: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.entity !== "all") params.set("entity", filters.entity);
      if (filters.action !== "all") params.set("action", filters.action);
      if (filters.userId !== "all") params.set("userId", filters.userId);
      if (filters.search) params.set("search", filters.search);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("page", String(page));
      params.set("limit", "30");

      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data || []);
        setPagination(data.pagination || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Fetch users for filter
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.data || [];
        setUsers(list.map((u: any) => ({ id: u.id, name: u.name })));
      })
      .catch(() => setUsers([]));
  }, []);

  function handleFilterChange<K extends keyof typeof filters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Auditoria"
        subtitle="Histórico de criações, edições e exclusões no sistema"
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Filtros */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Buscar</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={filters.search}
                    onChange={(e) => handleFilterChange("search", e.target.value)}
                    placeholder="Código/nome..."
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select
                  value={filters.entity}
                  onValueChange={(v) => handleFilterChange("entity", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(entityLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ação</Label>
                <Select
                  value={filters.action}
                  onValueChange={(v) => handleFilterChange("action", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="CREATE">Criar</SelectItem>
                    <SelectItem value="UPDATE">Editar</SelectItem>
                    <SelectItem value="DELETE">Excluir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Usuário</Label>
                <Select
                  value={filters.userId}
                  onValueChange={(v) => handleFilterChange("userId", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">De</Label>
                <Input
                  type="date"
                  value={filters.from}
                  onChange={(e) => handleFilterChange("from", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até</Label>
                <Input
                  type="date"
                  value={filters.to}
                  onChange={(e) => handleFilterChange("to", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <History className="h-4 w-4 mr-2" />
                Nenhum registro de auditoria encontrado
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Data/Hora</TableHead>
                    <TableHead className="text-xs">Usuário</TableHead>
                    <TableHead className="text-xs">Ação</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Registro</TableHead>
                    <TableHead className="text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const action = actionLabels[log.action];
                    return (
                      <TableRow key={log.id} className="text-xs">
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          {log.user?.name ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", action?.className)}>
                            {action?.Icon && <action.Icon className="h-3 w-3 mr-1" />}
                            {action?.label || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entityLabels[log.entity] || log.entity}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{log.entityCode || log.entityId.slice(0, 8)}</div>
                          {log.entityName && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[300px]">
                              {log.entityName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            {/* Paginação */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t text-xs">
                <p className="text-muted-foreground">
                  {pagination.total} registro(s) — página {pagination.page} de {pagination.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={pagination.page === 1}
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Próximo
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de detalhe */}
      <Dialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhe da auditoria</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Data/Hora</p>
                  <p>{formatDateTime(selectedLog.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Usuário</p>
                  <p>{selectedLog.user?.name || "—"} {selectedLog.user?.email ? <span className="text-xs text-muted-foreground">({selectedLog.user.email})</span> : null}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ação</p>
                  <p>{actionLabels[selectedLog.action]?.label || selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p>{entityLabels[selectedLog.entity] || selectedLog.entity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Código</p>
                  <p>{selectedLog.entityCode || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p>{selectedLog.entityName || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">ID do registro</p>
                  <p className="font-mono text-xs">{selectedLog.entityId}</p>
                </div>
                {selectedLog.ipAddress && (
                  <div>
                    <p className="text-xs text-muted-foreground">IP</p>
                    <p className="font-mono text-xs">{selectedLog.ipAddress}</p>
                  </div>
                )}
              </div>

              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Alterações</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Campo</th>
                          <th className="text-left p-2">Antes</th>
                          <th className="text-left p-2">Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(selectedLog.changes).map(([field, change]) => (
                          <tr key={field} className="border-t">
                            <td className="p-2 font-medium">{field}</td>
                            <td className="p-2 text-red-600 line-through max-w-[200px] truncate">
                              {formatValue(change.old)}
                            </td>
                            <td className="p-2 text-emerald-700 max-w-[200px] truncate">
                              {formatValue(change.new)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
