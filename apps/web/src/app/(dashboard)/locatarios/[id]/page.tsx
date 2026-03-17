"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { TenantForm } from "@/components/forms/tenant-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  DollarSign,
  AlertTriangle,
  CircleCheckBig,
  User,
  Briefcase,
  MapPin,
} from "lucide-react";

// --------------------------------------------------
// Types
// --------------------------------------------------

interface Contract {
  id: string;
  code: string;
  status: string;
  rentalValue: number;
  startDate: string;
  endDate: string;
}

interface Payment {
  id: string;
  code: string;
  contractId: string;
  contract?: { code: string };
  value: number;
  paidValue: number | null;
  dueDate: string;
  paidAt: string | null;
  status: string;
}

interface Tenant {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfCnpj: string;
  personType: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  rgNumber: string | null;
  occupation: string | null;
  monthlyIncome: number | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  contracts: Contract[];
  payments: Payment[];
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

const paymentStatusConfig: Record<
  string,
  { label: string; className: string }
> = {
  PAGO: {
    label: "Pago",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  PENDENTE: {
    label: "Pendente",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  ATRASADO: {
    label: "Atrasado",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
  PARCIAL: {
    label: "Parcial",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
};

const contractStatusConfig: Record<
  string,
  { label: string; className: string }
> = {
  ATIVO: {
    label: "Ativo",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  ENCERRADO: {
    label: "Encerrado",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
  PENDENTE_RENOVACAO: {
    label: "Pendente Renovacao",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

// --------------------------------------------------
// Info field component
// --------------------------------------------------

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5">{value || "-"}</p>
    </div>
  );
}

// --------------------------------------------------
// Page
// --------------------------------------------------

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function fetchTenant() {
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error("Erro ao buscar locatario");
      const data = await response.json();
      setTenant(data);
    } catch (error) {
      console.error("Erro ao buscar locatario:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDeleteConfirm() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/tenants/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Erro ao excluir locatario");
        return;
      }
      router.push("/locatarios");
    } catch (error) {
      alert("Erro ao excluir locatario");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  function handleFormSuccess() {
    fetchTenant();
  }

  // Compute summary stats
  const totalContracts = tenant?.contracts?.length ?? 0;
  const totalPayments = tenant?.payments?.length ?? 0;
  const overduePayments =
    tenant?.payments?.filter((p) => p.status === "ATRASADO").length ?? 0;
  const totalPaid =
    tenant?.payments
      ?.filter((p) => p.status === "PAGO")
      .reduce((sum, p) => sum + (p.paidValue ?? p.value), 0) ?? 0;

  // Build a map of contractId -> contract code for payment table
  const contractCodeMap: Record<string, string> = {};
  tenant?.contracts?.forEach((c) => {
    contractCodeMap[c.id] = c.code;
  });

  // Build full address
  function buildAddress(): string | null {
    if (!tenant) return null;
    const parts: string[] = [];
    if (tenant.street) {
      let line = tenant.street;
      if (tenant.number) line += `, ${tenant.number}`;
      if (tenant.complement) line += ` - ${tenant.complement}`;
      parts.push(line);
    }
    if (tenant.neighborhood) parts.push(tenant.neighborhood);
    const cityState = [tenant.city, tenant.state].filter(Boolean).join(" - ");
    if (cityState) parts.push(cityState);
    if (tenant.zipCode) parts.push(`CEP: ${tenant.zipCode}`);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  // --------------------------------------------------
  // Loading state
  // --------------------------------------------------
  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Locatario" subtitle="Carregando..." />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // Not found state
  // --------------------------------------------------
  if (notFound || !tenant) {
    return (
      <div className="flex flex-col">
        <Header title="Locatario" subtitle="Nao encontrado" />
        <div className="p-4 sm:p-6 space-y-4">
          <Button variant="ghost" size="sm" className="gap-1.5" asChild>
            <Link href="/locatarios">
              <ArrowLeft className="h-4 w-4" />
              Voltar para locatarios
            </Link>
          </Button>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-lg font-semibold">Locatario nao encontrado</h2>
            <p className="text-sm text-muted-foreground mt-1">
              O locatario solicitado nao existe ou foi removido.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // Main render
  // --------------------------------------------------
  return (
    <div className="flex flex-col">
      <Header title="Locatario" subtitle="Detalhes do locatario" />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" className="gap-1.5" asChild>
          <Link href="/locatarios">
            <ArrowLeft className="h-4 w-4" />
            Voltar para locatarios
          </Link>
        </Button>

        {/* Header with name, badge, and actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{tenant.name}</h2>
                <Badge
                  variant="outline"
                  className={
                    tenant.personType === "PJ"
                      ? "bg-violet-100 text-violet-700 border-violet-200"
                      : "bg-sky-100 text-sky-700 border-sky-200"
                  }
                >
                  {tenant.personType === "PJ" ? "Pessoa Juridica" : "Pessoa Fisica"}
                </Badge>
                {!tenant.active && (
                  <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
                    Inativo
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Cadastrado em {formatDate(tenant.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Total Contratos",
              value: String(totalContracts),
              icon: FileText,
            },
            {
              label: "Total Pagamentos",
              value: String(totalPayments),
              icon: DollarSign,
            },
            {
              label: "Pagamentos Atrasados",
              value: String(overduePayments),
              icon: AlertTriangle,
              color: overduePayments > 0 ? "text-red-500" : undefined,
            },
            {
              label: "Total Pago",
              value: formatCurrency(totalPaid),
              icon: CircleCheckBig,
              color: "text-emerald-600",
            },
          ].map((stat) => (
            <Card key={stat.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p
                  className={`text-xl font-bold mt-1 ${stat.color ?? ""}`}
                >
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dados Pessoais */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Dados Pessoais</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Nome" value={tenant.name} />
                <InfoField label="CPF/CNPJ" value={tenant.cpfCnpj} />
                <InfoField
                  label="Tipo de Pessoa"
                  value={tenant.personType === "PJ" ? "Pessoa Juridica" : "Pessoa Fisica"}
                />
                <InfoField label="RG" value={tenant.rgNumber} />
                <InfoField label="Email" value={tenant.email} />
                <InfoField label="Telefone" value={tenant.phone} />
              </div>
            </CardContent>
          </Card>

          {/* Dados Profissionais */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Dados Profissionais</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InfoField label="Profissao" value={tenant.occupation} />
                <InfoField
                  label="Renda Mensal"
                  value={
                    tenant.monthlyIncome != null
                      ? formatCurrency(tenant.monthlyIncome)
                      : null
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Endereco */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Endereco</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <InfoField label="Rua" value={tenant.street} />
                <InfoField label="Numero" value={tenant.number} />
                <InfoField label="Complemento" value={tenant.complement} />
                <InfoField label="Bairro" value={tenant.neighborhood} />
                <InfoField label="Cidade" value={tenant.city} />
                <InfoField label="Estado" value={tenant.state} />
                <InfoField label="CEP" value={tenant.zipCode} />
              </div>
              {buildAddress() && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                  {buildAddress()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Contratos */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 p-5 pb-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Contratos</h3>
              <Badge variant="secondary" className="ml-auto text-xs">
                {totalContracts}
              </Badge>
            </div>
            {tenant.contracts.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">
                  Nenhum contrato vinculado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Codigo</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">
                      Valor Aluguel
                    </TableHead>
                    <TableHead className="text-xs">Inicio</TableHead>
                    <TableHead className="text-xs">Termino</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.contracts.map((contract) => {
                    const status =
                      contractStatusConfig[contract.status] ??
                      contractStatusConfig.ATIVO;
                    return (
                      <TableRow key={contract.id} className="cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/contratos/${contract.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {contract.code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs border ${status.className}`}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {formatCurrency(contract.rentalValue)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(contract.startDate)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(contract.endDate)}
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

        {/* Historico de Pagamentos */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 p-5 pb-3">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">
                Historico de Pagamentos
              </h3>
              <Badge variant="secondary" className="ml-auto text-xs">
                {totalPayments}
              </Badge>
            </div>
            {tenant.payments.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">
                  Nenhum pagamento registrado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Codigo</TableHead>
                    <TableHead className="text-xs">Contrato</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Data Pagamento</TableHead>
                    <TableHead className="text-xs text-center">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.payments.map((payment) => {
                    const status =
                      paymentStatusConfig[payment.status] ??
                      paymentStatusConfig.PENDENTE;
                    const contractCode =
                      payment.contract?.code ??
                      contractCodeMap[payment.contractId] ??
                      "-";
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="text-sm font-medium">
                          {payment.code}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {contractCode}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold">
                          {formatCurrency(payment.value)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(payment.dueDate)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.paidAt ? formatDate(payment.paidAt) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-xs border ${status.className}`}
                          >
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

        {/* Observacoes */}
        {tenant.notes && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-2">Observacoes</h3>
              <p className="text-sm text-muted-foreground">{tenant.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Form Dialog */}
      <TenantForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tenant={tenant}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Locatario</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o locatario{" "}
              <strong>{tenant.name}</strong>? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
