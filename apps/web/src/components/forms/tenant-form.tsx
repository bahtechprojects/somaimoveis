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

const tenantSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  cpfCnpj: z.string().min(1, "CPF/CNPJ e obrigatorio"),
  personType: z.string().default("PF"),
  email: z.string().email("Email invalido").or(z.literal("")).optional(),
  phone: z.string().optional(),
  rgNumber: z.string().optional(),
  occupation: z.string().optional(),
  monthlyIncome: z.coerce.number().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
});

type TenantFormData = z.infer<typeof tenantSchema>;

interface TenantFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant?: any;
  onSuccess: () => void;
}

export function TenantForm({ open, onOpenChange, tenant, onSuccess }: TenantFormProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!tenant;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TenantFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(tenantSchema) as any,
    defaultValues: {
      name: "",
      cpfCnpj: "",
      personType: "PF",
      email: "",
      phone: "",
      rgNumber: "",
      occupation: "",
      monthlyIncome: undefined,
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      zipCode: "",
      notes: "",
    },
  });

  const personType = watch("personType");

  useEffect(() => {
    if (open) {
      if (tenant) {
        reset({
          name: tenant.name || "",
          cpfCnpj: tenant.cpfCnpj || "",
          personType: tenant.personType || "PF",
          email: tenant.email || "",
          phone: tenant.phone || "",
          rgNumber: tenant.rgNumber || "",
          occupation: tenant.occupation || "",
          monthlyIncome: tenant.monthlyIncome ?? undefined,
          street: tenant.street || "",
          number: tenant.number || "",
          complement: tenant.complement || "",
          neighborhood: tenant.neighborhood || "",
          city: tenant.city || "",
          state: tenant.state || "",
          zipCode: tenant.zipCode || "",
          notes: tenant.notes || "",
        });
      } else {
        reset({
          name: "",
          cpfCnpj: "",
          personType: "PF",
          email: "",
          phone: "",
          rgNumber: "",
          occupation: "",
          monthlyIncome: undefined,
              street: "",
          number: "",
          complement: "",
          neighborhood: "",
          city: "",
          state: "",
          zipCode: "",
          notes: "",
        });
      }
    }
  }, [open, tenant, reset]);

  async function onSubmit(data: TenantFormData) {
    setLoading(true);
    try {
      const url = isEditing ? `/api/tenants/${tenant.id}` : "/api/tenants";
      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao salvar locatario");
      }

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      alert(error.message || "Erro ao salvar locatario");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Locatario" : "Novo Locatario"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Atualize as informacoes do locatario abaixo."
              : "Preencha as informacoes do novo locatario."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Dados Pessoais
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Nome completo ou razao social"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpfCnpj">CPF/CNPJ *</Label>
                <Input
                  id="cpfCnpj"
                  placeholder="000.000.000-00"
                  {...register("cpfCnpj")}
                />
                {errors.cpfCnpj && (
                  <p className="text-xs text-destructive">{errors.cpfCnpj.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="personType">Tipo de Pessoa</Label>
                <Select
                  value={personType}
                  onValueChange={(value) => setValue("personType", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Fisica</SelectItem>
                    <SelectItem value="PJ">Pessoa Juridica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  {...register("phone")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rgNumber">RG</Label>
                <Input
                  id="rgNumber"
                  placeholder="00.000.000-0"
                  {...register("rgNumber")}
                />
              </div>
            </div>
          </div>

          {/* Profissional */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Profissional
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="occupation">Profissao</Label>
                <Input
                  id="occupation"
                  placeholder="Ex: Engenheiro, Advogado"
                  {...register("occupation")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlyIncome">Renda Mensal (R$)</Label>
                <Input
                  id="monthlyIncome"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  {...register("monthlyIncome")}
                />
              </div>

            </div>
          </div>

          {/* Endereco */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b pb-2">
              Endereco
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="street">Rua</Label>
                <Input
                  id="street"
                  placeholder="Nome da rua"
                  {...register("street")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="number">Numero</Label>
                <Input
                  id="number"
                  placeholder="123"
                  {...register("number")}
                />
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
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input
                  id="neighborhood"
                  placeholder="Nome do bairro"
                  {...register("neighborhood")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  placeholder="Nome da cidade"
                  {...register("city")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Estado</Label>
                <Input
                  id="state"
                  placeholder="UF"
                  {...register("state")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zipCode">CEP</Label>
                <Input
                  id="zipCode"
                  placeholder="00000-000"
                  {...register("zipCode")}
                />
              </div>
            </div>
          </div>

          {/* Observacoes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observacoes</Label>
            <Input
              id="notes"
              placeholder="Observacoes adicionais"
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
