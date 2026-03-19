"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const contractSchema = z.object({
  code: z.string().min(1, "Codigo e obrigatorio"),
  type: z.string().min(1),
  status: z.string().min(1),
  propertyId: z.string().min(1, "Imovel e obrigatorio"),
  ownerId: z.string().min(1, "Proprietario e obrigatorio"),
  tenantId: z.string().min(1, "Locatario e obrigatorio"),
  rentalValue: z.coerce.number().min(0.01, "Valor do aluguel e obrigatorio"),
  adminFeePercent: z.coerce.number().min(0),
  paymentDay: z.coerce.number().int().min(1).max(31),
  startDate: z.string().min(1, "Data de inicio e obrigatoria"),
  endDate: z.string().min(1, "Data de termino e obrigatoria"),
  guaranteeType: z.string().optional(),
  guaranteeValue: z.coerce.number().optional(),
  guaranteeNotes: z.string().optional(),
  adjustmentIndex: z.string().optional(),
  adjustmentMonth: z.coerce.number().int().min(1).max(12).optional(),
  notes: z.string().optional(),
});

type ContractFormData = {
  code: string;
  type: string;
  status: string;
  propertyId: string;
  ownerId: string;
  tenantId: string;
  rentalValue: number;
  adminFeePercent: number;
  paymentDay: number;
  startDate: string;
  endDate: string;
  guaranteeType?: string;
  guaranteeValue?: number;
  guaranteeNotes?: string;
  adjustmentIndex?: string;
  adjustmentMonth?: number;
  notes?: string;
};

interface ContractFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: any;
  onSuccess: () => void;
}

interface SelectOption {
  id: string;
  name?: string;
  title?: string;
}

