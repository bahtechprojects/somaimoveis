"use client";

import { useEffect, useState } from "react";
import { usePortal } from "@/components/portal/portal-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  MapPin,
  Home,
  User,
  DollarSign,
} from "lucide-react";

interface PropertyPhoto {
  id: string;
  url: string;
}

interface PropertyContract {
  id: string;
  code: string;
  status: string;
  rentalValue: number;
  tenant: { id: string; name: string };
}

interface Property {
  id: string;
  title: string;
  type: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  status: string;
  rentalValue: number | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  photos: PropertyPhoto[];
  contracts: PropertyContract[];
}

const statusConfig: Record<string, { label: string; className: string }> = {
  DISPONIVEL: {
    label: "Disponivel",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  ALUGADO: {
    label: "Alugado",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  MANUTENCAO: {
    label: "Em Manutencao",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  INDISPONIVEL: {
    label: "Indisponivel",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
};

const typeLabels: Record<string, string> = {
  CASA: "Casa",
  APARTAMENTO: "Apartamento",
  COMERCIAL: "Comercial",
  TERRENO: "Terreno",
  KITNET: "Kitnet",
  SOBRADO: "Sobrado",
  GALPAO: "Galpao",
  SALA: "Sala Comercial",
  LOJA: "Loja",
  OUTRO: "Outro",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function PortalPropertiesPage() {
  const { fetchPortal } = usePortal();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProperties() {
      try {
        const response = await fetchPortal("/api/portal/properties");
        if (response.ok) {
          const data = await response.json();
          setProperties(data);
        }
      } catch (error) {
        console.error("Erro ao carregar imoveis:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProperties();
  }, [fetchPortal]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus Imoveis</h1>
        <p className="text-muted-foreground">
          {loading
            ? "Carregando..."
            : `${properties.length} imovel(is) cadastrado(s)`}
        </p>
      </div>

      {/* Properties Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Carregando imoveis...
            </p>
          </div>
        </div>
      ) : properties.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              Nenhum imovel cadastrado
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((property) => {
            const status = statusConfig[property.status] || {
              label: property.status,
              className: "bg-muted text-muted-foreground",
            };
            const activeContract = property.contracts[0];
            const address = [
              property.street,
              property.number,
              property.complement,
            ]
              .filter(Boolean)
              .join(", ");
            const cityState = `${property.neighborhood} - ${property.city}/${property.state}`;

            return (
              <Card
                key={property.id}
                className="border-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* Property Image or Placeholder */}
                <div className="relative h-40 bg-muted flex items-center justify-center">
                  {property.photos.length > 0 ? (
                    <img
                      src={property.photos[0].url}
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-12 w-12 text-muted-foreground/30" />
                  )}
                  <div className="absolute top-3 right-3">
                    <Badge
                      variant="outline"
                      className={`text-xs border ${status.className}`}
                    >
                      {status.label}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-4 space-y-3">
                  {/* Title & Type */}
                  <div>
                    <h3 className="font-semibold text-sm line-clamp-1">
                      {property.title}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Home className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {typeLabels[property.type] || property.type}
                      </span>
                      {property.area && (
                        <span className="text-xs text-muted-foreground">
                          &middot; {property.area}m²
                        </span>
                      )}
                      {property.bedrooms != null && property.bedrooms > 0 && (
                        <span className="text-xs text-muted-foreground">
                          &middot; {property.bedrooms} quarto(s)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {address}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {cityState}
                      </p>
                    </div>
                  </div>

                  {/* Contract/Value info */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    {activeContract ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {activeContract.tenant?.name || "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-700">
                            {formatCurrency(activeContract.rentalValue)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">
                          Sem contrato ativo
                        </span>
                        {property.rentalValue && (
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-semibold text-muted-foreground">
                              {formatCurrency(property.rentalValue)}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
