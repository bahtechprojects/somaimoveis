"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EntityType = "owners" | "tenants" | "properties" | "contracts";

interface ImportSpreadsheetProps {
  entityType: EntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  imported: number;
  total: number;
  errors: ImportError[];
}

type ImportStep = "select" | "preview" | "importing" | "done";

const ENTITY_LABELS: Record<EntityType, string> = {
  owners: "Proprietarios",
  tenants: "Locatarios",
  properties: "Imoveis",
  contracts: "Contratos",
};

const ENTITY_COLUMNS: Record<EntityType, string[]> = {
  owners: ["nome*", "cpf_cnpj*", "email", "telefone", "tipo_pessoa", "rua", "numero", "bairro", "cidade", "estado", "cep", "banco", "agencia", "conta", "pix"],
  tenants: ["nome*", "cpf_cnpj*", "email", "telefone", "tipo_pessoa", "profissao", "renda_mensal", "rg", "rua", "numero", "bairro", "cidade", "estado", "cep"],
  properties: ["titulo*", "tipo*", "proprietario_email ou proprietario_cpf*", "rua*", "numero*", "bairro*", "cidade*", "estado*", "cep*", "area", "quartos", "banheiros", "vagas", "mobiliado", "valor_aluguel", "condominio", "iptu"],
  contracts: ["codigo*", "imovel_titulo*", "locatario_email ou locatario_cpf*", "proprietario_email ou proprietario_cpf*", "valor_aluguel*", "data_inicio*", "data_fim*", "taxa_admin", "dia_pagamento", "tipo_garantia", "indice_reajuste"],
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportSpreadsheet({
  entityType,
  open,
  onOpenChange,
  onSuccess,
}: ImportSpreadsheetProps) {
  const [step, setStep] = useState<ImportStep>("select");
  const [file, setFile] = useState<File | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setStep("select");
    setFile(null);
    setParsedRows([]);
    setHeaders([]);
    setResult(null);
    setError(null);
    setIsDragOver(false);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  }

  async function parseFile(f: File) {
    setError(null);
    const ext = "." + f.name.split(".").pop()?.toLowerCase();

    if (ext === ".pdf") {
      await parsePdf(f);
    } else {
      await parseSpreadsheet(f);
    }
  }

  async function parseSpreadsheet(f: File) {
    try {
      const XLSX = await import("xlsx");
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      if (json.length === 0) {
        setError("A planilha esta vazia ou nao tem dados.");
        return;
      }

      const cols = Object.keys(json[0]);
      setHeaders(cols);
      setParsedRows(json);
      setFile(f);
      setStep("preview");
    } catch {
      setError("Erro ao ler o arquivo. Verifique se e um CSV ou Excel valido.");
    }
  }

  async function parsePdf(f: File) {
    try {
      setStep("importing");
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch("/api/import/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Erro ao processar PDF");
        setStep("select");
        return;
      }

      const data = await res.json();
      const rows = data.rows;

      if (!rows || rows.length === 0) {
        setError("Nenhum dado tabular encontrado no PDF.");
        setStep("select");
        return;
      }

      const cols = Object.keys(rows[0]);
      setHeaders(cols);
      setParsedRows(rows);
      setFile(f);
      setStep("preview");
    } catch {
      setError("Erro ao processar o PDF. Verifique se o arquivo e valido.");
      setStep("select");
    }
  }

  function handleFileSelect(f: File) {
    const validTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/pdf",
    ];
    const validExts = [".csv", ".xlsx", ".xls", ".pdf"];
    const ext = "." + f.name.split(".").pop()?.toLowerCase();

    if (!validTypes.includes(f.type) && !validExts.includes(ext)) {
      setError("Formato invalido. Use CSV (.csv), Excel (.xlsx) ou PDF (.pdf).");
      return;
    }

    if (f.size > 25 * 1024 * 1024) {
      setError("Arquivo muito grande. Maximo 25MB.");
      return;
    }

    parseFile(f);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
      e.target.value = "";
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (step !== "select") return;
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step]
  );

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setStep("importing");
    setError(null);

    try {
      const res = await fetch(`/api/import/${entityType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Erro na importacao");
        setStep("preview");
        return;
      }

      const data: ImportResult = await res.json();
      setResult(data);
      setStep("done");
      if (data.imported > 0) onSuccess();
    } catch {
      setError("Erro de conexao com o servidor.");
      setStep("preview");
    }
  }

  const previewRows = parsedRows.slice(0, 5);
  const entityLabel = ENTITY_LABELS[entityType];
  const expectedCols = ENTITY_COLUMNS[entityType];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar {entityLabel}
          </DialogTitle>
          <DialogDescription>
            Importe dados de uma planilha CSV, Excel (.xlsx) ou PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
          {/* Step: Select file */}
          {step === "select" && (
            <>
              {/* Drop zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload
                    className={cn(
                      "h-10 w-10",
                      isDragOver ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <p className="text-sm font-medium">
                    {isDragOver
                      ? "Solte o arquivo aqui"
                      : "Arraste o arquivo aqui ou clique para selecionar"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: CSV (.csv), Excel (.xlsx) ou PDF (.pdf) - Maximo 25MB
                  </p>
                </div>
              </div>

              {/* Expected columns */}
              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Table2 className="h-3.5 w-3.5" />
                  Colunas esperadas (* obrigatorias):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {expectedCols.map((col) => (
                    <Badge
                      key={col}
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 h-5",
                        col.includes("*")
                          ? "border-primary/40 text-primary font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Step: Preview */}
          {step === "preview" && file && (
            <>
              {/* File info */}
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  {file.name.toLowerCase().endsWith(".pdf") ? (
                    <FileText className="h-4 w-4 text-red-500" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(file.size)})
                  </span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {parsedRows.length} linha{parsedRows.length > 1 ? "s" : ""}
                </Badge>
              </div>

              {/* Preview table */}
              <div className="border rounded-lg overflow-x-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground border-b w-10">
                        #
                      </th>
                      {headers.map((h) => (
                        <th
                          key={h}
                          className="px-3 py-2 text-left font-medium text-muted-foreground border-b whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {i + 1}
                        </td>
                        {headers.map((h) => (
                          <td
                            key={h}
                            className="px-3 py-1.5 max-w-[200px] truncate"
                          >
                            {String(row[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 5 && (
                  <div className="text-center py-2 text-xs text-muted-foreground bg-muted/20">
                    ... e mais {parsedRows.length - 5} linhas
                  </div>
                )}
              </div>

              {/* Change file link */}
              <button
                className="text-xs text-primary underline self-start"
                onClick={() => {
                  setStep("select");
                  setFile(null);
                  setParsedRows([]);
                  setHeaders([]);
                  setError(null);
                }}
              >
                Trocar arquivo
              </button>
            </>
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm font-medium">
                Importando {parsedRows.length} {entityLabel.toLowerCase()}...
              </p>
              <p className="text-xs text-muted-foreground">
                Aguarde, isso pode levar alguns segundos.
              </p>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && result && (
            <>
              {/* Summary banner */}
              <div
                className={cn(
                  "rounded-lg p-4 flex items-center gap-3",
                  result.errors.length === 0
                    ? "bg-emerald-50 border border-emerald-200"
                    : result.imported === 0
                      ? "bg-red-50 border border-red-200"
                      : "bg-amber-50 border border-amber-200"
                )}
              >
                {result.errors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : result.imported === 0 ? (
                  <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    Importacao concluida:{" "}
                    <span className="text-emerald-600">
                      {result.imported} importado{result.imported !== 1 ? "s" : ""}
                    </span>
                    {result.errors.length > 0 && (
                      <>
                        ,{" "}
                        <span className="text-red-600">
                          {result.errors.length} erro{result.errors.length !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                    {" "}de {result.total} total
                  </p>
                </div>
              </div>

              {/* Error list */}
              {result.errors.length > 0 && (
                <div className="border rounded-lg overflow-y-auto max-h-[200px]">
                  <div className="divide-y">
                    {result.errors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2.5 text-xs bg-red-50/50"
                      >
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">Linha {err.row}</span>
                          {err.field && (
                            <span className="text-muted-foreground"> ({err.field})</span>
                          )}
                          <span className="text-muted-foreground">: {err.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error message */}
          {error && step !== "done" && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "done" ? (
            <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={step === "importing"}
              >
                Cancelar
              </Button>
              {step === "preview" && (
                <Button onClick={handleImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar ({parsedRows.length})
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
