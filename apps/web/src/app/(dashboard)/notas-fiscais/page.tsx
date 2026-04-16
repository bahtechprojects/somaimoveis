"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NotaFiscal {
  entryId: string;
  owner: { id: string; name: string; cpfCnpj: string };
  contract: { id: string; code: string; rentalValue: number; adminFeePercent: number } | null;
  aluguelBruto: number;
  adminFeePercent: number;
  adminFeeValue: number;
  repasseValue: number;
  nfEmitida: boolean;
  nfNumero: string;
  nfData: string;
}

interface NotasResponse {
  month: string;
  total: number;
  emitidas: number;
  pendentes: number;
  totalAdminFee: number;
  notas: NotaFiscal[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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

export default function NotasFiscaisPage() {
  const [data, setData] = useState<NotasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(getCurrentMonth());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  async function fetchNotas() {
    setLoading(true);
    try {
      const res = await fetch(`/api/notas-fiscais?month=${month}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        toast.error("Erro ao carregar notas fiscais");
      }
    } catch {
      toast.error("Erro de conexao");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotas();
    setSelected(new Set());
  }, [month]);

  const filteredNotas = (data?.notas || []).filter((n) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      n.owner.name.toLowerCase().includes(term) ||
      n.owner.cpfCnpj.includes(term) ||
      (n.contract?.code || "").toLowerCase().includes(term)
    );
  });

  const pendentes = filteredNotas.filter((n) => !n.nfEmitida);
  const emitidas = filteredNotas.filter((n) => n.nfEmitida);

  function toggleSelect(entryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function selectAllPendentes() {
    setSelected(new Set(pendentes.map((n) => n.entryId)));
  }

  async function marcarEmitidas() {
    if (selected.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/notas-fiscais", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          entryIds: Array.from(selected),
          emitida: true,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(d.message);
        setSelected(new Set());
        fetchNotas();
      } else {
        toast.error(d.error || "Erro");
      }
    } catch {
      toast.error("Erro ao marcar NFs");
    } finally {
      setActionLoading(false);
    }
  }

  async function reverterEmitida(entryId: string) {
    try {
      const res = await fetch("/api/notas-fiscais", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, entryIds: [entryId], emitida: false }),
      });
      if (res.ok) {
        toast.success("NF revertida para pendente");
        fetchNotas();
      }
    } catch {
      toast.error("Erro");
    }
  }

  function exportCSV() {
    if (!data) return;
    const rows = data.notas.map((n) => [
      n.owner.name,
      n.owner.cpfCnpj,
      n.contract?.code || "",
      n.aluguelBruto.toFixed(2),
      `${n.adminFeePercent}%`,
      n.adminFeeValue.toFixed(2),
      n.nfEmitida ? "EMITIDA" : "PENDENTE",
      n.nfNumero,
    ]);
    const header = "Proprietario;CPF/CNPJ;Contrato;Aluguel Bruto;Taxa %;Valor NF;Status;Numero NF";
    const csv = [header, ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notas-fiscais-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  return (
    <div className="flex flex-col">
      <Header title="Notas Fiscais" subtitle="Controle de emissao de notas fiscais de taxa de administracao" />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total NFs</p>
                  <p className="text-2xl font-bold mt-1">{loading ? "..." : data?.total || 0}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold mt-1">{loading ? "..." : data?.pendentes || 0}</p>
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
                  <p className="text-xs font-medium text-muted-foreground">Emitidas</p>
                  <p className="text-2xl font-bold mt-1">{loading ? "..." : data?.emitidas || 0}</p>
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
                  <p className="text-xs font-medium text-muted-foreground">Total Taxa Adm</p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : formatCurrency(data?.totalAdminFee || 0)}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                  <DollarSign className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters + Actions */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 p-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 w-auto text-sm"
                />
                <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs" onClick={selectAllPendentes}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Selecionar Pendentes
                </Button>
                {selected.size > 0 && (
                  <Button
                    size="sm"
                    className="gap-1.5 h-9 text-xs bg-emerald-600 hover:bg-emerald-700"
                    onClick={marcarEmitidas}
                    disabled={actionLoading}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {actionLoading ? "..." : `Marcar ${selected.size} como Emitida(s)`}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs" onClick={exportCSV}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar proprietario ou contrato..."
                  className="pl-9 h-9 w-full sm:w-[280px] text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredNotas.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  Nenhuma nota fiscal para {formatMonthLabel(month)}.
                </p>
              </div>
            ) : (
              <>
                {/* Pendentes */}
                {pendentes.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-yellow-50 border-b">
                      <span className="text-xs font-semibold text-yellow-700">
                        PENDENTES ({pendentes.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-xs">Proprietario</TableHead>
                          <TableHead className="text-xs">Contrato</TableHead>
                          <TableHead className="text-xs text-right">Aluguel Bruto</TableHead>
                          <TableHead className="text-xs text-right">Taxa Adm</TableHead>
                          <TableHead className="text-xs text-right">Valor NF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendentes.map((n) => (
                          <TableRow key={n.entryId}>
                            <TableCell>
                              <Checkbox
                                checked={selected.has(n.entryId)}
                                onCheckedChange={() => toggleSelect(n.entryId)}
                              />
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium">{n.owner.name}</div>
                              <div className="text-muted-foreground text-[11px]">{n.owner.cpfCnpj}</div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {n.contract?.code || "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {formatCurrency(n.aluguelBruto)}
                            </TableCell>
                            <TableCell className="text-xs text-right text-muted-foreground">
                              {n.adminFeePercent}%
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold">
                              {formatCurrency(n.adminFeeValue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Emitidas */}
                {emitidas.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-emerald-50 border-b border-t">
                      <span className="text-xs font-semibold text-emerald-700">
                        EMITIDAS ({emitidas.length})
                      </span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Proprietario</TableHead>
                          <TableHead className="text-xs">Contrato</TableHead>
                          <TableHead className="text-xs text-right">Valor NF</TableHead>
                          <TableHead className="text-xs">Data Emissao</TableHead>
                          <TableHead className="text-xs w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emitidas.map((n) => (
                          <TableRow key={n.entryId}>
                            <TableCell className="text-xs">
                              <div className="font-medium">{n.owner.name}</div>
                              <div className="text-muted-foreground text-[11px]">{n.owner.cpfCnpj}</div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {n.contract?.code || "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold">
                              {formatCurrency(n.adminFeeValue)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {n.nfData || "-"}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[11px] text-muted-foreground hover:text-amber-700"
                                onClick={() => reverterEmitida(n.entryId)}
                              >
                                Reverter
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
