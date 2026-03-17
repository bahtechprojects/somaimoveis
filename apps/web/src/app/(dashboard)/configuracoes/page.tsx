"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/layout/header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Building2,
  Bell,
  Settings,
  Shield,
  Database,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  Save,
  Loader2,
  Play,
  Check,
  X,
  Clock,
  AlertTriangle,
  Scale,
  Calendar,
  FileWarning,
  MessageCircle,
  ChevronRight,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EscalationStep {
  id: string;
  daysAfterDue: number;
  actionType: string;
  description: string;
}

interface BillingRules {
  reminderDaysBefore: number[];
  gracePeriodDays: number;
  lateFeePercent: number;
  dailyInterestPercent: number;
  escalationSteps: EscalationStep[];
  autoMarkOverdue: boolean;
  notificationChannels: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  };
}

interface ProcessResult {
  processed: number;
  markedOverdue: number;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const defaultBillingRules: BillingRules = {
  reminderDaysBefore: [5, 3, 1],
  gracePeriodDays: 3,
  lateFeePercent: 2,
  dailyInterestPercent: 0.033,
  escalationSteps: [
    {
      id: "1",
      daysAfterDue: 1,
      actionType: "Email",
      description: "Notificacao automatica de atraso por e-mail",
    },
    {
      id: "2",
      daysAfterDue: 5,
      actionType: "WhatsApp",
      description: "Lembrete via WhatsApp",
    },
    {
      id: "3",
      daysAfterDue: 15,
      actionType: "Telefone",
      description: "Contato telefonico com locatario",
    },
    {
      id: "4",
      daysAfterDue: 30,
      actionType: "Notificacao Extrajudicial",
      description: "Envio de notificacao extrajudicial",
    },
    {
      id: "5",
      daysAfterDue: 60,
      actionType: "Acao Juridica",
      description: "Inicio de acao juridica",
    },
  ],
  autoMarkOverdue: true,
  notificationChannels: {
    email: true,
    sms: false,
    whatsapp: true,
  },
};

const actionTypeOptions = [
  "Email",
  "SMS",
  "WhatsApp",
  "Telefone",
  "Notificacao Extrajudicial",
  "Acao Juridica",
];

const actionTypeIcons: Record<string, typeof Mail> = {
  Email: Mail,
  SMS: MessageSquare,
  WhatsApp: MessageCircle,
  Telefone: Phone,
  "Notificacao Extrajudicial": FileWarning,
  "Acao Juridica": Scale,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ── Timeline Preview Component ─────────────────────────────────────────────────

function TimelinePreview({ rules }: { rules: BillingRules }) {
  // Build timeline events
  const events: { day: number; label: string; type: "reminder" | "due" | "grace" | "escalation" }[] = [];

  // Reminders before due date
  const sortedReminders = [...rules.reminderDaysBefore].sort((a, b) => b - a);
  sortedReminders.forEach((d) => {
    events.push({ day: -d, label: `Lembrete D-${d}`, type: "reminder" });
  });

  // Due date
  events.push({ day: 0, label: "Vencimento", type: "due" });

  // Grace period end
  if (rules.gracePeriodDays > 0) {
    events.push({
      day: rules.gracePeriodDays,
      label: `Carencia D+${rules.gracePeriodDays}`,
      type: "grace",
    });
  }

  // Escalation steps
  const sortedSteps = [...rules.escalationSteps].sort(
    (a, b) => a.daysAfterDue - b.daysAfterDue
  );
  sortedSteps.forEach((step) => {
    events.push({
      day: step.daysAfterDue,
      label: `${step.actionType} D+${step.daysAfterDue}`,
      type: "escalation",
    });
  });

  // Sort all by day
  events.sort((a, b) => a.day - b.day);

  const minDay = events[0]?.day ?? -5;
  const maxDay = events[events.length - 1]?.day ?? 60;
  const range = maxDay - minDay || 1;

  const typeColors = {
    reminder: "bg-blue-500",
    due: "bg-primary",
    grace: "bg-amber-500",
    escalation: "bg-red-500",
  };

  const typeBorderColors = {
    reminder: "border-blue-500",
    due: "border-primary",
    grace: "border-amber-500",
    escalation: "border-red-500",
  };

  return (
    <Card className="border-0 shadow-sm bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Pre-visualizacao da Regua de Cobranca
        </CardTitle>
        <CardDescription className="text-xs">
          Linha do tempo com base nas configuracoes atuais
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span className="text-muted-foreground">Lembrete</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="text-muted-foreground">Vencimento</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Carencia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Cobranca</span>
          </div>
        </div>

        {/* Timeline bar */}
        <div className="relative">
          <div className="h-1 bg-border rounded-full w-full" />
          {events.map((event, idx) => {
            const leftPercent = ((event.day - minDay) / range) * 100;
            return (
              <div
                key={`${event.day}-${idx}`}
                className="absolute -top-1.5"
                style={{ left: `${Math.min(Math.max(leftPercent, 2), 98)}%` }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`h-4 w-4 rounded-full border-2 bg-background cursor-pointer transition-transform hover:scale-125 ${typeBorderColors[event.type]}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    <span className="text-xs">{event.label}</span>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>

        {/* Labels below */}
        <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
          <span>D{minDay}</span>
          <span className="font-medium text-foreground">Vencimento</span>
          <span>D+{maxDay}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page Component ────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const { data: session } = useSession();

  // Billing rules state
  const [billingRules, setBillingRules] = useState<BillingRules>(defaultBillingRules);
  const [loadingRules, setLoadingRules] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [newReminderDay, setNewReminderDay] = useState("");

  // Fetch billing rules on mount
  const fetchBillingRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const response = await fetch("/api/billing/rules");
      if (response.ok) {
        const data = await response.json();
        // Map API format to internal format
        setBillingRules({
          reminderDaysBefore: data.reminderDaysBefore ?? defaultBillingRules.reminderDaysBefore,
          gracePeriodDays: data.gracePeriodDays ?? defaultBillingRules.gracePeriodDays,
          lateFeePercent: data.lateFeePercent ?? defaultBillingRules.lateFeePercent,
          dailyInterestPercent: data.dailyInterestPercent ?? defaultBillingRules.dailyInterestPercent,
          autoMarkOverdue: data.autoMarkOverdue ?? defaultBillingRules.autoMarkOverdue,
          escalationSteps: (data.escalationSteps || []).map((s: any, i: number) => ({
            id: s.id || String(i + 1),
            daysAfterDue: s.daysAfterDue,
            actionType: s.actionType || s.action || "Email",
            description: s.description,
          })),
          notificationChannels: {
            email: data.notificationChannels?.email ?? data.notifyByEmail ?? true,
            sms: data.notificationChannels?.sms ?? data.notifyBySms ?? false,
            whatsapp: data.notificationChannels?.whatsapp ?? data.notifyByWhatsapp ?? true,
          },
        });
      }
    } catch (error) {
      console.error("Erro ao buscar regras de cobranca:", error);
      // Keep defaults on error
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingRules();
  }, [fetchBillingRules]);

  // Save billing rules
  async function handleSaveRules() {
    setSavingRules(true);
    setSaveSuccess(false);
    try {
      const response = await fetch("/api/billing/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...billingRules,
          notifyByEmail: billingRules.notificationChannels.email,
          notifyBySms: billingRules.notificationChannels.sms,
          notifyByWhatsapp: billingRules.notificationChannels.whatsapp,
          escalationSteps: billingRules.escalationSteps.map((s) => ({
            daysAfterDue: s.daysAfterDue,
            action: s.actionType,
            description: s.description,
          })),
        }),
      });
      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const error = await response.json();
        alert(error.error || "Erro ao salvar regras");
      }
    } catch (error) {
      alert("Erro ao salvar regras de cobranca");
    } finally {
      setSavingRules(false);
    }
  }

  // Process billing
  async function handleProcessBilling() {
    setProcessing(true);
    setProcessResult(null);
    try {
      const response = await fetch("/api/billing/process", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        setProcessResult(data);
      } else {
        const error = await response.json();
        alert(error.error || "Erro ao processar cobrancas");
      }
    } catch (error) {
      alert("Erro ao processar cobrancas");
    } finally {
      setProcessing(false);
    }
  }

  // Reminder chips management
  function addReminderDay() {
    const day = parseInt(newReminderDay);
    if (isNaN(day) || day <= 0) return;
    if (billingRules.reminderDaysBefore.includes(day)) return;
    setBillingRules((prev) => ({
      ...prev,
      reminderDaysBefore: [...prev.reminderDaysBefore, day].sort(
        (a, b) => b - a
      ),
    }));
    setNewReminderDay("");
  }

  function removeReminderDay(day: number) {
    setBillingRules((prev) => ({
      ...prev,
      reminderDaysBefore: prev.reminderDaysBefore.filter((d) => d !== day),
    }));
  }

  // Escalation steps management
  function addEscalationStep() {
    const newStep: EscalationStep = {
      id: generateId(),
      daysAfterDue: 0,
      actionType: "Email",
      description: "",
    };
    setBillingRules((prev) => ({
      ...prev,
      escalationSteps: [...prev.escalationSteps, newStep],
    }));
  }

  function removeEscalationStep(id: string) {
    setBillingRules((prev) => ({
      ...prev,
      escalationSteps: prev.escalationSteps.filter((s) => s.id !== id),
    }));
  }

  function updateEscalationStep(
    id: string,
    field: keyof EscalationStep,
    value: string | number
  ) {
    setBillingRules((prev) => ({
      ...prev,
      escalationSteps: prev.escalationSteps.map((s) =>
        s.id === id ? { ...s, [field]: value } : s
      ),
    }));
  }

  // Session info
  const userName = session?.user?.name || "Usuario";
  const userEmail = session?.user?.email || "admin@somma.com.br";
  const userInitials = getInitials(userName);

  return (
    <div className="flex flex-col">
      <Header title="Configuracoes" subtitle="Gerencie as configuracoes do sistema" />

      <div className="p-4 sm:p-6">
        <Tabs defaultValue="perfil" className="space-y-6">
          <TabsList className="h-10">
            <TabsTrigger value="perfil" className="gap-1.5 text-sm px-4">
              <User className="h-4 w-4" />
              Perfil
            </TabsTrigger>
            <TabsTrigger value="empresa" className="gap-1.5 text-sm px-4">
              <Building2 className="h-4 w-4" />
              Empresa
            </TabsTrigger>
            <TabsTrigger value="cobranca" className="gap-1.5 text-sm px-4">
              <Scale className="h-4 w-4" />
              Regua de Cobranca
            </TabsTrigger>
            <TabsTrigger value="notificacoes" className="gap-1.5 text-sm px-4">
              <Bell className="h-4 w-4" />
              Notificacoes
            </TabsTrigger>
            <TabsTrigger value="sistema" className="gap-1.5 text-sm px-4">
              <Settings className="h-4 w-4" />
              Sistema
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Perfil ──────────────────────────────────────────────── */}
          <TabsContent value="perfil">
            <div className="grid gap-6 max-w-2xl">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Informacoes do Perfil</CardTitle>
                  <CardDescription>
                    Seus dados pessoais vinculados a conta
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-lg">{userName}</p>
                      <p className="text-sm text-muted-foreground">{userEmail}</p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        Administrador
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  {/* Fields */}
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="profile-name" className="text-sm font-medium">
                        Nome
                      </Label>
                      <Input
                        id="profile-name"
                        value={userName}
                        readOnly
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="profile-email" className="text-sm font-medium">
                        Email
                      </Label>
                      <Input
                        id="profile-email"
                        value={userEmail}
                        readOnly
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="profile-phone" className="text-sm font-medium">
                        Telefone
                      </Label>
                      <Input
                        id="profile-phone"
                        value="(11) 99999-0000"
                        readOnly
                        className="bg-muted/50"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Change password */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Alterar Senha</p>
                      <p className="text-xs text-muted-foreground">
                        Atualize sua senha de acesso ao sistema
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" disabled>
                            <Shield className="h-4 w-4 mr-2" />
                            Alterar Senha
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>Em breve</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Empresa ─────────────────────────────────────────────── */}
          <TabsContent value="empresa">
            <div className="grid gap-6 max-w-2xl">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Dados da Empresa</CardTitle>
                  <CardDescription>
                    Informacoes da sua empresa de gestao imobiliaria
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Logo placeholder */}
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                      <Building2 className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Somma Imoveis</p>
                      <p className="text-xs text-muted-foreground">
                        Logo da empresa
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs text-primary"
                        disabled
                      >
                        Alterar logo (em breve)
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="company-name" className="text-sm font-medium">
                        Nome da Empresa
                      </Label>
                      <Input
                        id="company-name"
                        value="Somma Imoveis"
                        readOnly
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="company-cnpj" className="text-sm font-medium">
                        CNPJ
                      </Label>
                      <Input
                        id="company-cnpj"
                        value=""
                        placeholder="00.000.000/0001-00"
                        readOnly
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="company-email" className="text-sm font-medium">
                          Email
                        </Label>
                        <Input
                          id="company-email"
                          value=""
                          placeholder="contato@somma.com.br"
                          readOnly
                          className="bg-muted/50"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="company-phone" className="text-sm font-medium">
                          Telefone
                        </Label>
                        <Input
                          id="company-phone"
                          value=""
                          placeholder="(11) 3000-0000"
                          readOnly
                          className="bg-muted/50"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="company-address" className="text-sm font-medium">
                        Endereco
                      </Label>
                      <Input
                        id="company-address"
                        value=""
                        placeholder="Rua Example, 123 - Sao Paulo/SP"
                        readOnly
                        className="bg-muted/50"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-end">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button disabled>
                            <Save className="h-4 w-4 mr-2" />
                            Salvar
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>Em breve</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Regua de Cobranca ───────────────────────────────────── */}
          <TabsContent value="cobranca">
            <div className="space-y-6">
              {/* Timeline preview */}
              {!loadingRules && <TimelinePreview rules={billingRules} />}

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Left column */}
                <div className="space-y-6">
                  {/* Lembretes antes do vencimento */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Bell className="h-4 w-4 text-blue-500" />
                        Lembretes antes do Vencimento
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Dias antes do vencimento para enviar lembretes ao locatario
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {billingRules.reminderDaysBefore
                          .sort((a, b) => b - a)
                          .map((day) => (
                            <Badge
                              key={day}
                              variant="secondary"
                              className="gap-1 pl-2.5 pr-1 py-1 text-xs"
                            >
                              D-{day}
                              <button
                                type="button"
                                onClick={() => removeReminderDay(day)}
                                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        {billingRules.reminderDaysBefore.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Nenhum lembrete configurado
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          placeholder="Dias antes..."
                          className="h-8 w-32 text-xs"
                          value={newReminderDay}
                          onChange={(e) => setNewReminderDay(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addReminderDay();
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={addReminderDay}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Multa, Juros, Carencia */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Multa e Juros
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Parametros financeiros para pagamentos atrasados
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-2">
                        <Label
                          htmlFor="grace-period"
                          className="text-xs font-medium"
                        >
                          Periodo de Carencia (dias apos vencimento)
                        </Label>
                        <Input
                          id="grace-period"
                          type="number"
                          min={0}
                          className="h-8 w-32 text-xs"
                          value={billingRules.gracePeriodDays}
                          onChange={(e) =>
                            setBillingRules((prev) => ({
                              ...prev,
                              gracePeriodDays:
                                parseInt(e.target.value) || 0,
                            }))
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Dias de tolerancia antes de aplicar multa e juros
                        </p>
                      </div>

                      <Separator />

                      <div className="grid gap-2">
                        <Label
                          htmlFor="late-fee"
                          className="text-xs font-medium"
                        >
                          Multa por Atraso (%)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="late-fee"
                            type="number"
                            min={0}
                            step={0.1}
                            className="h-8 w-32 text-xs"
                            value={billingRules.lateFeePercent}
                            onChange={(e) =>
                              setBillingRules((prev) => ({
                                ...prev,
                                lateFeePercent:
                                  parseFloat(e.target.value) || 0,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Percentual sobre o valor do aluguel (maximo legal: 2%)
                        </p>
                      </div>

                      <Separator />

                      <div className="grid gap-2">
                        <Label
                          htmlFor="daily-interest"
                          className="text-xs font-medium"
                        >
                          Juros Diarios (%)
                        </Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="daily-interest"
                            type="number"
                            min={0}
                            step={0.001}
                            className="h-8 w-32 text-xs"
                            value={billingRules.dailyInterestPercent}
                            onChange={(e) =>
                              setBillingRules((prev) => ({
                                ...prev,
                                dailyInterestPercent:
                                  parseFloat(e.target.value) || 0,
                              }))
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            % ao dia
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Juros mora diario (equivalente a ~1% ao mes = 0,033% ao dia)
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Auto-mark + Notification channels */}
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Opcoes Gerais
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Auto-mark overdue */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Marcacao Automatica
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Marcar pagamentos como atrasados automaticamente
                          </p>
                        </div>
                        <Switch
                          checked={billingRules.autoMarkOverdue}
                          onCheckedChange={(checked) =>
                            setBillingRules((prev) => ({
                              ...prev,
                              autoMarkOverdue: checked === true,
                            }))
                          }
                        />
                      </div>

                      <Separator />

                      {/* Notification channels */}
                      <div>
                        <p className="text-sm font-medium mb-3">
                          Canais de Notificacao
                        </p>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="channel-email"
                              checked={billingRules.notificationChannels.email}
                              onCheckedChange={(checked) =>
                                setBillingRules((prev) => ({
                                  ...prev,
                                  notificationChannels: {
                                    ...prev.notificationChannels,
                                    email: checked === true,
                                  },
                                }))
                              }
                            />
                            <Label
                              htmlFor="channel-email"
                              className="text-sm flex items-center gap-2 cursor-pointer"
                            >
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              Email
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="channel-sms"
                              checked={billingRules.notificationChannels.sms}
                              onCheckedChange={(checked) =>
                                setBillingRules((prev) => ({
                                  ...prev,
                                  notificationChannels: {
                                    ...prev.notificationChannels,
                                    sms: checked === true,
                                  },
                                }))
                              }
                            />
                            <Label
                              htmlFor="channel-sms"
                              className="text-sm flex items-center gap-2 cursor-pointer"
                            >
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                              SMS
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="channel-whatsapp"
                              checked={
                                billingRules.notificationChannels.whatsapp
                              }
                              onCheckedChange={(checked) =>
                                setBillingRules((prev) => ({
                                  ...prev,
                                  notificationChannels: {
                                    ...prev.notificationChannels,
                                    whatsapp: checked === true,
                                  },
                                }))
                              }
                            />
                            <Label
                              htmlFor="channel-whatsapp"
                              className="text-sm flex items-center gap-2 cursor-pointer"
                            >
                              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              WhatsApp
                            </Label>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right column - Escalation steps */}
                <div className="space-y-6">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <ChevronRight className="h-4 w-4 text-red-500" />
                            Etapas de Cobranca
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            Sequencia de acoes apos o vencimento
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 h-8 text-xs"
                          onClick={addEscalationStep}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Nova Etapa
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {billingRules.escalationSteps.length === 0 ? (
                        <div className="text-center py-8">
                          <Clock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Nenhuma etapa configurada
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Clique em &quot;Nova Etapa&quot; para adicionar
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {billingRules.escalationSteps
                            .sort((a, b) => a.daysAfterDue - b.daysAfterDue)
                            .map((step, index) => {
                              const ActionIcon =
                                actionTypeIcons[step.actionType] || Mail;
                              return (
                                <div
                                  key={step.id}
                                  className="relative rounded-lg border bg-card p-4 space-y-3"
                                >
                                  {/* Step number badge */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                                        {index + 1}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <ActionIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-medium">
                                          {step.actionType}
                                        </span>
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() =>
                                        removeEscalationStep(step.id)
                                      }
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="grid gap-1.5">
                                      <Label className="text-[11px] text-muted-foreground">
                                        Dias apos vencimento
                                      </Label>
                                      <Input
                                        type="number"
                                        min={0}
                                        className="h-8 text-xs"
                                        value={step.daysAfterDue}
                                        onChange={(e) =>
                                          updateEscalationStep(
                                            step.id,
                                            "daysAfterDue",
                                            parseInt(e.target.value) || 0
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="grid gap-1.5">
                                      <Label className="text-[11px] text-muted-foreground">
                                        Tipo de Acao
                                      </Label>
                                      <Select
                                        value={step.actionType}
                                        onValueChange={(value) =>
                                          updateEscalationStep(
                                            step.id,
                                            "actionType",
                                            value
                                          )
                                        }
                                      >
                                        <SelectTrigger className="h-8 text-xs w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {actionTypeOptions.map((opt) => (
                                            <SelectItem
                                              key={opt}
                                              value={opt}
                                              className="text-xs"
                                            >
                                              {opt}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="grid gap-1.5">
                                    <Label className="text-[11px] text-muted-foreground">
                                      Descricao
                                    </Label>
                                    <Input
                                      className="h-8 text-xs"
                                      placeholder="Descreva a acao..."
                                      value={step.description}
                                      onChange={(e) =>
                                        updateEscalationStep(
                                          step.id,
                                          "description",
                                          e.target.value
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Actions bar */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={handleProcessBilling}
                        disabled={processing}
                      >
                        {processing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        {processing
                          ? "Processando..."
                          : "Processar Cobrancas Agora"}
                      </Button>
                      {processResult && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-500" />
                          <span className="text-muted-foreground">
                            {processResult.processed} pagamento(s) processado(s),{" "}
                            {processResult.markedOverdue} marcado(s) como atrasado(s)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {saveSuccess && (
                        <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                          <Check className="h-4 w-4" />
                          Salvo com sucesso
                        </div>
                      )}
                      <Button
                        onClick={handleSaveRules}
                        disabled={savingRules}
                        className="gap-2"
                      >
                        {savingRules ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {savingRules ? "Salvando..." : "Salvar Configuracoes"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Notificacoes ─────────────────────────────────────────── */}
          <TabsContent value="notificacoes">
            <div className="grid gap-6 max-w-2xl">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    Preferencias de Notificacao
                  </CardTitle>
                  <CardDescription>
                    Controle quais notificacoes voce deseja receber
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {/* Email de novos contratos */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                        <Mail className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Email de novos contratos
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Receba um email quando um novo contrato for criado
                        </p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />

                  {/* Email de pagamentos recebidos */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Email de pagamentos recebidos
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Notificacao quando um pagamento for confirmado
                        </p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />

                  {/* Alerta de pagamentos atrasados */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Alerta de pagamentos atrasados
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Notificacao diaria de cobrancas em atraso
                        </p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />

                  {/* Resumo financeiro semanal */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100">
                        <Calendar className="h-4 w-4 text-violet-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Resumo financeiro semanal
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Relatorio semanal com resumo de receitas e pendencias
                        </p>
                      </div>
                    </div>
                    <Switch />
                  </div>
                  <Separator />

                  {/* Alerta de contratos vencendo */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Alerta de contratos vencendo
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Aviso quando um contrato estiver proximo do vencimento
                        </p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Sistema ──────────────────────────────────────────────── */}
          <TabsContent value="sistema">
            <div className="grid gap-6 max-w-2xl">
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    Informacoes do Sistema
                  </CardTitle>
                  <CardDescription>
                    Dados tecnicos e opcoes de manutencao
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4">
                    {/* Version */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Versao</p>
                          <p className="text-xs text-muted-foreground">
                            Versao atual do sistema
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        1.0.0
                      </Badge>
                    </div>

                    <Separator />

                    {/* Database */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Database className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Banco de Dados</p>
                          <p className="text-xs text-muted-foreground">
                            Tipo de banco configurado
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                      >
                        SQLite (Desenvolvimento)
                      </Badge>
                    </div>

                    <Separator />

                    {/* Last backup */}
                    <div className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Ultimo Backup</p>
                          <p className="text-xs text-muted-foreground">
                            Data do ultimo backup do banco de dados
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        &mdash;
                      </span>
                    </div>
                  </div>

                  <Separator />

                  {/* Data actions */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Dados</p>
                    <div className="flex gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button variant="outline" size="sm" disabled>
                              <Database className="h-4 w-4 mr-2" />
                              Exportar Dados
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>Em breve</span>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button variant="outline" size="sm" disabled>
                              <Database className="h-4 w-4 mr-2" />
                              Importar Dados
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span>Em breve</span>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Funcionalidade de exportacao e importacao de dados estara
                      disponivel em breve.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
