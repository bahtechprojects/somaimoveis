"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  time: string;
  value?: number;
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "Agora";
  if (diffMinutes < 60) return `${diffMinutes}min atras`;
  if (diffHours < 24) return `${diffHours}h atras`;
  if (diffDays === 1) return "1 dia atras";
  return `${diffDays} dias atras`;
}

function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getActivityIcon(type: string) {
  if (type === "overdue") return { icon: AlertTriangle, color: "bg-amber-100 text-amber-600" };
  return { icon: DollarSign, color: "bg-emerald-100 text-emerald-600" };
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Atividade Recente</CardTitle>
          <Link href="/financeiro" className="text-xs text-primary hover:underline font-medium">
            Ver tudo
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-4">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma atividade recente
          </p>
        ) : (
          <div className="space-y-1">
            {activities.map((activity, index) => {
              const { icon: Icon, color } = getActivityIcon(activity.type);
              return (
                <div
                  key={activity.id}
                  className={cn(
                    "flex items-start gap-3 py-3 transition-colors hover:bg-muted/30 -mx-3 px-3 rounded-lg cursor-pointer",
                    index < activities.length - 1 && "border-b border-border/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      color
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{activity.title}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(activity.time)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {activity.description}
                    </p>
                  </div>
                  {activity.value && (
                    <Badge
                      variant={activity.type === "overdue" ? "destructive" : "default"}
                      className="shrink-0 text-xs"
                    >
                      {formatCurrencyBRL(activity.value)}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
