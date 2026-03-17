"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContractExpiringItem {
  id: string;
  tenant: string;
  property: string;
  endDate: string;
  daysLeft: number;
  rentalValue: number;
}

interface ContractsExpiringProps {
  contracts: ContractExpiringItem[];
}

function getUrgencyColor(days: number) {
  if (days <= 15) return "bg-red-100 text-red-700 border-red-200";
  if (days <= 30) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function ContractsExpiring({ contracts }: ContractsExpiringProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Contratos Vencendo</CardTitle>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            {contracts.length} contratos
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-4">
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum contrato vencendo
          </p>
        ) : (
          <div className="space-y-1">
            {contracts.map((contract, index) => (
              <div
                key={contract.id}
                className={cn(
                  "flex items-center gap-3 py-3 hover:bg-muted/30 -mx-3 px-3 rounded-lg cursor-pointer transition-colors group",
                  index < contracts.length - 1 && "border-b border-border/50"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contract.tenant}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {contract.property} - {formatCurrencyBRL(contract.rentalValue)}/mes
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={cn("text-xs border", getUrgencyColor(contract.daysLeft))}
                  >
                    {contract.daysLeft} dias
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