export function ContractForm({ open, onOpenChange, contract, onSuccess }: ContractFormProps) {
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<SelectOption[]>([]);
  const [tenants, setTenants] = useState<SelectOption[]>([]);
  const [properties, setProperties] = useState<SelectOption[]>([]);
  const isEditing = !!contract;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ContractFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(contractSchema) as any,
    defaultValues: {
      code: "",
      type: "LOCACAO",
      status: "ATIVO",
      propertyId: "",
      ownerId: "",
      tenantId: "",
      rentalValue: undefined,
      adminFeePercent: 10,
      paymentDay: 10,
      startDate: "",
      endDate: "",
      guaranteeType: "",
      guaranteeValue: undefined,
      guaranteeNotes: "",
      adjustmentIndex: "IGPM",
      adjustmentMonth: undefined,
      notes: "",
    },
  });

  const selectedType = watch("type");
  const selectedStatus = watch("status");
  const selectedPropertyId = watch("propertyId");
  const selectedOwnerId = watch("ownerId");
  const selectedTenantId = watch("tenantId");
  const selectedGuaranteeType = watch("guaranteeType");
  const selectedAdjustmentIndex = watch("adjustmentIndex");

  // Fetch related data on dialog open
  useEffect(() => {
    async function fetchData() {
      try {
        const [ownersRes, tenantsRes, propertiesRes] = await Promise.all([
          fetch("/api/owners"),
          fetch("/api/tenants"),
          fetch("/api/properties"),
        ]);

        if (ownersRes.ok) {
          const data = await ownersRes.json();
          setOwners(data.map((o: any) => ({ id: o.id, name: o.name })));
        }
        if (tenantsRes.ok) {
          const data = await tenantsRes.json();
          setTenants(data.map((t: any) => ({ id: t.id, name: t.name })));
        }
        if (propertiesRes.ok) {
          const data = await propertiesRes.json();
          setProperties(data.map((p: any) => ({ id: p.id, title: p.title })));
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    }

    if (open) {
      fetchData();
    }
  }, [open]);

  // Auto-generate code for new contracts
  useEffect(() => {
    async function generateCode() {
      try {
        const response = await fetch("/api/contracts");
        if (response.ok) {
          const contracts = await response.json();
          const nextNumber = contracts.length + 1;
          const code = `CTR-${String(nextNumber).padStart(3, "0")}`;
          setValue("code", code);
        }
      } catch (error) {
        setValue("code", "CTR-001");
      }
    }

    if (open && !isEditing) {
      generateCode();
    }
  }, [open, isEditing, setValue]);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (contract) {
        reset({
          code: contract.code || "",
          type: contract.type || "LOCACAO",
          status: contract.status || "ATIVO",
          propertyId: contract.propertyId || "",
          ownerId: contract.ownerId || "",
          tenantId: contract.tenantId || "",
          rentalValue: contract.rentalValue ?? undefined,
          adminFeePercent: contract.adminFeePercent ?? 10,
          paymentDay: contract.paymentDay ?? 10,
          startDate: contract.startDate
            ? new Date(contract.startDate).toISOString().split("T")[0]
            : "",
          endDate: contract.endDate
            ? new Date(contract.endDate).toISOString().split("T")[0]
            : "",
          guaranteeType: contract.guaranteeType || "",
          guaranteeValue: contract.guaranteeValue ?? undefined,
          guaranteeNotes: contract.guaranteeNotes || "",
          adjustmentIndex: contract.adjustmentIndex || "IGPM",
          adjustmentMonth: contract.adjustmentMonth ?? undefined,
          notes: contract.notes || "",
        });
      } else {
        reset({
          code: "",
          type: "LOCACAO",
          status: "ATIVO",
          propertyId: "",
          ownerId: "",
          tenantId: "",
          rentalValue: undefined,
          adminFeePercent: 10,
          paymentDay: 10,
          startDate: "",
          endDate: "",
          guaranteeType: "",
          guaranteeValue: undefined,
          guaranteeNotes: "",
          adjustmentIndex: "IGPM",
          adjustmentMonth: undefined,
          notes: "",
        });
      }
    }
  }, [open, contract, reset]);

  async function onSubmit(data: ContractFormData) {
    setLoading(true);
    try {
      const url = isEditing ? `/api/contracts/${contract.id}` : "/api/contracts";
      const method = isEditing ? "PUT" : "POST";

      const payload = {
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        guaranteeType: data.guaranteeType || null,
        guaranteeValue: data.guaranteeValue || null,
        guaranteeNotes: data.guaranteeNotes || null,
        adjustmentIndex: data.adjustmentIndex || null,
        adjustmentMonth: data.adjustmentMonth || null,
        notes: data.notes || null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao salvar contrato");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      alert(error.message || "Erro ao salvar contrato");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[90vh]" preventOutsideClose>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Contrato" : "Novo Contrato"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes do contrato abaixo."
              : "Preencha as informacoes do novo contrato."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Informacoes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Informacoes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Codigo *</Label>
                <Input
                  id="code"
                  placeholder="CTR-001"
                  {...register("code")}
                />
                {errors.code && (
                  <p className="text-xs text-destructive">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={selectedType}
                  onValueChange={(value) => setValue("type", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOCACAO">Locacao</SelectItem>
                    <SelectItem value="VENDA">Venda</SelectItem>
                    <SelectItem value="TEMPORADA">Temporada</SelectItem>
                  </SelectContent>
                </Select>
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
                    <SelectItem value="ATIVO">Ativo</SelectItem>
                    <SelectItem value="ENCERRADO">Encerrado</SelectItem>
                    <SelectItem value="PENDENTE_RENOVACAO">Pendente Renovacao</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Partes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Partes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="propertyId">Imovel *</Label>
                <Select
                  value={selectedPropertyId}
                  onValueChange={(value) => setValue("propertyId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o imovel" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.propertyId && (
                  <p className="text-xs text-destructive">{errors.propertyId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ownerId">Proprietario *</Label>
                <Select
                  value={selectedOwnerId}
                  onValueChange={(value) => setValue("ownerId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o proprietario" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.ownerId && (
                  <p className="text-xs text-destructive">{errors.ownerId.message}</p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tenantId">Locatario *</Label>
                <Select
                  value={selectedTenantId}
                  onValueChange={(value) => setValue("tenantId", value)}
                >
                  <SelectTrigger className="w-full">
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
                {errors.tenantId && (
                  <p className="text-xs text-destructive">{errors.tenantId.message}</p>
                )}
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
                <Label htmlFor="rentalValue">Valor Aluguel (R$) *</Label>
                <Input
                  id="rentalValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("rentalValue")}
                />
                {errors.rentalValue && (
                  <p className="text-xs text-destructive">{errors.rentalValue.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminFeePercent">Taxa Adm. (%)</Label>
                <Input
                  id="adminFeePercent"
                  type="number"
                  step="0.1"
                  placeholder="10"
                  {...register("adminFeePercent")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentDay">Dia de Pagamento</Label>
                <Input
                  id="paymentDay"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="10"
                  {...register("paymentDay")}
                />
              </div>
            </div>
          </div>

          {/* Periodo */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Periodo
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Data Inicio *</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...register("startDate")}
                />
                {errors.startDate && (
                  <p className="text-xs text-destructive">{errors.startDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">Data Termino *</Label>
                <Input
                  id="endDate"
                  type="date"
                  {...register("endDate")}
                />
                {errors.endDate && (
                  <p className="text-xs text-destructive">{errors.endDate.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Garantia */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Garantia
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guaranteeType">Tipo de Garantia</Label>
                <Select
                  value={selectedGuaranteeType || ""}
                  onValueChange={(value) => setValue("guaranteeType", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIADOR">Fiador</SelectItem>
                    <SelectItem value="CAUCAO">Caucao</SelectItem>
                    <SelectItem value="SEGURO_FIANCA">Seguro Fianca</SelectItem>
                    <SelectItem value="TITULO_CAPITALIZACAO">Titulo de Capitalizacao</SelectItem>
                    <SelectItem value="SEM_GARANTIA">Sem Garantia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="guaranteeValue">Valor da Garantia (R$)</Label>
                <Input
                  id="guaranteeValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("guaranteeValue")}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="guaranteeNotes">Observacoes da Garantia</Label>
                <Input
                  id="guaranteeNotes"
                  placeholder="Detalhes sobre a garantia"
                  {...register("guaranteeNotes")}
                />
              </div>
            </div>
          </div>

          {/* Reajuste */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Reajuste
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adjustmentIndex">Indice de Reajuste</Label>
                <Select
                  value={selectedAdjustmentIndex || ""}
                  onValueChange={(value) => setValue("adjustmentIndex", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IGPM">IGP-M</SelectItem>
                    <SelectItem value="IPCA">IPCA</SelectItem>
                    <SelectItem value="INPC">INPC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustmentMonth">Mes de Reajuste</Label>
                <Input
                  id="adjustmentMonth"
                  type="number"
                  min="1"
                  max="12"
                  placeholder="Ex: 1 (Janeiro)"
                  {...register("adjustmentMonth")}
                />
              </div>
            </div>
          </div>

          {/* Observacoes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observacoes</Label>
            <textarea
              id="notes"
              placeholder="Observacoes adicionais sobre o contrato"
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
  );
}
