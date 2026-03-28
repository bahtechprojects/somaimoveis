"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { PropertyForm } from "@/components/forms/property-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft,
  Building2,
  Pencil,
  Trash2,
  Loader2,
  Camera,
  Upload,
  MapPin,
  BedDouble,
  Bath,
  Car,
  Maximize,
  Sofa,
  DollarSign,
  User,
  Users,
  FileText,
  CalendarDays,
  ExternalLink,
  ImageOff,
  Plus,
  X,
  ClipboardList,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoUpload } from "@/components/forms/photo-upload";
import { cn } from "@/lib/utils";

// --- Types ---

interface PropertyPhoto {
  id: string;
  url: string;
  caption: string | null;
  order: number;
}

interface Owner {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpfCnpj: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface Contract {
  id: string;
  code: string;
  type: string;
  status: string;
  tenantId: string;
  tenant: Tenant;
  rentalValue: number;
  startDate: string;
  endDate: string;
}

interface PropertyOwnerRecord {
  id: string;
  propertyId: string;
  ownerId: string;
  percentage: number;
  owner: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

interface PropertyOwnersResponse {
  propertyId: string;
  primaryOwnerId: string;
  owners: PropertyOwnerRecord[];
}

interface OwnerOption {
  id: string;
  name: string;
  email: string | null;
}

interface Property {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  area: number | null;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number;
  furnished: boolean;
  rentalValue: number | null;
  saleValue: number | null;
  condoFee: number | null;
  iptuValue: number | null;
  registrationNumber: string | null;
  iptuNumber: string | null;
  energyMeter: string | null;
  waterMeter: string | null;
  gasMeter: string | null;
  condoAdmin: string | null;
  ownerId: string;
  owner: Owner;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  photos: PropertyPhoto[];
  contracts: Contract[];
}

// --- Config ---

const statusConfig: Record<string, { label: string; className: string }> = {
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
    className: "bg-muted text-muted-foreground",
  },
  PENDENTE_RENOVACAO: {
    label: "Pendente Renovação",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const typeLabels: Record<string, string> = {
  CASA: "Casa",
  APARTAMENTO: "Apartamento",
  COMERCIAL: "Comercial",
  TERRENO: "Terreno",
  SALA: "Sala",
  GALPAO: "Galpao",
};

// --- Helpers ---

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("pt-BR");
}

// --- Component ---

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Edit form dialog state
  const [formOpen, setFormOpen] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Owners state
  const [ownersData, setOwnersData] = useState<PropertyOwnersResponse | null>(null);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [allOwners, setAllOwners] = useState<OwnerOption[]>([]);
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [ownerPercentage, setOwnerPercentage] = useState("");
  const [addingOwner, setAddingOwner] = useState(false);
  const [removingOwnerId, setRemovingOwnerId] = useState<string | null>(null);

