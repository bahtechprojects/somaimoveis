"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { OwnerForm } from "@/components/forms/owner-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Building2,
  FileText,
  DollarSign,
  User,
  MapPin,
  Landmark,
  Mail,
  Phone,
  CreditCard,
  Home,
  Globe,
  Key,
  Copy,
  Check,
  ShieldOff,
} from "lucide-react";

// ========================================
// Types
// ========================================

interface Property {
  id: string;
  title: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  status: string;
  rentalValue: number | null;
  type: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  code: string;
  status: string;
  rentalValue: number;
  startDate: string;
  endDate: string;
  property: Property;
  tenant: Tenant;
}

interface OwnerDetail {
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
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  bankPix: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  properties: Property[];
  contracts: Contract[];
}

// ========================================
// Helpers
// ========================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const contractStatusConfig: Record<string, { label: string; className: string }> = {
  ATIVO: {
    label: "Ativo",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  PENDENTE_RENOVACAO: {
    label: "Renovação",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  ENCERRADO: {
    label: "Encerrado",
    className: "bg-muted text-muted-foreground",
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const propertyStatusConfig: Record<string, { label: string; className: string }> = {
  ALUGADO: {
    label: "Alugado",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  DISPONIVEL: {
    label: "Disponível",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  MANUTENCAO: {
    label: "Manutenção",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  INATIVO: {
    label: "Inativo",
    className: "bg-muted text-muted-foreground",
  },
};

function getPropertyStatus(status: string) {
  return propertyStatusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
}

function getContractStatus(status: string) {
  return contractStatusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
}

// ========================================
// Info Row Component
// ========================================

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "---"}</p>
    </div>
  );
}

// ========================================
// Page Component
// ========================================

export default function OwnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [owner, setOwner] = useState<OwnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [portalStatus, setPortalStatus] = useState<{ active: boolean; token: string | null } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  async function fetchOwner() {
    setLoading(true);
    setNotFound(false);
    try {
      const response = await fetch(`/api/owners/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error("Erro ao buscar proprietario");
      const data = await response.json();
      setOwner(data);
    } catch (error) {
      console.error("Erro ao buscar proprietario:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) fetchOwner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/owners/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao excluir proprietario");
        return;
      }
      router.push("/proprietarios");
    } catch (error) {
      toast.error("Erro ao excluir proprietario");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  function handleFormSuccess() {
    fetchOwner();
  }

  async function fetchPortalStatus() {
    try {
      const res = await fetch(`/api/owners/${id}/portal`);
      if (res.ok) {
        const data = await res.json();
        setPortalStatus({
          active: data.portalActive ?? data.active ?? false,
          token: data.portalToken ?? data.token ?? null,
        });
      }
    } catch {
      // silently fail
    }
  }

  useEffect(() => {
    if (id) fetchPortalStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleEnablePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch(`/api/owners/${id}/portal`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPortalStatus({ active: true, token: data.portalToken ?? data.token });
      }
    } catch {
      toast.error("Erro ao ativar portal");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleDisablePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch(`/api/owners/${id}/portal`, { method: "DELETE" });
      if (res.ok) {
        setPortalStatus({ active: false, token: null });
      }
    } catch {
      toast.error("Erro ao desativar portal");
    } finally {
      setPortalLoading(false);
    }
  }

  function handleCopyToken() {
    if (portalStatus?.token) {
      navigator.clipboard.writeText(portalStatus.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  }

  // ========================================
  // Computed Values
  // ========================================

  const totalProperties = owner?.properties.length ?? 0;
  const activeContracts = owner?.contracts.filter((c) => c.status === "ATIVO") ?? [];
  const activeContractCount = activeContracts.length;
  const totalMonthlyRevenue = activeContracts.reduce((sum, c) => sum + c.rentalValue, 0);

  // ========================================
  // Address formatting
  // ========================================

  function formatAddress(o: OwnerDetail): string {
    const parts = [
      o.street && o.number ? `${o.street}, ${o.number}` : o.street,
      o.complement,
      o.neighborhood,
      o.city && o.state ? `${o.city} - ${o.state}` : o.city || o.state,
      o.zipCode ? `CEP: ${o.zipCode}` : null,
    ].filter(Boolean);
    return parts.join(" | ") || "---";
  }

  // ========================================
  // Loading State
  // ========================================

  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Proprietário" subtitle="Carregando..." />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // ========================================
  // 404 State
  // ========================================

  if (notFound || !owner) {
    return (
      <div className="flex flex-col">
        <Header title="Proprietário" subtitle="Não encontrado" />
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <User className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Proprietário não encontrado.</p>
          <Button variant="outline" asChild>
            <Link href="/proprietarios">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Proprietarios
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // ========================================
  // Main Render
  // ========================================

  return (
    <div className="flex flex-col">
      <Header title="Proprietário" subtitle="Detalhes do proprietário" />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
          <Link href="/proprietarios">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>

        {/* Header with name, badge, actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{owner.name}</h2>
                <Badge
                  variant="outline"
                  className={
                    owner.personType === "PJ"
                      ? "bg-violet-100 text-violet-700 border-violet-200"
                      : "bg-sky-100 text-sky-700 border-sky-200"
                  }
                >
                  {owner.personType === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
                </Badge>
                {!owner.active && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">
                    Inativo
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Cadastrado em {formatDate(owner.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
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

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Imoveis</p>
                <p className="text-xl font-bold">{totalProperties}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contratos Ativos</p>
                <p className="text-xl font-bold">{activeContractCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receita Mensal</p>
                <p className="text-xl font-bold">{formatCurrency(totalMonthlyRevenue)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dados Pessoais */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Dados Pessoais</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Nome" value={owner.name} />
                <InfoRow label="CPF/CNPJ" value={owner.cpfCnpj} />
                <InfoRow
                  label="Tipo de Pessoa"
                  value={owner.personType === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
                />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  {owner.email ? (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">{owner.email}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">---</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefone</p>
                  {owner.phone ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">{owner.phone}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">---</p>
                  )}
                </div>
              </div>
              {owner.notes && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="text-sm mt-1">{owner.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Endereço</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Rua" value={owner.street} />
                <InfoRow label="Número" value={owner.number} />
                <InfoRow label="Complemento" value={owner.complement} />
                <InfoRow label="Bairro" value={owner.neighborhood} />
                <InfoRow label="Cidade" value={owner.city} />
                <InfoRow label="Estado" value={owner.state} />
                <InfoRow label="CEP" value={owner.zipCode} />
              </div>
            </CardContent>
          </Card>

          {/* Dados Bancarios */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Dados Bancarios</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <InfoRow label="Banco" value={owner.bankName} />
                <InfoRow label="Agência" value={owner.bankAgency} />
                <InfoRow label="Conta" value={owner.bankAccount} />
                <div>
                  <p className="text-xs text-muted-foreground">Chave PIX</p>
                  {owner.bankPix ? (
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">{owner.bankPix}</p>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">---</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Portal do Proprietário */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Portal do Proprietário</h3>
                {portalStatus?.active ? (
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                    Inativo
                  </Badge>
                )}
              </div>
            </div>

            {portalStatus?.active ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  O proprietario pode acessar o portal em <strong>/portal/login</strong> usando seu email e o token abaixo.
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <code className="text-sm font-mono flex-1 break-all">{portalStatus.token}</code>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyToken}>
                    {tokenCopied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={handleEnablePortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                    Gerar Novo Token
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDisablePortal}
                    disabled={portalLoading}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Revogar Acesso
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ative o portal para que o proprietario possa acompanhar seus imoveis, contratos e extrato financeiro.
                </p>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleEnablePortal}
                  disabled={portalLoading}
                >
                  {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  Ativar Portal
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Imoveis Vinculados */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Imóveis Vinculados</h3>
                <Badge variant="secondary" className="text-xs">
                  {totalProperties}
                </Badge>
              </div>
            </div>

            {owner.properties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhum imovel vinculado a este proprietario.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {owner.properties.map((property) => {
                  const status = getPropertyStatus(property.status);
                  return (
                    <Link
                      key={property.id}
                      href={`/imoveis/${property.id}`}
                      className="block"
                    >
                      <Card className="border shadow-none hover:shadow-md transition-shadow cursor-pointer h-full">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-sm font-semibold line-clamp-1">
                              {property.title}
                            </h4>
                            <Badge
                              variant="outline"
                              className={`text-xs shrink-0 ${status.className}`}
                            >
                              {status.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {property.street}, {property.number} - {property.neighborhood}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {property.city} - {property.state}
                          </p>
                          {property.rentalValue != null && (
                            <p className="text-sm font-semibold text-primary mt-2">
                              {formatCurrency(property.rentalValue)}
                              <span className="text-xs font-normal text-muted-foreground">/mes</span>
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contratos */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Contratos</h3>
                <Badge variant="secondary" className="text-xs">
                  {owner.contracts.length}
                </Badge>
              </div>
            </div>

            {owner.contracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhum contrato vinculado a este proprietario.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">Código</TableHead>
                      <TableHead className="text-xs">Imóvel</TableHead>
                      <TableHead className="text-xs">Locatário</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                      <TableHead className="text-xs text-center">Período</TableHead>
                      <TableHead className="text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owner.contracts.map((contract) => {
                      const status = getContractStatus(contract.status);
                      return (
                        <TableRow
                          key={contract.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/contratos/${contract.id}`)}
                        >
                          <TableCell className="text-sm font-medium">
                            {contract.code}
                          </TableCell>
                          <TableCell className="text-sm">
                            {contract.property?.title || "---"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {contract.tenant?.name || "---"}
                          </TableCell>
                          <TableCell className="text-sm text-right font-semibold">
                            {formatCurrency(contract.rentalValue)}
                          </TableCell>
                          <TableCell className="text-xs text-center text-muted-foreground">
                            {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs ${status.className}`}
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
      </div>

      {/* Owner Form Dialog (Edit) */}
      <OwnerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        owner={owner}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Proprietário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o proprietario{" "}
              <strong>{owner.name}</strong>? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
