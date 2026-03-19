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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Files,
  Trash2,
  Link2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchUploadPdfProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type FileStatus = "pending" | "uploading" | "success" | "error";

interface FileEntry {
  id: string;
  file: File;
  status: FileStatus;
  matchedContractCode?: string;
  matchedContractId?: string;
  documentId?: string;
  error?: string;
}

interface BatchResultItem {
  filename: string;
  status: "success" | "error";
  documentId?: string;
  contractId?: string;
  contractCode?: string;
  error?: string;
}

interface BatchResponse {
  results: BatchResultItem[];
  summary: {
    total: number;
    success: number;
    errors: number;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function BatchUploadPdf({
  open,
  onOpenChange,
  onSuccess,
}: BatchUploadPdfProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [autoMatch, setAutoMatch] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [summary, setSummary] = useState<{
    success: number;
    errors: number;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetState() {
    setFiles([]);
    setIsUploading(false);
    setIsDone(false);
    setSummary(null);
    setIsDragOver(false);
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  }

  function addFiles(newFiles: FileList | File[]) {
    const fileArray = Array.from(newFiles);
    const entries: FileEntry[] = [];

    for (const file of fileArray) {
      // Check for duplicate filenames
      const alreadyAdded = files.some((f) => f.file.name === file.name);
      if (alreadyAdded) continue;

      if (file.type !== "application/pdf") continue;

      entries.push({
        id: generateId(),
        file,
        status: "pending",
      });
    }

    if (entries.length === 0 && fileArray.length > 0) {
      // All files were filtered out
      const nonPdf = fileArray.some((f) => f.type !== "application/pdf");
      if (nonPdf) {
        alert("Apenas arquivos PDF sao aceitos.");
      } else {
        alert("Os arquivos selecionados ja foram adicionados.");
      }
      return;
    }

    setFiles((prev) => [...prev, ...entries]);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      // Reset input so the same files can be selected again
      e.target.value = "";
    }
  }

  function handleRemoveFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
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

      if (isUploading || isDone) return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isUploading, isDone, files]
  );

  async function handleUploadAll() {
    if (files.length === 0) return;

    setIsUploading(true);

    // Mark all pending files as uploading
    setFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" ? { ...f, status: "uploading" as FileStatus } : f
      )
    );

    try {
      const formData = new FormData();
      const pendingFiles = files.filter(
        (f) => f.status === "pending" || f.status === "uploading"
      );

      for (const entry of pendingFiles) {
        formData.append("files", entry.file);
      }

      formData.append("autoMatch", autoMatch ? "true" : "false");
      formData.append("category", "CONTRATO");

      const response = await fetch("/api/upload/batch", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        // Mark all uploading files as error
        setFiles((prev) =>
          prev.map((f) =>
            f.status === "uploading"
              ? {
                  ...f,
                  status: "error" as FileStatus,
                  error: error.error || "Erro no upload",
                }
              : f
          )
        );
        setSummary({ success: 0, errors: pendingFiles.length });
        setIsDone(true);
        setIsUploading(false);
        return;
      }

      const data: BatchResponse = await response.json();

      // Map results back to file entries by filename
      setFiles((prev) => {
        const updated = [...prev];
        for (const result of data.results) {
          const idx = updated.findIndex(
            (f) =>
              f.file.name === result.filename &&
              (f.status === "uploading" || f.status === "pending")
          );
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              status: result.status as FileStatus,
              documentId: result.documentId,
              matchedContractId: result.contractId,
              matchedContractCode: result.contractCode,
              error: result.error,
            };
          }
        }
        return updated;
      });

      setSummary({
        success: data.summary.success,
        errors: data.summary.errors,
      });
      setIsDone(true);
      onSuccess();
    } catch {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading"
            ? {
                ...f,
                status: "error" as FileStatus,
                error: "Erro de conexao",
              }
            : f
        )
      );
      setSummary({
        success: 0,
        errors: files.filter((f) => f.status === "uploading").length,
      });
      setIsDone(true);
    } finally {
      setIsUploading(false);
    }
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);

  const statusIcon = (status: FileStatus) => {
    switch (status) {
      case "pending":
        return <FileText className="h-4 w-4 text-muted-foreground" />;
      case "uploading":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Files className="h-5 w-5" />
            Importar PDFs em Lote
          </DialogTitle>
          <DialogDescription>
            Faca upload de varios contratos PDF de uma vez. Os arquivos podem ser
            vinculados automaticamente aos contratos pelo nome do arquivo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
          {/* Auto-match toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="auto-match"
                className="text-sm font-medium cursor-pointer"
              >
                Auto-detectar contratos pelo nome do arquivo
              </Label>
              <p className="text-xs text-muted-foreground">
                Ex: arquivo &quot;CTR-001_contrato.pdf&quot; sera vinculado ao
                contrato CTR-001
              </p>
            </div>
            <Switch
              id="auto-match"
              checked={autoMatch}
              onCheckedChange={setAutoMatch}
              disabled={isUploading || isDone}
            />
          </div>

          {/* Drop zone */}
          {!isDone && (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
                isUploading && "pointer-events-none opacity-50"
              )}
              onClick={() => !isUploading && fileInputRef.current?.click()}
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
                    ? "Solte os arquivos aqui"
                    : "Arraste PDFs aqui ou clique para selecionar"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Varios arquivos PDF, maximo 25MB cada
                </p>
              </div>
            </div>
          )}

          {/* Summary banner */}
          {isDone && summary && (
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
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">
                  Upload concluido:{" "}
                  <span className="text-emerald-600">
                    {summary.success} sucesso
                  </span>
                  {summary.errors > 0 && (
                    <>
                      ,{" "}
                      <span className="text-red-600">
                        {summary.errors} erro{summary.errors > 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* File list */}
          {files.length > 0 && (
            <div className="flex-1 overflow-y-auto border rounded-lg">
              <div className="divide-y">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-3 p-3 text-sm",
                      entry.status === "error" && "bg-red-50/50"
                    )}
                  >
                    {/* Status icon */}
                    <div className="shrink-0">{statusIcon(entry.status)}</div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-xs">
                        {entry.file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(entry.file.size)}
                        </span>
                        {entry.file.size > 25 * 1024 * 1024 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 h-4 border-red-200 text-red-600"
                          >
                            Excede 25MB
                          </Badge>
                        )}
                        {entry.matchedContractCode && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 h-4 border-emerald-200 text-emerald-600 gap-0.5"
                          >
                            <Link2 className="h-2.5 w-2.5" />
                            {entry.matchedContractCode}
                          </Badge>
                        )}
                        {entry.error && (
                          <span className="text-xs text-red-500">
                            {entry.error}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Remove button (only when pending) */}
                    {entry.status === "pending" && !isUploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => handleRemoveFile(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File count and size info */}
          {files.length > 0 && !isDone && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {files.length} arquivo{files.length > 1 ? "s" : ""} selecionado
                {files.length > 1 ? "s" : ""} ({formatFileSize(totalSize)})
              </span>
              {pendingCount < files.length && !isUploading && (
                <span>
                  {pendingCount} pendente{pendingCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isDone ? (
            <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isUploading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUploadAll}
                disabled={files.length === 0 || isUploading || pendingCount === 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Enviar Todos ({pendingCount})
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
