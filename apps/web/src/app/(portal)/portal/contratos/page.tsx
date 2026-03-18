"use client";

import { useEffect, useState } from "react";
import { usePortal } from "@/components/portal/portal-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface Contract {
  id: string;
  code: string;
  status: string;
  startDate: string;
  endDate: string;
  rentalValue: number;
  adminFeePercent: number;
  paymentDay: number;
  property: {
    id: string;
    title: string;
    type: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    cpfCnpj: string;
  };
}

const statusConfig: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ATIVO: {
    label: "Ativo",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  ENCERRADO: {
    label: "Encerrado",
    className: "bg-gray-100 text-gray-500 border-gray-200",
    icon: XCircle,
  },
  PENDENTE: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: Clock,
  },
  RENOVACAO: {
    label: "Renovacao",
    className: "bg-blue-100 text-blue-700 border-blue-200",
    icon: AlertTriangle,
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-red-100 text-red-500 border-red-200",
    icon: XCircle,
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

export default function PortalContractsPage() {
  const { fetchPortal } = usePortal();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");

  useEffect(() => {
    async function loadContracts() {
      try {
        const response = await fetchPortal("/api/portal/contracts");
        if (response.ok) {
          const data = await response.json();
          setContracts(data);
        }
      } catch (error) {
        console.error("Erro ao carregar contratos:", error);
      } finally {
        setLoading(false);
      }
    }
    loadContracts();
  }, [fetchPortal]);

  // Client-side filtering
  const filteredContracts = contracts.filter((contract) => {
    if (activeTab === "todos") return true;
    if (activeTab === "ativos") return contract.status === "ATIVO";
    if (activeTab === "encerrados") return contract.status === "ENCERRADO";
    return true;
  });

  const activeCount = contracts.filter((c) => c.status === "ATIVO").length;
  const closedCount = contracts.filter((c) => c.status === "ENCERRADO").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus Contratos</h1>
        <p className="text-muted-foreground">
          {loading
            ? "Carregando..."
            : `${contracts.length} contrato(s) - ${activeCount} ativo(s), ${closedCount} encerrado(s)`}
        </p>
      </div>

      {/* Contracts Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-b gap-3">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-auto"
            >
              <TabsList className="h-8">
                <TabsTrigger value="todos" className="text-xs h-7 px-3">
                  Todos ({contracts.length})
                </TabsTrigger>
                <TabsTrigger value="ativos" className="text-xs h-7 px-3">
                  Ativos ({activeCount})
                </TabsTrigger>
                <TabsTrigger value="encerrados" className="text-xs h-7 px-3">
                  Encerrados ({closedCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Carregando...</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">
                Nenhum contrato encontrado
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
                    <TableHead className="text-xs text-right">
                      Aluguel
                    </TableHead>
                    <TableHead className="text-xs">Inicio</TableHead>
                    <TableHead className="text-xs">Fim</TableHead>
                    <TableHead className="text-xs">Dia Pgto.</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.map((contract) => {
                    const status = statusConfig[contract.status] || {
                      label: contract.status,
                      className: "bg-muted text-muted-foreground",
                      icon: Clock,
                    };
                    const StatusIcon = status.icon;

                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="font-mono text-xs">
                          {contract.code}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>
                            <p className="font-medium">
                              {contract.property?.title || "N/A"}
                            </p>
                            <p className="text-muted-foreground text-[11px]">
                              {contract.property?.street},{" "}
                              {contract.property?.number} -{" "}
                              {contract.property.neighborhood}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>
                            <p className="font-medium">
                              {contract.tenant?.name || "N/A"}
                            </p>
                            {contract.tenant?.phone && (
                              <p className="text-muted-foreground text-[11px]">
                                {contract.tenant?.phone}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-right">
                          {formatCurrency(contract.rentalValue)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(contract.startDate)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDate(contract.endDate)}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          Dia {contract.paymentDay}
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
