"use client";

import { Header } from "@/components/layout/header";
import { PropertyForm } from "@/components/forms/property-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Building2,
  Plus,
  Search,
  MapPin,
  BedDouble,
  Bath,
  Car,
  Maximize,
  MoreVertical,
  Grid3X3,
  List,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ImportSpreadsheet } from "@/components/forms/import-spreadsheet";
import { FileSpreadsheet } from "lucide-react";

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
  ownerId: string;
  notes: string | null;
  active: boolean;
  owner?: { id: string; name: string };
  photos?: { id: string; url: string; caption: string | null; order: number }[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  ALUGADO: { label: "Alugado", className: "bg-primary/10 text-primary border-primary/20" },
  DISPONIVEL: { label: "Disponivel", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  MANUTENCAO: { label: "Manutencao", className: "bg-amber-100 text-amber-700 border-amber-200" },
  INATIVO: { label: "Inativo", className: "bg-muted text-muted-foreground" },
};

const typeLabels: Record<string, string> = {
  CASA: "Casa",
  APARTAMENTO: "Apartamento",
  COMERCIAL: "Comercial",
  TERRENO: "Terreno",
  SALA: "Sala",
  PAVILHAO: "Pavilhao",
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function ImoveisPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><p className="text-sm text-muted-foreground">Carregando...</p></div>}>
      <ImoveisContent />
    </Suspense>
  );
}

function ImoveisContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  // Form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | undefined>(undefined);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/properties");
      if (response.ok) {
        const data = await response.json();
        setProperties(data);
      }
    } catch (error) {
      console.error("Erro ao carregar imoveis:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  useEffect(() => {
    if (searchParams.get("novo") === "true") {
      setEditingProperty(undefined);
      setFormOpen(true);
      router.replace("/imoveis");
    }
  }, [searchParams, router]);

  // Client-side filtering
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          p.title.toLowerCase().includes(searchLower) ||
          p.street.toLowerCase().includes(searchLower) ||
          p.neighborhood.toLowerCase().includes(searchLower) ||
          p.city.toLowerCase().includes(searchLower) ||
          (p.owner?.name?.toLowerCase().includes(searchLower) ?? false);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && p.status !== statusFilter) return false;

      // Type filter
      if (typeFilter !== "all" && p.type !== typeFilter) return false;

      return true;
    });
  }, [properties, search, statusFilter, typeFilter]);

  // Stats
  const totalProperties = properties.length;
  const availableProperties = properties.filter((p) => p.status === "DISPONIVEL").length;
  const rentedProperties = properties.filter((p) => p.status === "ALUGADO").length;

  function handleNewProperty() {
    setEditingProperty(undefined);
    setFormOpen(true);
  }

  function handleEditProperty(property: Property) {
    setEditingProperty(property);
    setFormOpen(true);
  }

  function handleDeleteClick(property: Property) {
    setDeletingProperty(property);
    setDeleteDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deletingProperty) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/properties/${deletingProperty.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao excluir imovel");
      }
      setDeleteDialogOpen(false);
      setDeletingProperty(null);
      fetchProperties();
    } catch (error: any) {
      alert(error.message || "Erro ao excluir imovel");
    } finally {
      setDeleting(false);
    }
  }

  function handleFormSuccess() {
    fetchProperties();
  }

  return (
    <div className="flex flex-col">
      <Header title="Imoveis" subtitle="Gerencie todos os imoveis do portfolio" />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Imoveis</p>
                  <p className="text-2xl font-bold">{totalProperties}</p>
                </div>
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Disponiveis</p>
                  <p className="text-2xl font-bold text-emerald-600">{availableProperties}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Alugados</p>
                  <p className="text-2xl font-bold text-primary">{rentedProperties}</p>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-[300px] sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por titulo, endereco, proprietario..."
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="DISPONIVEL">Disponivel</SelectItem>
                <SelectItem value="ALUGADO">Alugado</SelectItem>
                <SelectItem value="MANUTENCAO">Manutencao</SelectItem>
                <SelectItem value="INATIVO">Inativo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="CASA">Casa</SelectItem>
                <SelectItem value="APARTAMENTO">Apartamento</SelectItem>
                <SelectItem value="COMERCIAL">Comercial</SelectItem>
                <SelectItem value="TERRENO">Terreno</SelectItem>
                <SelectItem value="SALA">Sala</SelectItem>
                <SelectItem value="PAVILHAO">Pavilhao</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg p-0.5">
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("grid")}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("list")}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4" />
              Importar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleNewProperty}>
              <Plus className="h-4 w-4" />
              Novo Imovel
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredProperties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mb-4 opacity-40" />
            <p className="text-lg font-medium">Nenhum imovel encontrado</p>
            <p className="text-sm">
              {properties.length === 0
                ? "Cadastre seu primeiro imovel clicando em \"Novo Imovel\"."
                : "Tente ajustar os filtros de busca."}
            </p>
          </div>
        )}

        {/* Properties Grid */}
        {!loading && filteredProperties.length > 0 && (
          <div
            className={cn(
              "grid gap-4",
              view === "grid"
                ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                : "grid-cols-1"
            )}
          >
            {filteredProperties.map((property) => {
              const status = statusConfig[property.status] || statusConfig.INATIVO;
              const typeLabel = typeLabels[property.type] || property.type;
              const address = [property.street, property.number, property.neighborhood]
                .filter(Boolean)
                .join(", ");

              return (
                <Card
                  key={property.id}
                  className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => router.push(`/imoveis/${property.id}`)}
                >
                  <CardContent className={cn("p-0", view === "list" && "flex items-center")}>
                    {/* Property photo */}
                    <div
                      className={cn(
                        "relative overflow-hidden",
                        view === "grid"
                          ? "h-40 rounded-t-xl"
                          : "h-24 w-32 rounded-l-xl shrink-0"
                      )}
                    >
                      {property.photos && property.photos.length > 0 ? (
                        <img
                          src={property.photos[0].url}
                          alt={property.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
                          <Building2 className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                      )}
                      {/* Type badge on image */}
                      <Badge
                        variant="secondary"
                        className="absolute top-2 left-2 text-xs"
                      >
                        {typeLabel}
                      </Badge>
                    </div>

                    <div className="p-4 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold group-hover:text-primary transition-colors truncate">
                            {property.title}
                          </h3>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{address}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant="outline"
                            className={cn("text-xs border", status.className)}
                          >
                            {status.label}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditProperty(property)}>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => handleDeleteClick(property)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                        {property.bedrooms > 0 && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3.5 w-3.5" /> {property.bedrooms}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Bath className="h-3.5 w-3.5" /> {property.bathrooms}
                        </span>
                        {property.parkingSpaces > 0 && (
                          <span className="flex items-center gap-1">
                            <Car className="h-3.5 w-3.5" /> {property.parkingSpaces}
                          </span>
                        )}
                        {property.area && (
                          <span className="flex items-center gap-1">
                            <Maximize className="h-3.5 w-3.5" /> {property.area}m²
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                        <span className="text-base font-bold text-primary">
                          {property.rentalValue
                            ? formatCurrency(property.rentalValue)
                            : "—"}
                          {property.rentalValue && (
                            <span className="text-xs font-normal text-muted-foreground">
                              /mes
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground truncate ml-2">
                          {property.owner?.name || "—"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Property Form Dialog */}
      <PropertyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        property={editingProperty}
        onSuccess={handleFormSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Imovel</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o imovel{" "}
              <strong>{deletingProperty?.title}</strong>? Esta acao nao pode ser
              desfeita.
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

      {/* Import Spreadsheet Dialog */}
      <ImportSpreadsheet
        entityType="properties"
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => fetchProperties()}
      />
    </div>
  );
}
