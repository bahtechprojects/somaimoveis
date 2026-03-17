"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OccupancyChartProps {
  properties: {
    total: number;
    rented: number;
    available: number;
    maintenance: number;
  };
}

export function OccupancyChart({ properties }: OccupancyChartProps) {
  const { total, rented, available, maintenance } = properties;
  const inactive = Math.max(0, total - rented - available - maintenance);
  const occupancyRate = total > 0 ? Math.round((rented / total) * 100) : 0;

  const safeTotal = total > 0 ? total : 1;
  const data = [
    { label: "Alugados", value: rented, color: "bg-primary", percentage: (rented / safeTotal) * 100 },
    { label: "Disponiveis", value: available, color: "bg-emerald-500", percentage: (available / safeTotal) * 100 },
    { label: "Manutencao", value: maintenance, color: "bg-amber-500", percentage: (maintenance / safeTotal) * 100 },
    { label: "Inativos", value: inactive, color: "bg-muted-foreground/30", percentage: (inactive / safeTotal) * 100 },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Ocupacao dos Imoveis</CardTitle>
          <span className="text-2xl font-bold text-primary">{occupancyRate}%</span>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {/* Progress bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted mb-5">
          {data.map((item) => (
            <div
              key={item.label}
              className={cn("h-full transition-all", item.color)}
              style={{ width: `${item.percentage}%` }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-3">
          {data.map((item) => (
            <div key={item.label} className="flex items-center gap-2.5">
              <div className={cn("h-3 w-3 rounded-sm shrink-0", item.color)} />
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold">{item.value}</span>
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
