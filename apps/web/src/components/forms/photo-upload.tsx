"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Camera,
  Upload,
  X,
  Loader2,
  ImagePlus,
  Trash2,
} from "lucide-react";

interface PhotoUploadProps {
  propertyId: string;
  photos: Array<{
    id: string;
    url: string;
    caption: string | null;
    order: number;
  }>;
  onPhotosChange: () => void;
}

interface PreviewFile {
  file: File;
  preview: string;
}

export function PhotoUpload({
  propertyId,
  photos,
  onPhotosChange,
}: PhotoUploadProps) {
  const [previews, setPreviews] = useState<PreviewFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const validFiles: PreviewFile[] = [];

    Array.from(files).forEach((file) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error(`Arquivo "${file.name}" ignorado. Apenas JPEG, PNG e WebP sao aceitos.`);
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`Arquivo "${file.name}" ignorado. Tamanho maximo: 25MB.`);
        return;
      }
      validFiles.push({
        file,
        preview: URL.createObjectURL(file),
      });
    });

    if (validFiles.length > 0) {
      setPreviews((prev) => [...prev, ...validFiles]);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
      // Reset the input so the same file can be selected again
      e.target.value = "";
    },
    [handleFiles]
  );

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
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const removePreview = useCallback((index: number) => {
    setPreviews((prev) => {
      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (previews.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      previews.forEach((p) => {
        formData.append("photos", p.file);
      });

      const response = await fetch(
        `/api/properties/${propertyId}/photos`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || "Erro ao fazer upload das fotos");
        return;
      }

      // Clean up preview URLs
      previews.forEach((p) => URL.revokeObjectURL(p.preview));
      setPreviews([]);
      onPhotosChange();
    } catch {
      toast.error("Erro ao fazer upload das fotos");
    } finally {
      setUploading(false);
    }
  }, [previews, propertyId, onPhotosChange]);

  const handleDelete = useCallback(
    async (photoId: string) => {
      setDeleting(photoId);
      try {
        const response = await fetch(
          `/api/properties/${propertyId}/photos`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photoId }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          toast.error(error.error || "Erro ao excluir foto");
          return;
        }

        onPhotosChange();
      } catch {
        toast.error("Erro ao excluir foto");
      } finally {
        setDeleting(null);
        setPhotoToDelete(null);
      }
    },
    [propertyId, onPhotosChange]
  );

  return (
    <div className="space-y-6">
      {/* Existing Photos Grid */}
      {photos.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Fotos do Imóvel ({photos.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square rounded-lg overflow-hidden border bg-muted"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || "Foto do imovel"}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                {/* Hover overlay with delete button */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-9 w-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    onClick={() => setPhotoToDelete(photo.id)}
                    disabled={deleting === photo.id}
                  >
                    {deleting === photo.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {/* Caption overlay */}
                {photo.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white truncate">
                      {photo.caption}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Previews */}
      {previews.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <ImagePlus className="h-4 w-4" />
            Novas Fotos ({previews.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {previews.map((preview, index) => (
              <div
                key={index}
                className="relative aspect-square rounded-lg overflow-hidden border-2 border-dashed border-primary/30 bg-muted"
              >
                <img
                  src={preview.preview}
                  alt={`Preview ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePreview(index)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2">
                  <p className="text-[10px] text-white truncate">
                    {preview.file.name}
                  </p>
                  <p className="text-[10px] text-white/70">
                    {(preview.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="flex-1"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar {previews.length}{" "}
                  {previews.length === 1 ? "foto" : "fotos"}
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                previews.forEach((p) => URL.revokeObjectURL(p.preview));
                setPreviews([]);
              }}
              disabled={uploading}
            >
              Limpar
            </Button>
          </div>
        </div>
      )}

      {/* Drop Zone */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          }
        `}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center gap-3">
          <div
            className={`
              h-12 w-12 rounded-full flex items-center justify-center
              ${isDragOver ? "bg-primary/10" : "bg-muted"}
            `}
          >
            <ImagePlus
              className={`h-6 w-6 ${
                isDragOver ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </div>
          <div>
            <p className="text-sm font-medium">
              {isDragOver
                ? "Solte as fotos aqui"
                : "Arraste fotos ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPEG, PNG ou WebP - Maximo 25MB por arquivo
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!photoToDelete}
        onOpenChange={(open) => !open && setPhotoToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Foto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta foto? Esta acao nao pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => photoToDelete && handleDelete(photoToDelete)}
              disabled={!!deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
