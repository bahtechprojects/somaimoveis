"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
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
  User,
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

interface OwnerOption {
  id: string;
  name: string;
  cpfCnpj: string;
  personType: string;
}

export default function FiscalPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [report, setReport] = useState<FiscalReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Carregar lista de proprietarios
  useEffect(() => {
    fetch("/api/owners")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.owners || data || []).map((o: any) => ({
          id: o.id,
          name: o.name,
          cpfCnpj: o.cpfCnpj || "",
          personType: o.personType || "PF",
        }));
        setOwners(list);
      })
      .catch(() => {});
  }, []);

  // Gerar relatorio quando ano e proprietario sao selecionados
  useEffect(() => {
    if (!ownerId || !year) {
      setReport(null);
      return;
    }

    setLoading(true);
    fetch(`/api/fiscal?year=${year}&ownerId=${ownerId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setReport(null);
        } else {
          setReport(data);
        }
      })
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [year, ownerId]);

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="space-y-6">
      <Header
        title="Fiscal"
        subtitle="Informes de rendimentos para declaracao de IR"
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 print:hidden">
        <div className="w-[140px]">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger>
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[320px]">
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o proprietario" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name} ({o.cpfCnpj || "Sem CPF/CNPJ"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {report && (
          <Button
            variant="outline"
            onClick={() => window.print()}
            className="ml-auto"
          >
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        )}
      </div>

      {/* Estado inicial */}
      {!ownerId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Selecione um proprietario</p>
            <p className="text-sm">
              Escolha o ano e o proprietario para gerar o informe de rendimentos
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </CardContent>
        </Card>
      )}

      {/* Relatorio */}
      {report && !loading && (
        <>
          {/* Cabecalho do informe (visivel na impressao) */}
          <div className="hidden print:block mb-6">
            <h1 className="text-xl font-bold text-center">
              INFORME DE RENDIMENTOS - {report.year}
            </h1>
            <p className="text-center text-sm text-muted-foreground">
              Somma Imoveis - Gestão Imobiliária
            </p>
          </div>

          {/* Dados do proprietario */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{report.ownerName}</h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{report.ownerCpfCnpj || "Sem CPF/CNPJ"}</span>
                    <Badge variant={report.personType === "PF" ? "default" : "secondary"}>
                      {report.personType === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Rendimento Bruto</p>
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(report.totals.grossRental)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Total recebido no ano
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Taxa Administração</p>
                  <TrendingDown className="h-5 w-5 text-orange-500" />
                </div>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(report.totals.adminFee)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dedutivel do IR
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Rendimento Liquido</p>
                  <Receipt className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(report.totals.netToOwner)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Valor repassado ao proprietario
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">IRRF Estimado</p>
                  <Calculator className="h-5 w-5 text-red-500" />
                </div>
                <p className="text-2xl font-bold mt-1">
                  {report.personType === "PJ" ? (
                    <Badge variant="secondary">N/A - PJ</Badge>
                  ) : (
                    formatCurrency(report.totals.totalIrrf)
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {report.personType === "PJ"
                    ? "Pessoa Jurídica - sem retenção"
                    : "Imposto retido na fonte"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabelas por imovel */}
          {report.properties.map((property) => (
            <Card key={property.propertyId}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">
                    {property.propertyTitle}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mes</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Taxa Admin</TableHead>
                        <TableHead className="text-right">Liquido</TableHead>
                        {report.totals.maintenanceCost > 0 && (
                          <TableHead className="text-right">Manutenção</TableHead>
                        )}
                        <TableHead className="text-right">Base Tributavel</TableHead>
                        {report.personType === "PF" && (
                          <>
                            <TableHead className="text-right">Aliquota</TableHead>
                            <TableHead className="text-right">IRRF</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {property.months.map((month) => (
                        <TableRow key={month.month}>
                          <TableCell className="font-medium">
                            {month.label}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(month.grossRental)}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            -{formatCurrency(month.adminFee)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(month.netToOwner)}
                          </TableCell>
                          {report.totals.maintenanceCost > 0 && (
                            <TableCell className="text-right text-orange-600">
                              {month.maintenanceCost > 0
                                ? `-${formatCurrency(month.maintenanceCost)}`
                                : "-"}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-medium">
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
                                  <Badge
                                    variant="outline"
                                    className="text-xs text-green-600 border-green-200"
                                  >
                                    Isento
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-red-600">
                                {month.irrfValue > 0
                                  ? formatCurrency(month.irrfValue)
                                  : "-"}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}

                      {/* Subtotal do imovel */}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(property.annualGross)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          -{formatCurrency(property.annualAdminFee)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(property.annualNet)}
                        </TableCell>
                        {report.totals.maintenanceCost > 0 && (
                          <TableCell className="text-right text-orange-600">
                            {property.annualMaintenance > 0
                              ? `-${formatCurrency(property.annualMaintenance)}`
                              : "-"}
                          </TableCell>
                        )}
                        <TableCell className="text-right">
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

          {/* Resumo geral */}
          {report.properties.length > 1 && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="text-base">Resumo Geral - {report.year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Rendimento Bruto Total</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(report.totals.grossRental)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Taxa Admin</p>
                    <p className="text-lg font-semibold text-orange-600">
                      -{formatCurrency(report.totals.adminFee)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rendimento Liquido Total</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(report.totals.netToOwner)}
                    </p>
                  </div>
                  {report.totals.maintenanceCost > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Total Manutenção</p>
                      <p className="text-lg font-semibold text-orange-600">
                        -{formatCurrency(report.totals.maintenanceCost)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Base Tributavel Total</p>
                    <p className="text-lg font-semibold">
                      {formatCurrency(report.totals.taxableIncome)}
                    </p>
                  </div>
                  {report.personType === "PF" && (
                    <div>
                      <p className="text-sm text-muted-foreground">IRRF Estimado Total</p>
                      <p className="text-lg font-semibold text-red-600">
                        {formatCurrency(report.totals.totalIrrf)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Nota de rodape */}
          <p className="text-xs text-muted-foreground text-center">
            Documento gerado em{" "}
            {new Date(report.generatedAt).toLocaleString("pt-BR")} - Somma
            Imoveis. Os valores de IRRF sao estimativas baseadas na tabela
            progressiva vigente e podem divergir do calculo oficial da Receita
            Federal.
          </p>
        </>
      )}

      {/* Sem dados */}
      {ownerId && !loading && report && report.properties.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Receipt className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum rendimento encontrado</p>
            <p className="text-sm">
              Nao ha pagamentos recebidos para este proprietario em {year}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
