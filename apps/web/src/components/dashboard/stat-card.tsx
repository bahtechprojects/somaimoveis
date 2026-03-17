"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
  iconColor?: string;
}

export function StatCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
  iconColor = "bg-primary/10 text-primary",
}: StatCardProps) {
  return (
    <Card className={cn("border-0 shadow-sm hover:shadow-md transition-shadow", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className="flex items-center gap-1.5">
                {trend.value >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.value >= 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {trend.value > 0 && "+"}
                  {trend.value}%
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </div>
            )}
            {description && !trend && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
