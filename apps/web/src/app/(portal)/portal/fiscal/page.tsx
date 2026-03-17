"use client";

import { useEffect, useState, useCallback } from "react";
import { usePortal } from "@/components/portal/portal-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Receipt,
  TrendingDown,
  Calculator,
  Printer,
  Building2,
  FileText,
} from "lucide-react";
import type { FiscalReportData } from "@/lib/fiscal";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function PortalFiscalPage() {
  const { fetchPortal } = usePortal();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [report, setReport] = useState<FiscalReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchPortal(`/api/portal/fiscal?year=${year}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      } else {
        setReport(null);
      }
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [fetchPortal, year]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Cabecalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Informe de Rendimentos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Relatorio fiscal para declaracao de IR
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {report && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          )}
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold text-center">
          INFORME DE RENDIMENTOS - {year}
        </h1>
        <p className="text-center text-sm">Somma Imoveis - Gestao Imobiliaria</p>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </CardContent>
        </Card>
      )}

      {report && !loading && (
        <>
          {/* Info proprietario */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="font-semibold">{report.ownerName}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{report.ownerCpfCnpj}</span>
                    <Badge variant={report.personType === "PF" ? "default" : "secondary"}>
                      {report.personType === "PF" ? "Pessoa Fisica" : "Pessoa Juridica"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Rendimento Bruto</p>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-xl font-bold mt-1">
                  {formatCurrency(report.totals.grossRental)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Taxa Admin</p>
                  <TrendingDown className="h-4 w-4 text-orange-500" />
                </div>
                <p className="text-xl font-bold mt-1">
                  {formatCurrency(report.totals.adminFee)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Liquido</p>
                  <Receipt className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-xl font-bold mt-1">
                  {formatCurrency(report.totals.netToOwner)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">IRRF Estimado</p>
                  <Calculator className="h-4 w-4 text-red-500" />
                </div>
                <p className="text-xl font-bold mt-1">
                  {report.personType === "PJ" ? (
                    <Badge variant="secondary">N/A</Badge>
                  ) : (
                    formatCurrency(report.totals.totalIrrf)
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabelas por imovel */}
          {report.properties.map((property) => (
            <Card key={property.propertyId}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-semibold">
                    {property.propertyTitle}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Mes</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Bruto</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Taxa Admin</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Liquido</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Base Trib.</TableHead>
                        {report.personType === "PF" && (
                          <>
                            <TableHead className="text-right whitespace-nowrap">Aliquota</TableHead>
                            <TableHead className="text-right whitespace-nowrap">IRRF</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {property.months.map((month) => (
                        <TableRow key={month.month}>
                          <TableCell className="font-medium whitespace-nowrap">{month.label}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {formatCurrency(month.grossRental)}
                          </TableCell>
                          <TableCell className="text-right text-orange-600 whitespace-nowrap">
                            -{formatCurrency(month.adminFee)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {formatCurrency(month.netToOwner)}
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {formatCurrency(month.taxableIncome)}
                          </TableCell>
                          {report.personType === "PF" && (
                            <>
                              <TableCell className="text-right">
                                {month.irrfRate > 0 ? (
                                  <Badge variant="outline" className="text-xs">
                                    {formatPercent(month.irrfRate)}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                                    Isento
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-red-600">
                                {month.irrfValue > 0 ? formatCurrency(month.irrfValue) : "-"}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}

                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell className="whitespace-nowrap">Total</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrency(property.annualGross)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 whitespace-nowrap">
                          -{formatCurrency(property.annualAdminFee)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrency(property.annualNet)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrency(property.annualTaxable)}
                        </TableCell>
                        {report.personType === "PF" && (
                          <>
                            <TableCell />
                            <TableCell className="text-right text-red-600">
                              {formatCurrency(property.annualIrrf)}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Nota */}
          <p className="text-xs text-muted-foreground text-center">
            Documento gerado em{" "}
            {new Date(report.generatedAt).toLocaleString("pt-BR")} - Somma Imoveis.
            Valores de IRRF sao estimativas e podem divergir do calculo oficial.
          </p>
        </>
      )}

      {!loading && report && report.properties.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum rendimento em {year}</p>
            <p className="text-sm">Nao ha pagamentos recebidos neste ano</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
