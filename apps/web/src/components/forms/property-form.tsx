"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, Plus } from "lucide-react";
import { OwnerForm } from "@/components/forms/owner-form";
import { useCepLookup } from "@/hooks/use-cep-lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const propertySchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  type: z.string().min(1, "Tipo é obrigatório"),
  status: z.string().default("DISPONIVEL"),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z.string().min(1, "Número é obrigatório"),
  complement: z.string().optional(),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().min(1, "Estado é obrigatório"),
  zipCode: z.string().min(1, "CEP é obrigatório"),
  area: z.coerce.number().optional(),
  bedrooms: z.coerce.number().int().min(0).default(0),
  bathrooms: z.coerce.number().int().min(0).default(0),
  parkingSpaces: z.coerce.number().int().min(0).default(0),
  furnished: z.boolean().default(false),
  rentalValue: z.coerce.number().optional(),
  saleValue: z.coerce.number().optional(),
  condoFee: z.coerce.number().optional(),
  iptuValue: z.coerce.number().optional(),
  registrationNumber: z.string().optional(),
  iptuNumber: z.string().optional(),
  energyMeter: z.string().optional(),
  waterMeter: z.string().optional(),
  gasMeter: z.string().optional(),
  condoAdmin: z.string().optional(),
  ownerId: z.string().min(1, "Proprietário é obrigatório"),
  notes: z.string().optional(),
});

type PropertyFormData = z.infer<typeof propertySchema>;

interface PropertyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: any;
  onSuccess: () => void;
}

interface Owner {
  id: string;
  name: string;
}

