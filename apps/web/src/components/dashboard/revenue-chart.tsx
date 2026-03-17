"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RevenueByMonthItem {
  month: string;
  value: number;
}

interface RevenueChartProps {
  data: RevenueByMonthItem[];
}

function formatCurrencyShort(value: number): string {
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}K`;
  }
  return `R$ ${value}`;
}

export function RevenueChart({ data }: RevenueChartProps) {
  const maxRevenue = data.length > 0 ? Math.max(...data.map((d) => d.value), 1) : 1;
  const currentValue = data.length > 0 ? data[data.length - 1].value : 0;
  const previousValue = data.length > 1 ? data[data.length - 2].value : 0;
  const trend = previousValue > 0
    ? (((currentValue - previousValue) / previousValue) * 100).toFixed(1)
    : "0.0";
  const trendPositive = currentValue >= previousValue;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Faturamento Mensal</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Ultimos 7 meses</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{formatCurrencyShort(currentValue)}</p>
            <p className={`text-xs font-medium ${trendPositive ? "text-emerald-600" : "text-red-600"}`}>
              {trendPositive ? "+" : ""}{trend}% vs mes anterior
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Sem dados de faturamento
          </p>
        ) : (
          <div className="flex items-end justify-between gap-2 h-[140px]">
            {data.map((item, i) => {
              const height = (item.value / maxRevenue) * 100;
              const isCurrentMonth = i === data.length - 1;
              return (
                <div key={`${item.month}-${i}`} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {(item.value / 1000).toFixed(0)}K
                  </span>
                  <div className="w-full flex justify-center">
                    <div
                      className={`w-full max-w-[36px] rounded-t-md transition-all ${
                        isCurrentMonth
                          ? "bg-primary"
                          : "bg-primary/20 hover:bg-primary/40"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  </div>
                  <span
                    className={`text-xs ${
                      isCurrentMonth
                        ? "font-semibold text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
