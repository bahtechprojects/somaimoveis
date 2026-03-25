"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Loader2, CheckCircle, X } from "lucide-react";
import { useEffect } from "react";

interface UploadPdfProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Contract {
  id: string;
  code: string;
  property?: { title: string };
  tenant?: { name: string };
}

export function UploadPdf({ open, onOpenChange, onSuccess }: UploadPdfProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetch("/api/contracts")
        .then((r) => r.json())
        .then(setContracts)
        .catch(console.error);
      setFile(null);
      setUploaded(false);
      setSelectedContract("");
    }
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      if (f.type !== "application/pdf") {
        toast.error("Apenas arquivos PDF sao aceitos");
        return;
      }
      setFile(f);
      setUploaded(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedContract) {
        formData.append("contractId", selectedContract);
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao fazer upload");
        return;
      }

      setUploaded(true);
      onSuccess();
    } catch {
      toast.error("Erro ao fazer upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Contrato PDF</DialogTitle>
          <DialogDescription>
            Faça upload de um contrato em PDF para vincular a um contrato existente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Contract select */}
          <div className="space-y-2">
            <Label>Vincular ao Contrato (opcional)</Label>
            <Select value={selectedContract} onValueChange={setSelectedContract}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um contrato" />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} - {c.property?.title || "Imóvel"} ({c.tenant?.name || "Locatário"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File drop zone */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {uploaded ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-10 w-10 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-600">Upload concluído!</p>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="h-4 w-4 mr-1" /> Remover
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar o PDF</p>
                <p className="text-xs text-muted-foreground">Máximo 25MB</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {uploaded ? "Fechar" : "Cancelar"}
          </Button>
          {!uploaded && (
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Enviar PDF
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
