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
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  FileSearch,
  SkipForward,
  ClipboardList,
  Shield,
  FileEdit,
  Handshake,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportContractPdfProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type DocType = "LOCACAO" | "ADMINISTRACAO" | "VISTORIA" | "PROCURACAO" | "ADITIVO" | "INTERMEDIACAO" | "OUTRO";

interface ParsedDocument {
  tipo: DocType;
  locatarioNome: string | null;
  locatarioCpf: string | null;
  proprietarioNome: string | null;
  proprietarioCpfCnpj: string | null;
  imovelDescricao: string | null;
  valorAluguel: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  diaPagamento: number | null;
  garantia: string | null;
  reajuste: string | null;
  fileName: string;
  notes: string | null;
}

interface ImportResult {
  fileName: string;
  status: "success" | "error" | "parsed" | "skipped";
  tipo?: DocType;
  data?: ParsedDocument;
  contractId?: string;
  error?: string;
}

interface ImportSummary {
  total: number;
  success: number;
  errors: number;
  parsed: number;
  skipped: number;
  byType: Record<string, number>;
}

type ImportStep = "select" | "preview" | "importing" | "done";

const TYPE_LABELS: Record<DocType, string> = {
  LOCACAO: "Locação",
  ADMINISTRACAO: "Administração",
  VISTORIA: "Vistoria",
  PROCURACAO: "Procuração",
  ADITIVO: "Aditivo",
  INTERMEDIACAO: "Intermediação",
  OUTRO: "Outro",
};

const TYPE_COLORS: Record<DocType, string> = {
  LOCACAO: "bg-emerald-100 text-emerald-700",
  ADMINISTRACAO: "bg-blue-100 text-blue-700",
  VISTORIA: "bg-amber-100 text-amber-700",
  PROCURACAO: "bg-purple-100 text-purple-700",
  ADITIVO: "bg-orange-100 text-orange-700",
  INTERMEDIACAO: "bg-cyan-100 text-cyan-700",
  OUTRO: "bg-gray-100 text-gray-700",
};

const TYPE_ICONS: Record<DocType, typeof FileText> = {
  LOCACAO: Handshake,
  ADMINISTRACAO: ClipboardList,
  VISTORIA: Eye,
  PROCURACAO: Shield,
  ADITIVO: FileEdit,
  INTERMEDIACAO: Handshake,
  OUTRO: FileText,
};

