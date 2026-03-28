"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UpcomingPaymentItem {
  id: string;
  tenant: string;
  property: string;
  value: number;
  dueDate: string;
  daysUntil: number;
}

interface UpcomingPaymentsProps {
  payments: UpcomingPaymentItem[];
}

function getDueBadge(days: number) {
  if (days <= 0) return { label: "Vencido", className: "bg-red-100 text-red-700 border-red-200" };
  if (days <= 2) return { label: "Amanha", className: "bg-amber-100 text-amber-700 border-amber-200" };
  if (days <= 5) return { label: `${days} dias`, className: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: `${days} dias`, className: "bg-muted text-muted-foreground" };
}

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateBR(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function UpcomingPayments({ payments }: UpcomingPaymentsProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Proximos Vencimentos</CardTitle>
          <Link href="/financeiro?tab=pendentes" className="text-xs text-primary hover:underline font-medium">
            Ver todos
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-4">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum pagamento pendente
          </p>
        ) : (
          <div className="space-y-1">
            {payments.map((payment, index) => {
              const badge = getDueBadge(payment.daysUntil);
              return (
                <div
                  key={payment.id}
                  className={cn(
                    "flex items-center gap-3 py-3 hover:bg-muted/30 -mx-3 px-3 rounded-lg cursor-pointer transition-colors",
                    index < payments.length - 1 && "border-b border-border/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{payment.tenant}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {payment.property}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{formatCurrencyBRL(payment.value)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateBR(payment.dueDate)}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-xs border", badge.className)}
                  >
                    {badge.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