  const fetchProperty = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const response = await fetch(`/api/properties/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setProperty(data);
      }
    } catch (error) {
      console.error("Erro ao carregar imovel:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchOwners = useCallback(async () => {
    setOwnersLoading(true);
    try {
      const response = await fetch(`/api/properties/${id}/owners`);
      if (response.ok) {
        const data = await response.json();
        setOwnersData(data);
      }
    } catch (error) {
      console.error("Erro ao carregar proprietarios:", error);
    } finally {
      setOwnersLoading(false);
    }
  }, [id]);

  const fetchAllOwners = useCallback(async () => {
    try {
      const response = await fetch("/api/owners");
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : data.data || [];
        setAllOwners(
          list.map((o: any) => ({ id: o.id, name: o.name, email: o.email }))
        );
      }
    } catch (error) {
      console.error("Erro ao carregar lista de proprietarios:", error);
    }
  }, []);

  useEffect(() => {
    if (id) {
      fetchProperty();
      fetchOwners();
      fetchAllOwners();
    }
  }, [id, fetchProperty, fetchOwners, fetchAllOwners]);

  async function handleDeleteConfirm() {
    if (!property) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/properties/${property.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao excluir imovel");
      }
      router.push("/imoveis");
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir imovel");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  function handleFormSuccess() {
    fetchProperty();
  }

  async function handleAddOwner() {
    if (!selectedOwnerId || !ownerPercentage) return;
    const pct = parseFloat(ownerPercentage);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      toast.error("Percentual deve ser entre 0 e 100");
      return;
    }
    setAddingOwner(true);
    try {
      const response = await fetch(`/api/properties/${id}/owners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: selectedOwnerId, percentage: pct }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao adicionar proprietario");
      }
      setAddOwnerOpen(false);
      setSelectedOwnerId("");
      setOwnerPercentage("");
      fetchOwners();
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar proprietario");
    } finally {
      setAddingOwner(false);
    }
  }

  async function handleRemoveOwner(ownerId: string) {
    if (!confirm("Tem certeza que deseja remover este proprietario?")) return;
    setRemovingOwnerId(ownerId);
    try {
      const response = await fetch(`/api/properties/${id}/owners/${ownerId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao remover proprietario");
      }
      fetchOwners();
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover proprietario");
    } finally {
      setRemovingOwnerId(null);
    }
  }

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex flex-col">
        <Header title="Detalhes do Imóvel" />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // --- Not Found State ---
  if (notFound || !property) {
    return (
      <div className="flex flex-col">
        <Header title="Imóvel não encontrado" />
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Building2 className="h-16 w-16 mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Imóvel não encontrado</p>
          <p className="text-sm mb-6">
            O imovel solicitado nao existe ou foi removido.
          </p>
          <Button variant="outline" asChild>
            <Link href="/imoveis">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Imoveis
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // --- Data ---
  const status = statusConfig[property.status] || statusConfig.INATIVO;
  const typeLabel = typeLabels[property.type] || property.type;
  const fullAddress = [
    `${property.street}, ${property.number}`,
    property.complement,
    property.neighborhood,
    `${property.city} - ${property.state}`,
    property.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex flex-col">
      <Header
        title="Detalhes do Imóvel"
        subtitle={property.title}
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Top bar: Back + Actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 -ml-2">
            <Link href="/imoveis">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setFormOpen(true)}
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </div>

        {/* Title + Badges */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-foreground">
              {property.title}
            </h2>
            <Badge variant="secondary" className="text-xs">
              {typeLabel}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-xs border", status.className)}
            >
              {status.label}
            </Badge>
          </div>
          {property.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
              {property.description}
            </p>
          )}
        </div>

        {/* Photo Gallery with Upload */}
        <PhotoUpload
          propertyId={property.id}
          photos={property.photos}
          onPhotosChange={fetchProperty}
        />

        {/* Info Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Detalhes do Imóvel */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Detalhes do Imóvel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Tipo
                  </p>
                  <p className="text-sm font-medium">{typeLabel}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Area
                  </p>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Maximize className="h-3.5 w-3.5 text-muted-foreground" />
                    {property.area ? `${property.area} m\u00B2` : "\u2014"}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Quartos
                  </p>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                    {property.bedrooms}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Banheiros
                  </p>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Bath className="h-3.5 w-3.5 text-muted-foreground" />
                    {property.bathrooms}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Vagas
                  </p>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Car className="h-3.5 w-3.5 text-muted-foreground" />
                    {property.parkingSpaces}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Mobiliado
                  </p>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Sofa className="h-3.5 w-3.5 text-muted-foreground" />
                    {property.furnished ? "Sim" : "Nao"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Endereço */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Logradouro
                  </p>
                  <p className="text-sm font-medium">
                    {property.street}, {property.number}
                    {property.complement && ` - ${property.complement}`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Bairro
                    </p>
                    <p className="text-sm font-medium">
                      {property.neighborhood}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Cidade / UF
                    </p>
                    <p className="text-sm font-medium">
                      {property.city} - {property.state}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    CEP
                  </p>
                  <p className="text-sm font-medium">{property.zipCode}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Valores */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Valores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Aluguel
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {formatCurrency(property.rentalValue)}
                    {property.rentalValue != null && (
                      <span className="text-xs font-normal text-muted-foreground">
                        /mes
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Venda
                  </p>
                  <p className="text-sm font-bold">
                    {formatCurrency(property.saleValue)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Condominio
                  </p>
                  <p className="text-sm font-medium">
                    {formatCurrency(property.condoFee)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    IPTU
                  </p>
                  <p className="text-sm font-medium">
                    {formatCurrency(property.iptuValue)}
                  </p>
                </div>
              </div>
              {(property.rentalValue != null && property.condoFee != null) && (
                <>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Total Mensal (Aluguel + Condominio)
                    </p>
                    <p className="text-sm font-bold text-foreground">
                      {formatCurrency(
                        (property.rentalValue || 0) + (property.condoFee || 0)
                      )}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Codigos e Registros */}
          {(property.registrationNumber || property.iptuNumber || property.energyMeter || property.waterMeter || property.gasMeter || property.condoAdmin) && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Codigos e Registros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {property.registrationNumber && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Matricula</p>
                      <p className="text-sm font-medium">{property.registrationNumber}</p>
                    </div>
                  )}
                  {property.iptuNumber && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">N do IPTU</p>
                      <p className="text-sm font-medium">{property.iptuNumber}</p>
                    </div>
                  )}
                  {property.energyMeter && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Medidor Energia</p>
                      <p className="text-sm font-medium">{property.energyMeter}</p>
                    </div>
                  )}
                  {property.waterMeter && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Medidor Agua</p>
                      <p className="text-sm font-medium">{property.waterMeter}</p>
                    </div>
                  )}
                  {property.gasMeter && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Medidor Gas</p>
                      <p className="text-sm font-medium">{property.gasMeter}</p>
                    </div>
                  )}
                  {property.condoAdmin && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Administradora</p>
                      <p className="text-sm font-medium">{property.condoAdmin}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Proprietário */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Proprietario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {property.owner.name}
                  </p>
                  {property.owner.email && (
                    <p className="text-xs text-muted-foreground">
                      {property.owner.email}
                    </p>
                  )}
                  {property.owner.phone && (
                    <p className="text-xs text-muted-foreground">
                      {property.owner.phone}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <Link href={`/proprietarios/${property.ownerId}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver Perfil
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Proprietarios (Split Ownership) */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Proprietarios
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setAddOwnerOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {ownersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !ownersData || ownersData.owners.length === 0 ? (
              <div className="space-y-4">
                {/* Show primary owner even if no PropertyOwner records */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      P
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{property.owner.name}</p>
                      {property.owner.email && (
                        <p className="text-xs text-muted-foreground">{property.owner.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">Principal</Badge>
                    <span className="text-sm font-medium text-muted-foreground">100%</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Adicione mais proprietarios para dividir a propriedade.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Primary owner row */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                      P
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{property.owner.name}</p>
                      {property.owner.email && (
                        <p className="text-xs text-muted-foreground">{property.owner.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">Principal</Badge>
                  </div>
                </div>

                {/* Additional owners */}
                {ownersData.owners.map((po) => {
                  const isPrimary = po.ownerId === ownersData.primaryOwnerId;
                  return (
                    <div
                      key={po.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground text-sm font-bold">
                          {po.owner.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{po.owner.name}</p>
                          {po.owner.email && (
                            <p className="text-xs text-muted-foreground">{po.owner.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">{po.percentage}%</span>
                        {isPrimary && (
                          <Badge variant="secondary" className="text-xs">Principal</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveOwner(po.ownerId)}
                          disabled={removingOwnerId === po.ownerId}
                        >
                          {removingOwnerId === po.ownerId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {/* Total percentage */}
                <Separator />
                <div className="flex items-center justify-between px-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Total
                  </p>
                  {(() => {
                    const total = ownersData.owners.reduce(
                      (sum, o) => sum + o.percentage,
                      0
                    );
                    const isComplete = Math.abs(total - 100) < 0.01;
                    return (
                      <span
                        className={cn(
                          "text-sm font-bold",
                          isComplete ? "text-emerald-600" : "text-amber-600"
                        )}
                      >
                        {total.toFixed(1)}%
                        {!isComplete && (
                          <span className="text-xs font-normal ml-1">
                            (faltam {(100 - total).toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Owner Dialog */}
        <Dialog open={addOwnerOpen} onOpenChange={setAddOwnerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Proprietário</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="owner-select">Proprietário</Label>
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                  <SelectTrigger id="owner-select">
                    <SelectValue placeholder="Selecione um proprietario" />
                  </SelectTrigger>
                  <SelectContent>
                    {allOwners
                      .filter(
                        (o) =>
                          !ownersData?.owners.some((po) => po.ownerId === o.id)
                      )
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name} {o.email ? `(${o.email})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="percentage-input">Percentual (%)</Label>
                <Input
                  id="percentage-input"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  placeholder="Ex: 25"
                  value={ownerPercentage}
                  onChange={(e) => setOwnerPercentage(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddOwnerOpen(false)}
                disabled={addingOwner}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddOwner}
                disabled={addingOwner || !selectedOwnerId || !ownerPercentage}
              >
                {addingOwner && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Notes */}
        {property.notes && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Observações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {property.notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Contratos Vinculados */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Contratos Vinculados
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {property.contracts.length}{" "}
                {property.contracts.length === 1 ? "contrato" : "contratos"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {property.contracts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <FileText className="h-10 w-10 opacity-30 mb-2" />
                <p className="text-sm font-medium">
                  Nenhum contrato vinculado
                </p>
                <p className="text-xs mt-1">
                  Este imovel ainda nao possui contratos associados.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Locatário</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead className="text-right">Acao</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {property.contracts.map((contract) => {
                    const cStatus =
                      contractStatusConfig[contract.status] ||
                      contractStatusConfig.ENCERRADO;
                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="font-medium">
                          {contract.code}
                        </TableCell>
                        <TableCell>{contract.tenant?.name || "\u2014"}</TableCell>
                        <TableCell>
                          {formatCurrency(contract.rentalValue)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs border",
                              cStatus.className
                            )}
                          >
                            {cStatus.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(contract.startDate)}</TableCell>
                        <TableCell>{formatDate(contract.endDate)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="gap-1"
                          >
                            <Link href={`/contratos/${contract.id}`}>
                              <ExternalLink className="h-3.5 w-3.5" />
                              Ver
                            </Link>
                          </Button>
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

        {/* Metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Criado em {formatDate(property.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Atualizado em {formatDate(property.updatedAt)}
          </span>
        </div>
      </div>

      {/* Property Form Dialog */}
      <PropertyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        property={property}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Imóvel</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o imovel{" "}
              <strong>{property.title}</strong>? Esta acao nao pode ser
              desfeita.
              {property.contracts.length > 0 && (
                <>
                  {" "}
                  Este imovel possui{" "}
                  <strong>
                    {property.contracts.length}{" "}
                    {property.contracts.length === 1
                      ? "contrato vinculado"
                      : "contratos vinculados"}
                  </strong>
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