function formatCurrency(value: number | null): string {
  if (value === null || value === 0) return "N/A";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(iso: string | null): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function ImportContractPdf({ open, onOpenChange, onSuccess }: ImportContractPdfProps) {
  const [step, setStep] = useState<ImportStep>("select");
  const [files, setFiles] = useState<File[]>([]);
  const [previewResults, setPreviewResults] = useState<ImportResult[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setStep("select");
    setFiles([]);
    setPreviewResults([]);
    setImportResults([]);
    setSummary(null);
    setError(null);
    setIsDragOver(false);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  }

  function handleFileSelect(selectedFiles: FileList | File[]) {
    const pdfFiles = Array.from(selectedFiles).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") && f.size <= 25 * 1024 * 1024
    );
    if (pdfFiles.length === 0) {
      setError("Nenhum arquivo PDF valido selecionado.");
      return;
    }
    setFiles(pdfFiles);
    setError(null);
    parsePreview(pdfFiles);
  }

  async function parsePreview(pdfFiles: File[]) {
    setStep("importing");
    setError(null);

    try {
      const formData = new FormData();
      pdfFiles.forEach((f) => formData.append("files", f));
      formData.append("autoCreate", "false");

      const res = await fetch("/api/import/parse-contract-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Erro ao processar PDFs");
        setStep("select");
        return;
      }

      const data = await res.json();
      setPreviewResults(data.results);
      setStep("preview");
    } catch {
      setError("Erro de conexao com o servidor.");
      setStep("select");
    }
  }

  async function handleImport() {
    setStep("importing");
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("autoCreate", "true");

      const res = await fetch("/api/import/parse-contract-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Erro na importacao");
        setStep("preview");
        return;
      }

      const data = await res.json();
      setImportResults(data.results);
      setSummary(data.summary);
      setStep("done");
      if (data.summary.success > 0) onSuccess();
    } catch {
      setError("Erro de conexao com o servidor.");
      setStep("preview");
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (step !== "select") return;
      handleFileSelect(e.dataTransfer.files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step]
  );

  const parsedDocs = previewResults.filter((r) => r.status === "parsed" && r.data);

  // Group by type for summary
  const typeGroups: Record<string, ImportResult[]> = {};
  for (const r of parsedDocs) {
    const tipo = r.tipo || r.data?.tipo || "OUTRO";
    if (!typeGroups[tipo]) typeGroups[tipo] = [];
    typeGroups[tipo].push(r);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" />
            Importar Documentos PDF
          </DialogTitle>
          <DialogDescription>
            Importe contratos de locação, administração, vistorias, procurações e aditivos.
            O sistema classifica automaticamente cada arquivo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
          {/* Select files */}
          {step === "select" && (
            <>
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
                  accept=".pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                />
                <div className="flex flex-col items-center gap-2">
                  <Upload className={cn("h-10 w-10", isDragOver ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-medium">
                    {isDragOver ? "Solte os arquivos aqui" : "Arraste os PDFs ou clique para selecionar"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Selecione todos os PDFs da pasta de contratos - Maximo 25MB cada
                  </p>
                </div>
              </div>

              <div className="bg-muted/30 rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Tipos de documento suportados:</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(TYPE_LABELS) as DocType[]).filter(t => t !== "OUTRO").map((tipo) => {
                    const Icon = TYPE_ICONS[tipo];
                    return (
                      <span key={tipo} className={cn("inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium", TYPE_COLORS[tipo])}>
                        <Icon className="h-3 w-3" />
                        {TYPE_LABELS[tipo]}
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  O sistema identifica automaticamente o tipo de cada PDF pelo nome e conteudo,
                  extrai os dados e vincula pelo CPF/CNPJ.
                </p>
              </div>
            </>
          )}

          {/* Preview */}
          {step === "preview" && (
            <>
              {/* Type summary badges */}
              <div className="flex flex-wrap items-center gap-2 bg-muted/30 rounded-lg p-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium">{files.length} PDFs analisados:</span>
                {Object.entries(typeGroups).map(([tipo, items]) => {
                  const Icon = TYPE_ICONS[tipo as DocType];
                  return (
                    <span key={tipo} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium", TYPE_COLORS[tipo as DocType])}>
                      <Icon className="h-3 w-3" />
                      {items.length} {TYPE_LABELS[tipo as DocType]}
                    </span>
                  );
                })}
                {previewResults.filter(r => r.status === "error").length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {previewResults.filter(r => r.status === "error").length} erro(s)
                  </Badge>
                )}
                {previewResults.filter(r => r.status === "skipped").length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {previewResults.filter(r => r.status === "skipped").length} ignorado(s)
                  </Badge>
                )}
              </div>

              <div className="border rounded-lg overflow-y-auto flex-1 max-h-[400px]">
                <div className="divide-y">
                  {previewResults.map((r, i) => {
                    const tipo = (r.tipo || r.data?.tipo || "OUTRO") as DocType;
                    const Icon = TYPE_ICONS[tipo];
                    return (
                      <div key={i} className={cn(
                        "p-3 text-xs",
                        r.status === "error" ? "bg-red-50/50" : "",
                        r.status === "skipped" ? "bg-gray-50/50" : ""
                      )}>
                        <div className="flex items-start gap-2">
                          {r.status === "parsed" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : r.status === "skipped" ? (
                            <SkipForward className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{r.fileName}</p>
                              <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0", TYPE_COLORS[tipo])}>
                                <Icon className="h-2.5 w-2.5" />
                                {TYPE_LABELS[tipo]}
                              </span>
                            </div>
                            {r.data && r.status === "parsed" && (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-muted-foreground">
                                {r.data.proprietarioNome && (
                                  <p>Proprietario: <span className="text-foreground">{r.data.proprietarioNome}</span></p>
                                )}
                                {r.data.proprietarioCpfCnpj && (
                                  <p>Doc: <span className="text-foreground">{r.data.proprietarioCpfCnpj}</span></p>
                                )}
                                {r.data.locatarioNome && (
                                  <p>Locatario: <span className="text-foreground">{r.data.locatarioNome}</span></p>
                                )}
                                {r.data.locatarioCpf && (
                                  <p>CPF: <span className="text-foreground">{r.data.locatarioCpf}</span></p>
                                )}
                                {r.data.valorAluguel && r.data.valorAluguel > 0 && (
                                  <p>Valor: <span className="text-foreground">{formatCurrency(r.data.valorAluguel)}</span></p>
                                )}
                                {r.data.diaPagamento && (
                                  <p>Dia pgto: <span className="text-foreground">{r.data.diaPagamento}</span></p>
                                )}
                                {r.data.dataInicio && (
                                  <p>Inicio: <span className="text-foreground">{formatDate(r.data.dataInicio)}</span></p>
                                )}
                                {r.data.dataFim && (
                                  <p>Fim: <span className="text-foreground">{formatDate(r.data.dataFim)}</span></p>
                                )}
                                {r.data.garantia && (
                                  <p>Garantia: <span className="text-foreground">{r.data.garantia}</span></p>
                                )}
                                {r.data.imovelDescricao && (
                                  <p className="col-span-2">Imovel: <span className="text-foreground">{r.data.imovelDescricao.substring(0, 80)}</span></p>
                                )}
                                {r.data.notes && (
                                  <p className="col-span-2 text-muted-foreground italic">{r.data.notes}</p>
                                )}
                              </div>
                            )}
                            {r.error && <p className="text-red-500 mt-1">{r.error}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                className="text-xs text-primary underline self-start"
                onClick={() => { resetState(); }}
              >
                Trocar arquivos
              </button>
            </>
          )}

          {/* Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm font-medium">Processando {files.length} PDFs...</p>
              <p className="text-xs text-muted-foreground">Classificando, extraindo dados e vinculando automaticamente.</p>
            </div>
          )}

          {/* Done */}
          {step === "done" && summary && (
            <>
              <div
                className={cn(
                  "rounded-lg p-4 flex items-center gap-3",
                  summary.errors === 0
                    ? "bg-emerald-50 border border-emerald-200"
                    : summary.success === 0
                      ? "bg-red-50 border border-red-200"
                      : "bg-amber-50 border border-amber-200"
                )}
              >
                {summary.errors === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : summary.success === 0 ? (
                  <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    Importacao concluida:{" "}
                    <span className="text-emerald-600">{summary.success} criado{summary.success !== 1 ? "s" : ""}</span>
                    {summary.errors > 0 && (
                      <>, <span className="text-red-600">{summary.errors} erro{summary.errors !== 1 ? "s" : ""}</span></>
                    )}
                    {summary.skipped > 0 && (
                      <>, <span className="text-gray-500">{summary.skipped} ignorado{summary.skipped !== 1 ? "s" : ""}</span></>
                    )}
                    {" "}de {summary.total} arquivo{summary.total !== 1 ? "s" : ""}
                  </p>
                  {summary.byType && Object.keys(summary.byType).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(summary.byType).map(([tipo, count]) => (
                        <span key={tipo} className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", TYPE_COLORS[tipo as DocType])}>
                          {count} {TYPE_LABELS[tipo as DocType]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border rounded-lg overflow-y-auto max-h-[300px]">
                <div className="divide-y">
                  {importResults.map((r, i) => {
                    const tipo = (r.tipo || "OUTRO") as DocType;
                    const Icon = TYPE_ICONS[tipo];
                    return (
                      <div key={i} className={cn(
                        "flex items-start gap-2 p-2.5 text-xs",
                        r.status === "error" ? "bg-red-50/50" : r.status === "skipped" ? "bg-gray-50/30" : "bg-emerald-50/50"
                      )}>
                        {r.status === "success" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : r.status === "skipped" ? (
                          <SkipForward className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium truncate">{r.fileName}</span>
                            <span className={cn("inline-flex items-center gap-0.5 px-1 py-0 rounded text-[10px]", TYPE_COLORS[tipo])}>
                              <Icon className="h-2.5 w-2.5" />
                              {TYPE_LABELS[tipo]}
                            </span>
                          </div>
                          {r.status === "success" && r.data && (
                            <span className="text-muted-foreground">
                              {r.data.proprietarioNome && ` - ${r.data.proprietarioNome}`}
                              {r.data.locatarioNome && ` - ${r.data.locatarioNome}`}
                              {r.data.valorAluguel ? ` - ${formatCurrency(r.data.valorAluguel)}` : ""}
                            </span>
                          )}
                          {r.error && <span className="text-red-500"> - {r.error}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Error */}
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
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={step === "importing"}>
                Cancelar
              </Button>
              {step === "preview" && parsedDocs.length > 0 && (
                <Button onClick={handleImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar ({parsedDocs.length})
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