export function PropertyForm({ open, onOpenChange, property, onSuccess }: PropertyFormProps) {
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [showNewOwner, setShowNewOwner] = useState(false);
  const isEditing = !!property;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PropertyFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(propertySchema) as any,
    defaultValues: {
      title: "",
      description: "",
      type: "",
      status: "DISPONIVEL",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      zipCode: "",
      area: undefined,
      bedrooms: 0,
      bathrooms: 0,
      parkingSpaces: 0,
      furnished: false,
      rentalValue: undefined,
      saleValue: undefined,
      condoFee: undefined,
      iptuValue: undefined,
      ownerId: "",
      notes: "",
    },
  });

  const selectedType = watch("type");
  const selectedStatus = watch("status");
  const selectedOwnerId = watch("ownerId");
  const furnished = watch("furnished");

  const handleCepResult = useCallback((data: { street: string; neighborhood: string; city: string; state: string }) => {
    setValue("street", data.street, { shouldValidate: true });
    setValue("neighborhood", data.neighborhood, { shouldValidate: true });
    setValue("city", data.city, { shouldValidate: true });
    setValue("state", data.state, { shouldValidate: true });
  }, [setValue]);

  const { lookup: lookupCep, loading: cepLoading, error: cepError, formatCep } = useCepLookup({ onResult: handleCepResult });

  // Fetch owners list
  useEffect(() => {
    async function fetchOwners() {
      try {
        const response = await fetch("/api/owners");
        if (response.ok) {
          const data = await response.json();
          setOwners(data.map((o: any) => ({ id: o.id, name: o.name })));
        }
      } catch (error) {
        console.error("Erro ao carregar proprietarios:", error);
      }
    }
    if (open) {
      fetchOwners();
    }
  }, [open]);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (property) {
        reset({
          title: property.title || "",
          description: property.description || "",
          type: property.type || "",
          status: property.status || "DISPONIVEL",
          street: property.street || "",
          number: property.number || "",
          complement: property.complement || "",
          neighborhood: property.neighborhood || "",
          city: property.city || "",
          state: property.state || "",
          zipCode: property.zipCode || "",
          area: property.area ?? undefined,
          bedrooms: property.bedrooms ?? 0,
          bathrooms: property.bathrooms ?? 0,
          parkingSpaces: property.parkingSpaces ?? 0,
          furnished: property.furnished ?? false,
          rentalValue: property.rentalValue ?? undefined,
          saleValue: property.saleValue ?? undefined,
          condoFee: property.condoFee ?? undefined,
          iptuValue: property.iptuValue ?? undefined,
          registrationNumber: property.registrationNumber || "",
          iptuNumber: property.iptuNumber || "",
          energyMeter: property.energyMeter || "",
          waterMeter: property.waterMeter || "",
          gasMeter: property.gasMeter || "",
          condoAdmin: property.condoAdmin || "",
          ownerId: property.ownerId || "",
          notes: property.notes || "",
        });
      } else {
        reset({
          title: "",
          description: "",
          type: "",
          status: "DISPONIVEL",
          street: "",
          number: "",
          complement: "",
          neighborhood: "",
          city: "",
          state: "",
          zipCode: "",
          area: undefined,
          bedrooms: 0,
          bathrooms: 0,
          parkingSpaces: 0,
          furnished: false,
          rentalValue: undefined,
          saleValue: undefined,
          condoFee: undefined,
          iptuValue: undefined,
          registrationNumber: "",
          iptuNumber: "",
          energyMeter: "",
          waterMeter: "",
          gasMeter: "",
          condoAdmin: "",
          ownerId: "",
          notes: "",
        });
      }
    }
  }, [open, property, reset]);

  async function onSubmit(data: PropertyFormData) {
    setLoading(true);
    try {
      const url = isEditing ? `/api/properties/${property.id}` : "/api/properties";
      const method = isEditing ? "PUT" : "POST";

      // Clean up and send only valid Prisma fields
      const payload = {
        title: data.title,
        type: data.type,
        status: data.status,
        ownerId: data.ownerId,
        street: data.street,
        number: data.number,
        complement: data.complement || null,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        description: data.description || null,
        area: data.area || null,
        bedrooms: Number(data.bedrooms) || 0,
        bathrooms: Number(data.bathrooms) || 0,
        parkingSpaces: Number(data.parkingSpaces) || 0,
        furnished: data.furnished || false,
        rentalValue: data.rentalValue || null,
        saleValue: data.saleValue || null,
        condoFee: data.condoFee || null,
        iptuValue: data.iptuValue || null,
        registrationNumber: data.registrationNumber || null,
        iptuNumber: data.iptuNumber || null,
        energyMeter: data.energyMeter || null,
        waterMeter: data.waterMeter || null,
        gasMeter: data.gasMeter || null,
        condoAdmin: data.condoAdmin || null,
        notes: data.notes || null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao salvar imovel");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar imovel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <><Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[90vh]" preventOutsideClose>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Imóvel" : "Novo Imóvel"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes do imovel abaixo."
              : "Preencha as informacoes do novo imovel."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Informações Básicas */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Informações Básicas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="title">Titulo *</Label>
                <Input
                  id="title"
                  placeholder="Ex: Apartamento 302 - Ed. Solar"
                  {...register("title")}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select
                  value={selectedType}
                  onValueChange={(value) => setValue("type", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASA">Casa</SelectItem>
                    <SelectItem value="APARTAMENTO">Apartamento</SelectItem>
                    <SelectItem value="DUPLEX">Duplex</SelectItem>
                    <SelectItem value="GEMINADO">Geminado</SelectItem>
                    <SelectItem value="SALA">Sala</SelectItem>
                    <SelectItem value="CASA_COMERCIAL">Casa Comercial</SelectItem>
                    <SelectItem value="LOJA">Loja</SelectItem>
                    <SelectItem value="TERRENO">Terreno</SelectItem>
                    <SelectItem value="PAVILHAO">Pavilhão</SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-xs text-destructive">{errors.type.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={selectedStatus}
                  onValueChange={(value) => setValue("status", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DISPONIVEL">Disponível</SelectItem>
                    <SelectItem value="ALUGADO">Alugado</SelectItem>
                    <SelectItem value="MANUTENCAO">Manutenção</SelectItem>
                    <SelectItem value="INATIVO">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ownerId">Proprietário *</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedOwnerId}
                    onValueChange={(value) => setValue("ownerId", value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o proprietário" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {owners.map((owner) => (
                        <SelectItem key={owner.id} value={owner.id}>
                          {owner.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="icon" variant="outline" onClick={() => setShowNewOwner(true)} title="Cadastrar proprietário">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {errors.ownerId && (
                  <p className="text-xs text-destructive">{errors.ownerId.message}</p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Descricao</Label>
                <textarea
                  id="description"
                  placeholder="Descricao do imovel"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register("description")}
                />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Endereço
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zipCode">CEP *</Label>
                <div className="flex gap-2">
                  <Input
                    id="zipCode"
                    placeholder="00000-000"
                    maxLength={9}
                    {...register("zipCode", {
                      onChange: (e) => {
                        const formatted = formatCep(e.target.value);
                        setValue("zipCode", formatted);
                        if (formatted.length === 9) lookupCep(formatted);
                      },
                    })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={cepLoading}
                    onClick={() => lookupCep(watch("zipCode"))}
                    title="Buscar CEP"
                  >
                    {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {errors.zipCode && (
                  <p className="text-xs text-destructive">{errors.zipCode.message}</p>
                )}
                {cepError && (
                  <p className="text-xs text-destructive">{cepError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="number">Número *</Label>
                <Input
                  id="number"
                  placeholder="123"
                  {...register("number")}
                />
                {errors.number && (
                  <p className="text-xs text-destructive">{errors.number.message}</p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="street">Rua *</Label>
                <Input
                  id="street"
                  placeholder="Nome da rua"
                  {...register("street")}
                />
                {errors.street && (
                  <p className="text-xs text-destructive">{errors.street.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="complement">Complemento</Label>
                <Input
                  id="complement"
                  placeholder="Apto, bloco, etc."
                  {...register("complement")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro *</Label>
                <Input
                  id="neighborhood"
                  placeholder="Nome do bairro"
                  {...register("neighborhood")}
                />
                {errors.neighborhood && (
                  <p className="text-xs text-destructive">{errors.neighborhood.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Cidade *</Label>
                <Input
                  id="city"
                  placeholder="Nome da cidade"
                  {...register("city")}
                />
                {errors.city && (
                  <p className="text-xs text-destructive">{errors.city.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Estado *</Label>
                <Input
                  id="state"
                  placeholder="UF"
                  maxLength={2}
                  {...register("state")}
                />
                {errors.state && (
                  <p className="text-xs text-destructive">{errors.state.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Detalhes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Detalhes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="area">Area (m²)</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register("area")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bedrooms">Quartos</Label>
                <Input
                  id="bedrooms"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...register("bedrooms")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bathrooms">Banheiros</Label>
                <Input
                  id="bathrooms"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...register("bathrooms")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parkingSpaces">Vagas</Label>
                <Input
                  id="parkingSpaces"
                  type="number"
                  min="0"
                  placeholder="0"
                  {...register("parkingSpaces")}
                />
              </div>

              <div className="flex items-center space-x-2 sm:col-span-2">
                <Checkbox
                  id="furnished"
                  checked={furnished}
                  onCheckedChange={(checked) =>
                    setValue("furnished", checked === true)
                  }
                />
                <Label htmlFor="furnished" className="cursor-pointer">
                  Imóvel mobiliado
                </Label>
              </div>
            </div>
          </div>

          {/* Valores */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Valores
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rentalValue">Valor Aluguel (R$)</Label>
                <Input
                  id="rentalValue"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register("rentalValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saleValue">Valor Venda (R$)</Label>
                <Input
                  id="saleValue"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register("saleValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="condoFee">Condominio (R$)</Label>
                <Input
                  id="condoFee"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register("condoFee")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="iptuValue">IPTU (R$)</Label>
                <Input
                  id="iptuValue"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...register("iptuValue")}
                />
              </div>
            </div>
          </div>

          {/* Codigos e Registros */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Codigos e Registros
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">Matricula</Label>
                <Input
                  id="registrationNumber"
                  placeholder="N da matricula"
                  {...register("registrationNumber")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="iptuNumber">N do IPTU</Label>
                <Input
                  id="iptuNumber"
                  placeholder="N do IPTU"
                  {...register("iptuNumber")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="energyMeter">N Medidor Energia</Label>
                <Input
                  id="energyMeter"
                  placeholder="N do medidor de energia"
                  {...register("energyMeter")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="waterMeter">N Medidor Agua</Label>
                <Input
                  id="waterMeter"
                  placeholder="N do medidor de agua"
                  {...register("waterMeter")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gasMeter">N Medidor Gas</Label>
                <Input
                  id="gasMeter"
                  placeholder="N do medidor de gas"
                  {...register("gasMeter")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="condoAdmin">Administradora de Condominio</Label>
                <Input
                  id="condoAdmin"
                  placeholder="Nome da administradora"
                  {...register("condoAdmin")}
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              placeholder="Observações adicionais sobre o imóvel"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("notes")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar Alteracoes" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {showNewOwner && (
      <OwnerForm
        open={showNewOwner}
        onOpenChange={setShowNewOwner}
        onSuccess={() => {
          setShowNewOwner(false);
          const prevIds = new Set(owners.map(o => o.id));
          fetch("/api/owners").then(r => r.json()).then(data => {
            const list = Array.isArray(data) ? data : data.data || [];
            setOwners(list);
            const newItem = list.find((o: any) => !prevIds.has(o.id));
            if (newItem) setValue("ownerId", newItem.id);
          });
        }}
      />
    )}
    </>
  );
}
