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

const paymentSchema = z.object({
  code: z.string().min(1, "Codigo e obrigatorio"),
  contractId: z.string().min(1, "Contrato e obrigatorio"),
  tenantId: z.string().min(1, "Locatario e obrigatorio"),
  ownerId: z.string().min(1, "Proprietario e obrigatorio"),
  value: z.coerce.number().min(0.01, "Valor e obrigatorio"),
  paidValue: z.coerce.number().optional(),
  fineValue: z.coerce.number().optional(),
  interestValue: z.coerce.number().optional(),
  discountValue: z.coerce.number().optional(),
  intermediationFee: z.coerce.number().optional(),
  dueDate: z.string().min(1, "Data de vencimento e obrigatoria"),
  paidAt: z.string().optional(),
  status: z.string().default("PENDENTE"),
  paymentMethod: z.string().optional(),
  description: z.string().optional(),
  splitOwnerValue: z.coerce.number().optional(),
  splitAdminValue: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: any;
  onSuccess: () => void;
}

interface ContractOption {
  id: string;
  code: string;
  rentalValue: number;
  adminFeePercent: number;
  tenantId: string;
  ownerId: string;
  property: { id: string; title: string };
  tenant: { id: string; name: string };
  owner: { id: string; name: string };
}

interface PersonOption {
  id: string;
  name: string;
}

export function PaymentForm({ open, onOpenChange, payment, onSuccess }: PaymentFormProps) {
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [owners, setOwners] = useState<PersonOption[]>([]);
  const [tenants, setTenants] = useState<PersonOption[]>([]);
  const isEditing = !!payment;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PaymentFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      code: "",
      contractId: "",
      tenantId: "",
      ownerId: "",
      value: undefined,
      paidValue: undefined,
      fineValue: undefined,
      interestValue: undefined,
      discountValue: undefined,
      intermediationFee: undefined,
      dueDate: "",
      paidAt: "",
      status: "PENDENTE",
      paymentMethod: "",
      description: "",
      splitOwnerValue: undefined,
      splitAdminValue: undefined,
      notes: "",
    },
  });

  const selectedContractId = watch("contractId");
  const selectedTenantId = watch("tenantId");
  const selectedOwnerId = watch("ownerId");
  const selectedStatus = watch("status");
  const selectedPaymentMethod = watch("paymentMethod");
  const watchValue = watch("value");

  // Fetch related data on dialog open
  useEffect(() => {
    async function fetchData() {
      try {
        const [contractsRes, ownersRes, tenantsRes] = await Promise.all([
          fetch("/api/contracts"),
          fetch("/api/owners"),
          fetch("/api/tenants"),
        ]);

        if (contractsRes.ok) {
          const data = await contractsRes.json();
          setContracts(data);
        }
        if (ownersRes.ok) {
          const data = await ownersRes.json();
          setOwners(data.map((o: any) => ({ id: o.id, name: o.name })));
        }
        if (tenantsRes.ok) {
          const data = await tenantsRes.json();
          setTenants(data.map((t: any) => ({ id: t.id, name: t.name })));
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    }

    if (open) {
      fetchData();
    }
  }, [open]);

  // Auto-generate code for new payments
  useEffect(() => {
    async function generateCode() {
      try {
        const response = await fetch("/api/payments");
        if (response.ok) {
          const payments = await response.json();
          const nextNumber = payments.length + 1;
          const code = `PAG-${String(nextNumber).padStart(3, "0")}`;
          setValue("code", code);
        }
      } catch (error) {
        setValue("code", "PAG-001");
      }
    }

    if (open && !isEditing) {
      generateCode();
    }
  }, [open, isEditing, setValue]);

  // Auto-fill tenant, owner, and value when a contract is selected
  useEffect(() => {
    if (!selectedContractId || isEditing) return;

    const contract = contracts.find((c) => c.id === selectedContractId);
    if (contract) {
      setValue("tenantId", contract.tenantId);
      setValue("ownerId", contract.ownerId);
      setValue("value", contract.rentalValue);

      // Calculate split values
      const adminPercent = contract.adminFeePercent || 10;
      const adminValue = contract.rentalValue * (adminPercent / 100);
      const ownerValue = contract.rentalValue - adminValue;
      setValue("splitAdminValue", Math.round(adminValue * 100) / 100);
      setValue("splitOwnerValue", Math.round(ownerValue * 100) / 100);
    }
  }, [selectedContractId, contracts, isEditing, setValue]);

  // Recalculate split when value changes (only if contract selected)
  useEffect(() => {
    if (!selectedContractId || !watchValue) return;

    const contract = contracts.find((c) => c.id === selectedContractId);
    if (contract) {
      const adminPercent = contract.adminFeePercent || 10;
      const adminValue = watchValue * (adminPercent / 100);
      const ownerValue = watchValue - adminValue;
      setValue("splitAdminValue", Math.round(adminValue * 100) / 100);
      setValue("splitOwnerValue", Math.round(ownerValue * 100) / 100);
    }
  }, [watchValue, selectedContractId, contracts, setValue]);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (payment) {
        reset({
          code: payment.code || "",
          contractId: payment.contractId || "",
          tenantId: payment.tenantId || "",
          ownerId: payment.ownerId || "",
          value: payment.value ?? undefined,
          paidValue: payment.paidValue ?? undefined,
          fineValue: payment.fineValue ?? undefined,
          interestValue: payment.interestValue ?? undefined,
          discountValue: payment.discountValue ?? undefined,
          intermediationFee: payment.intermediationFee ?? undefined,
          dueDate: payment.dueDate
            ? new Date(payment.dueDate).toISOString().split("T")[0]
            : "",
          paidAt: payment.paidAt
            ? new Date(payment.paidAt).toISOString().split("T")[0]
            : "",
          status: payment.status || "PENDENTE",
          paymentMethod: payment.paymentMethod || "",
          description: payment.description || "",
          splitOwnerValue: payment.splitOwnerValue ?? undefined,
          splitAdminValue: payment.splitAdminValue ?? undefined,
          notes: payment.notes || "",
        });
      } else {
        reset({
          code: "",
          contractId: "",
          tenantId: "",
          ownerId: "",
          value: undefined,
          paidValue: undefined,
          fineValue: undefined,
          interestValue: undefined,
          discountValue: undefined,
          intermediationFee: undefined,
          dueDate: "",
          paidAt: "",
          status: "PENDENTE",
          paymentMethod: "",
          description: "",
          splitOwnerValue: undefined,
          splitAdminValue: undefined,
          notes: "",
        });
      }
    }
  }, [open, payment, reset]);

  async function onSubmit(data: PaymentFormData) {
    setLoading(true);
    try {
      const url = isEditing ? `/api/payments/${payment.id}` : "/api/payments";
      const method = isEditing ? "PUT" : "POST";

      const payload = {
        ...data,
        dueDate: new Date(data.dueDate).toISOString(),
        paidAt: data.paidAt ? new Date(data.paidAt).toISOString() : null,
        paidValue: data.paidValue || null,
        fineValue: data.fineValue || null,
        interestValue: data.interestValue || null,
        discountValue: data.discountValue || null,
        intermediationFee: data.intermediationFee || null,
        paymentMethod: data.paymentMethod || null,
        description: data.description || null,
        splitOwnerValue: data.splitOwnerValue || null,
        splitAdminValue: data.splitAdminValue || null,
        notes: data.notes || null,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao salvar pagamento");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      alert(error.message || "Erro ao salvar pagamento");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[90vh]" preventOutsideClose>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Cobranca" : "Nova Cobranca"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes da cobranca abaixo."
              : "Preencha as informacoes da nova cobranca."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Vinculo */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Vinculo
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contractId">Contrato *</Label>
                <Select
                  value={selectedContractId}
                  onValueChange={(value) => setValue("contractId", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.code} - {contract.property?.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.contractId && (
                  <p className="text-xs text-destructive">{errors.contractId.message}</p>
                )}
              </div>

              <div className="space-y-2">
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
            </div>
          </div>

          {/* Valores */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Valores
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="value">Valor (R$) *</Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("value")}
                />
                {errors.value && (
                  <p className="text-xs text-destructive">{errors.value.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="paidValue">Valor Pago (R$)</Label>
                <Input
                  id="paidValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("paidValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fineValue">Multa (R$)</Label>
                <Input
                  id="fineValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("fineValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interestValue">Juros (R$)</Label>
                <Input
                  id="interestValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("interestValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountValue">Desconto (R$)</Label>
                <Input
                  id="discountValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("discountValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="intermediationFee">Valor Intermediacao (R$)</Label>
                <Input
                  id="intermediationFee"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("intermediationFee")}
                />
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
                <Label htmlFor="dueDate">Data de Vencimento *</Label>
                <Input
                  id="dueDate"
                  type="date"
                  {...register("dueDate")}
                />
                {errors.dueDate && (
                  <p className="text-xs text-destructive">{errors.dueDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="paidAt">Data de Pagamento</Label>
                <Input
                  id="paidAt"
                  type="date"
                  {...register("paidAt")}
                />
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
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="PAGO">Pago</SelectItem>
                    <SelectItem value="ATRASADO">Atrasado</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                    <SelectItem value="PARCIAL">Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Forma de Pagamento</Label>
                <Select
                  value={selectedPaymentMethod || ""}
                  onValueChange={(value) => setValue("paymentMethod", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="CARTAO">Cartao</SelectItem>
                    <SelectItem value="TRANSFERENCIA">Transferencia</SelectItem>
                    <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Split */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Split (Repasse)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="splitOwnerValue">Repasse Proprietario (R$)</Label>
                <Input
                  id="splitOwnerValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("splitOwnerValue")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="splitAdminValue">Taxa Administracao (R$)</Label>
                <Input
                  id="splitAdminValue"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("splitAdminValue")}
                />
              </div>
            </div>
          </div>

          {/* Observacoes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Observacoes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Descricao</Label>
                <Input
                  id="description"
                  placeholder="Descricao do pagamento"
                  {...register("description")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Input
                  id="notes"
                  placeholder="Observacoes adicionais"
                  {...register("notes")}
                />
              </div>
            </div>
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
