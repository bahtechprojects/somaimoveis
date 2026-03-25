"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  MessageSquare,
  MessageCircle,
  Phone,
  FileWarning,
  Scale,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingTimelineProps {
  dueDate: string;
  status: string; // PENDENTE, PAGO, ATRASADO, CANCELADO, PARCIAL
  paidAt?: string | null;
  value: number;
  fineValue?: number | null;
  interestValue?: number | null;
}

type StepType =
  | "email_reminder"
  | "sms_reminder"
  | "whatsapp_reminder"
  | "phone_contact"
  | "formal_notice"
  | "legal_action"
  | "due_date"
  | "grace_period"
  | "payment_received";

interface BillingRule {
  id: string;
  type: StepType;
  dayOffset: number; // negative = before due date, positive = after
  label: string;
  description: string;
}

interface TimelineStep {
  id: string;
  type: StepType;
  date: Date;
  label: string;
  description: string;
  state: "completed" | "current" | "upcoming" | "skipped" | "canceled";
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STEP_ICONS: Record<StepType, React.ComponentType<{ className?: string }>> = {
  email_reminder: Mail,
  sms_reminder: MessageSquare,
  whatsapp_reminder: MessageCircle,
  phone_contact: Phone,
  formal_notice: FileWarning,
  legal_action: Scale,
  due_date: Calendar,
  grace_period: Clock,
  payment_received: CheckCircle2,
};

const DEFAULT_RULES: BillingRule[] = [
  {
    id: "email-5",
    type: "email_reminder",
    dayOffset: -5,
    label: "Lembrete por e-mail",
    description: "E-mail enviado 5 dias antes do vencimento",
  },
  {
    id: "whatsapp-3",
    type: "whatsapp_reminder",
    dayOffset: -3,
    label: "Lembrete por WhatsApp",
    description: "Mensagem enviada 3 dias antes do vencimento",
  },
  {
    id: "sms-1",
    type: "sms_reminder",
    dayOffset: -1,
    label: "Lembrete por SMS",
    description: "SMS enviado 1 dia antes do vencimento",
  },
  {
    id: "due",
    type: "due_date",
    dayOffset: 0,
    label: "Vencimento",
    description: "Data de vencimento do pagamento",
  },
  {
    id: "grace",
    type: "grace_period",
    dayOffset: 3,
    label: "Fim da carencia",
    description: "Fim do periodo de carencia (3 dias)",
  },
  {
    id: "email-post-5",
    type: "email_reminder",
    dayOffset: 5,
    label: "Cobranca por e-mail",
    description: "E-mail de cobranca enviado 5 dias após vencimento",
  },
  {
    id: "phone-7",
    type: "phone_contact",
    dayOffset: 7,
    label: "Contato telefonico",
    description: "Ligacao de cobranca 7 dias após vencimento",
  },
  {
    id: "whatsapp-post-10",
    type: "whatsapp_reminder",
    dayOffset: 10,
    label: "Cobranca por WhatsApp",
    description: "Mensagem de cobranca 10 dias após vencimento",
  },
  {
    id: "formal-15",
    type: "formal_notice",
    dayOffset: 15,
    label: "Notificação formal",
    description: "Notificação formal enviada 15 dias após vencimento",
  },
  {
    id: "legal-30",
    type: "legal_action",
    dayOffset: 30,
    label: "Acao judicial",
    description: "Inicio de procedimento judicial 30 dias após vencimento",
  },
];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

const formatDate = (date: Date): string =>
  date.toLocaleDateString("pt-BR");

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value
  );

const STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }
> = {
  PAGO: {
    label: "Pago",
    variant: "default",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  PENDENTE: {
    label: "Pendente",
    variant: "outline",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  ATRASADO: {
    label: "Atrasado",
    variant: "destructive",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  CANCELADO: {
    label: "Cancelado",
    variant: "secondary",
    className: "bg-gray-100 text-gray-500 border-gray-200",
  },
  PARCIAL: {
    label: "Parcial",
    variant: "outline",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BillingTimeline({
  dueDate,
  status,
  paidAt,
  value,
  fineValue,
  interestValue,
}: BillingTimelineProps) {
  const [rules, setRules] = useState<BillingRule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch billing rules from API and transform to BillingRule[] format
  useEffect(() => {
    let cancelled = false;

    async function fetchRules() {
      try {
        const res = await fetch("/api/billing/rules");
        if (!res.ok) throw new Error("Falha ao buscar regras");
        const data = await res.json();

        // Transform API response into BillingRule[] format
        const transformed: BillingRule[] = [];

        // 1. Reminder rules (before due date - negative offset)
        const actionMap: Record<string, StepType> = {
          email_reminder: "email_reminder",
          sms_reminder: "sms_reminder",
          whatsapp_reminder: "whatsapp_reminder",
          phone_contact: "phone_contact",
          formal_notice: "formal_notice",
          legal_action: "legal_action",
        };

        if (Array.isArray(data.reminderDaysBefore)) {
          data.reminderDaysBefore.forEach((days: number, i: number) => {
            const types: StepType[] = ["email_reminder", "whatsapp_reminder", "sms_reminder"];
            transformed.push({
              id: `reminder-${days}`,
              type: types[i] || "email_reminder",
              dayOffset: -days,
              label: `Lembrete ${days} dias antes`,
              description: `Lembrete enviado ${days} dia(s) antes do vencimento`,
            });
          });
        }

        // 2. Due date (offset 0)
        transformed.push({
          id: "due",
          type: "due_date",
          dayOffset: 0,
          label: "Vencimento",
          description: "Data de vencimento do pagamento",
        });

        // 3. Grace period
        if (data.gracePeriodDays) {
          transformed.push({
            id: "grace",
            type: "grace_period",
            dayOffset: data.gracePeriodDays,
            label: "Fim da carencia",
            description: `Fim do periodo de carencia (${data.gracePeriodDays} dias)`,
          });
        }

        // 4. Escalation steps (after due date - positive offset)
        if (Array.isArray(data.escalationSteps)) {
          data.escalationSteps.forEach((step: { daysAfterDue: number; action: string; description: string }, i: number) => {
            transformed.push({
              id: `escalation-${i}`,
              type: actionMap[step.action] || "email_reminder",
              dayOffset: step.daysAfterDue,
              label: step.description,
              description: `${step.description} (${step.daysAfterDue} dias após vencimento)`,
            });
          });
        }

        // Sort by dayOffset
        transformed.sort((a, b) => a.dayOffset - b.dayOffset);

        if (!cancelled) setRules(transformed);
      } catch {
        if (!cancelled) setRules(DEFAULT_RULES);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRules();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build the timeline steps
  const steps = useMemo<TimelineStep[]>(() => {
    if (!rules) return [];

    const due = startOfDay(new Date(dueDate));
    const today = startOfDay(new Date());
    const paid = paidAt ? startOfDay(new Date(paidAt)) : null;
    const normalizedStatus = status.toUpperCase();

    // Map rules to timeline steps
    const mapped: TimelineStep[] = rules.map((rule) => {
      const stepDate = addDays(due, rule.dayOffset);
      let state: TimelineStep["state"];

      if (normalizedStatus === "CANCELADO") {
        state = "canceled";
      } else if (normalizedStatus === "PAGO" && paid) {
        // If paid, everything after the payment date is canceled
        if (stepDate <= paid) {
          state = "completed";
        } else {
          state = "canceled";
        }
      } else {
        // PENDENTE, ATRASADO, PARCIAL
        if (stepDate < today) {
          state = "completed";
        } else if (
          stepDate.getTime() === today.getTime()
        ) {
          state = "current";
        } else {
          state = "upcoming";
        }
      }

      return {
        id: rule.id,
        type: rule.type,
        date: stepDate,
        label: rule.label,
        description: rule.description,
        state,
      };
    });

    // Sort chronologically
    mapped.sort((a, b) => a.date.getTime() - b.date.getTime());

    // If PAGO, inject a "payment received" step
    if (normalizedStatus === "PAGO" && paid) {
      const paymentStep: TimelineStep = {
        id: "payment-received",
        type: "payment_received",
        date: paid,
        label: "Pagamento recebido",
        description: `Pagamento de ${formatCurrency(value)} confirmado`,
        state: "completed",
      };

      // Insert in chronological order
      const idx = mapped.findIndex((s) => s.date > paid);
      if (idx === -1) {
        mapped.push(paymentStep);
      } else {
        mapped.splice(idx, 0, paymentStep);
      }
    }

    // If no step is "current", find the closest upcoming one and make it current
    // (only for PENDENTE / ATRASADO / PARCIAL)
    if (
      normalizedStatus !== "CANCELADO" &&
      normalizedStatus !== "PAGO" &&
      !mapped.some((s) => s.state === "current")
    ) {
      const firstUpcoming = mapped.find((s) => s.state === "upcoming");
      if (firstUpcoming) {
        firstUpcoming.state = "current";
      } else {
        // All steps are in the past -- the last completed step becomes current
        const lastCompleted = [...mapped]
          .reverse()
          .find((s) => s.state === "completed");
        if (lastCompleted) {
          lastCompleted.state = "current";
        }
      }
    }

    return mapped;
  }, [rules, dueDate, status, paidAt, value]);

  // ---------- Rendering helpers ----------

  const normalizedStatus = status.toUpperCase();
  const statusInfo = STATUS_MAP[normalizedStatus] ?? STATUS_MAP.PENDENTE;

  const totalWithFines =
    value + (fineValue ?? 0) + (interestValue ?? 0);

  function getDotClasses(step: TimelineStep): string {
    const base = "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all";

    switch (step.state) {
      case "completed":
        if (step.type === "payment_received") {
          return cn(base, "border-emerald-500 bg-emerald-500 text-white");
        }
        return cn(base, "border-emerald-500 bg-emerald-50 text-emerald-600");
      case "current":
        if (normalizedStatus === "ATRASADO") {
          return cn(base, "border-red-500 bg-red-50 text-red-600 animate-pulse");
        }
        return cn(base, "border-amber-500 bg-amber-50 text-amber-600 animate-pulse");
      case "upcoming":
        return cn(base, "border-gray-300 bg-white text-gray-400");
      case "skipped":
        return cn(base, "border-gray-200 bg-gray-50 text-gray-300");
      case "canceled":
        return cn(base, "border-gray-200 bg-gray-50 text-gray-300");
      default:
        return cn(base, "border-gray-300 bg-white text-gray-400");
    }
  }

  function getLineClasses(step: TimelineStep, nextStep?: TimelineStep): string {
    const base = "absolute left-[15px] top-8 w-0.5 -bottom-0";

    if (step.state === "completed" && nextStep?.state === "completed") {
      return cn(base, "bg-emerald-300");
    }
    if (step.state === "completed" && nextStep?.state === "current") {
      if (normalizedStatus === "ATRASADO") {
        return cn(base, "bg-gradient-to-b from-emerald-300 to-red-300");
      }
      return cn(base, "bg-gradient-to-b from-emerald-300 to-amber-300");
    }
    if (step.state === "canceled" || nextStep?.state === "canceled") {
      return cn(base, "bg-gray-200");
    }
    return cn(base, "bg-gray-200");
  }

  function getLabelClasses(step: TimelineStep): string {
    switch (step.state) {
      case "completed":
        return "text-sm font-medium text-foreground";
      case "current":
        if (normalizedStatus === "ATRASADO") {
          return "text-sm font-semibold text-red-700";
        }
        return "text-sm font-semibold text-amber-700";
      case "upcoming":
        return "text-sm font-medium text-muted-foreground";
      case "canceled":
      case "skipped":
        return "text-sm font-medium text-muted-foreground/60 line-through";
      default:
        return "text-sm font-medium text-muted-foreground";
    }
  }

  function getDescriptionClasses(step: TimelineStep): string {
    switch (step.state) {
      case "canceled":
      case "skipped":
        return "text-xs text-muted-foreground/40";
      default:
        return "text-xs text-muted-foreground";
    }
  }

  // ---------- Main render ----------

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Regua de Cobranca
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Carregando regua de cobranca...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Regua de Cobranca
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-12">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <span className="ml-2 text-sm text-muted-foreground">{error}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              Regua de Cobranca
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Vencimento: {formatDate(new Date(dueDate))} &middot;{" "}
              {formatCurrency(value)}
              {(fineValue || interestValue) && (
                <span className="text-red-600">
                  {" "}
                  (Total: {formatCurrency(totalWithFines)})
                </span>
              )}
            </p>
          </div>
          <Badge
            variant={statusInfo.variant}
            className={cn("shrink-0 text-xs border", statusInfo.className)}
          >
            {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        {/* Fines / interest breakdown */}
        {normalizedStatus === "ATRASADO" &&
          (fineValue || interestValue) && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-xs font-medium text-red-700">
                  Encargos por atraso
                </span>
              </div>
              <div className="flex gap-4 text-xs text-red-600">
                {fineValue != null && fineValue > 0 && (
                  <span>Multa: {formatCurrency(fineValue)}</span>
                )}
                {interestValue != null && interestValue > 0 && (
                  <span>Juros: {formatCurrency(interestValue)}</span>
                )}
              </div>
            </div>
          )}

        {/* Timeline */}
        <div className="relative">
          {steps.map((step, index) => {
            const Icon = STEP_ICONS[step.type] ?? Calendar;
            const isLast = index === steps.length - 1;
            const nextStep = steps[index + 1];

            return (
              <div
                key={step.id}
                className={cn("relative flex gap-4", !isLast && "pb-6")}
              >
                {/* Dot + vertical line */}
                <div className="relative flex flex-col items-center">
                  <div className={getDotClasses(step)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {!isLast && (
                    <div className={getLineClasses(step, nextStep)} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={getLabelClasses(step)}>{step.label}</span>
                    <span
                      className={cn(
                        "text-xs whitespace-nowrap",
                        step.state === "canceled" || step.state === "skipped"
                          ? "text-muted-foreground/40"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatDate(step.date)}
                    </span>
                  </div>
                  <p className={getDescriptionClasses(step)}>
                    {step.description}
                  </p>

                  {/* Current step extra indicators */}
                  {step.state === "current" &&
                    normalizedStatus === "ATRASADO" && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-medium text-red-600">
                          Etapa atual
                        </span>
                      </div>
                    )}
                  {step.state === "current" &&
                    (normalizedStatus === "PENDENTE" ||
                      normalizedStatus === "PARCIAL") && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs font-medium text-amber-600">
                          Proxima etapa
                        </span>
                      </div>
                    )}

                  {/* Payment received extra info */}
                  {step.type === "payment_received" &&
                    normalizedStatus === "PAGO" && (
                      <div className="mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-xs font-medium text-emerald-600">
                          Quitado
                        </span>
                      </div>
                    )}

                  {/* Canceled overlay text */}
                  {step.state === "canceled" &&
                    normalizedStatus === "PAGO" &&
                    step.type !== "payment_received" && (
                      <span className="text-xs text-muted-foreground/40 italic">
                        Cancelado (pagamento recebido)
                      </span>
                    )}
                  {step.state === "canceled" &&
                    normalizedStatus === "CANCELADO" && (
                      <span className="text-xs text-muted-foreground/40 italic">
                        Cancelado
                      </span>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
