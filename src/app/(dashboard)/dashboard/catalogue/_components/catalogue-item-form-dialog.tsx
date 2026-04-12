"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { ImagePlus, Trash2, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "~/lib/utils";
import type { CatalogueItemOutput } from "~/server/api/routers/catalogue.schema";
import { VariantsSection } from "./variants-section";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

type CatalogueItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CatalogueItemOutput | null;
  onSuccess: () => void;
  r2Configured?: boolean;
};

async function uploadPhoto(itemId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/catalogue/${itemId}/photo`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Erreur lors de l'upload de la photo");
  }
}

async function deletePhoto(itemId: string): Promise<void> {
  const res = await fetch(`/api/catalogue/${itemId}/photo`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Erreur lors de la suppression de la photo");
  }
}

/** Fetches existing variants for an item and renders VariantsSection */
function VariantsSectionLoader({
  catalogueItemId,
  onSaveSuccess,
}: {
  catalogueItemId: string;
  onSaveSuccess?: () => void;
}) {
  const { data, isLoading } = api.catalogue.listVariants.useQuery({ catalogueItemId });
  const utils = api.useUtils();

  // Reconstruct dimensions from existing variants' values keys
  const existingDimensions = data && data.length > 0
    ? Object.keys(data[0]!.values as Record<string, string>)
    : [];

  const handleSave = () => {
    void utils.catalogue.list.invalidate();
    onSaveSuccess?.();
  };

  if (isLoading) return <div className="flex justify-center py-4"><Spinner /></div>;

  return (
    <VariantsSection
      catalogueItemId={catalogueItemId}
      initialDimensions={existingDimensions}
      initialVariants={data?.map((v) => ({
        id: v.id,
        label: v.label,
        values: v.values as Record<string, string>,
        quantity: v.quantity,
        availableQty: v.availableQty,
        reservedQty: v.reservedQty,
      })) ?? []}
      onSaveSuccess={handleSave}
    />
  );
}

export function CatalogueItemFormDialog({
  open,
  onOpenChange,
  item,
  onSuccess,
  r2Configured = true,
}: CatalogueItemFormDialogProps) {
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmountCents] = useState("");
  const [error, setError] = useState("");
  const [showVariants, setShowVariants] = useState(false);

  // Photo state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = api.catalogue.create.useMutation({
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateMutation = api.catalogue.update.useMutation({
    onError: (err) => {
      setError(err.message);
    },
  });

  useEffect(() => {
    if (item) {
      setCode(item.code);
      setQuantity(item.quantity.toString());
      setAmountCents(
        item.amount !== null ? (item.amount / 100).toString() : ""
      );
    } else {
      resetForm();
      setShowVariants(false);
    }
    // Reset photo + error state on dialog open/item change
    setSelectedFile(null);
    setPreviewUrl(null);
    setRemoveExistingPhoto(false);
    setError("");
  }, [item, open]);

  // Cleanup preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetForm = () => {
    setCode("");
    setQuantity("1");
    setAmountCents("");
    setError("");
    setSelectedFile(null);
    setPreviewUrl(null);
    setRemoveExistingPhoto(false);
  };

  const validateAndSetFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Type de fichier non autorisé. Acceptés : JPEG, PNG, WebP");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Taille maximale dépassée (5 MB)");
      return;
    }

    setError("");
    setSelectedFile(file);
    setRemoveExistingPhoto(false);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndSetFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (item?.mediaStorageKey) {
      setRemoveExistingPhoto(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      setError("La quantité doit être un nombre positif");
      return;
    }

    let amountValue: number | undefined = undefined;
    if (amount.trim()) {
      const parsed = parseInt(amount, 10);
      if (isNaN(parsed) || parsed < 0) {
        setError("Le prix doit être un nombre positif");
        return;
      }
      amountValue = parsed * 100;
    }

    try {
      if (item) {
        // ─── Update flow ──────────────────────────────
        // 1. Handle photo changes (only if needed)
        const hasPhotoWork = (removeExistingPhoto && !selectedFile) || !!selectedFile;
        if (hasPhotoWork) setIsUploading(true);

        if (removeExistingPhoto && !selectedFile) {
          await deletePhoto(item.id);
        }
        if (selectedFile) {
          await uploadPhoto(item.id, selectedFile);
        }

        if (hasPhotoWork) setIsUploading(false);

        // 2. Update other fields if changed
        const updates: Record<string, unknown> = { id: item.id };
        if (code.trim() !== item.code) updates.code = code.trim();
        if (qty !== item.quantity) updates.quantity = qty;
        if (amountValue !== undefined) updates.amount = amountValue;

        if (Object.keys(updates).length > 1) {
          await updateMutation.mutateAsync(updates as Parameters<typeof updateMutation.mutateAsync>[0]);
        }

        onSuccess();
        resetForm();
      } else {
        // ─── Create flow ──────────────────────────────
        // 1. Create item (without photo)
        const created = await createMutation.mutateAsync({
          code: code.trim(),
          quantity: qty,
          amount: amountValue,
        });

        // 2. Upload photo if selected
        if (selectedFile && created.id) {
          setIsUploading(true);
          try {
            await uploadPhoto(created.id, selectedFile);
          } catch {
            // Item créé mais photo échouée — fermer et rafraîchir.
            // L'utilisateur peut éditer l'item pour réessayer l'upload.
          }
          setIsUploading(false);
        }

        onSuccess();
        resetForm();
      }
    } catch (err) {
      setIsUploading(false);
      if (err instanceof Error && !error) {
        setError(err.message);
      }
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || isUploading;

  // Determine what photo to show
  const hasExistingPhoto = item?.mediaStorageKey && !removeExistingPhoto && !selectedFile;
  const showPhotoSection = r2Configured;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto overflow-x-hidden custom-scrollbar">
        <DialogHeader>
          <DialogTitle>
            {item ? "Modifier l'article" : "Ajouter un article"}
          </DialogTitle>
          <DialogDescription>
            {item
              ? "Modifiez les informations de l'article du catalogue."
              : "Ajoutez un nouvel article à votre catalogue. Le prix sera automatiquement dérivé de votre grille si vous ne le spécifiez pas."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ex: A12"
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Le code sera normalisé (majuscules, espaces supprimés)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantité *</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Prix (FCFA, optionnel)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">F</span>
                <Input
                  id="amount"
                  type="text"
                  inputMode="numeric"
                  className="pl-8"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmountCents(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={isSubmitting}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Si non spécifié, le prix sera dérivé de la première lettre du code
              </p>
            </div>

            {/* Photo section */}
            {!r2Configured && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Configuration R2 requise pour les photos. Contactez votre administrateur.
              </div>
            )}
            {showPhotoSection && (
              <div className="space-y-2">
                <Label>Photo (optionnel)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                  className="hidden"
                  id="photo-input"
                />
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-colors",
                    isUploading && "pointer-events-none opacity-60",
                    isDragOver
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:border-primary/50",
                  )}
                >
                  {/* State A: empty */}
                  {!previewUrl && !hasExistingPhoto && !isUploading && !isDragOver && (
                    <div className="flex flex-col items-center gap-2 px-4 py-8">
                      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                        <Upload className="size-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Déposez une image ici ou{" "}
                        <span className="font-medium text-primary">
                          parcourir vos fichiers
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        JPEG, PNG ou WebP — 5 MB max
                      </p>
                    </div>
                  )}

                  {/* State B: preview */}
                  {(previewUrl ?? hasExistingPhoto) && !isUploading && !isDragOver && (
                    <div className="group relative">
                      <img
                        src={previewUrl ?? `/api/catalogue/${item!.id}/photo`}
                        alt="Aperçu de la photo"
                        className="h-[160px] w-full object-contain"
                      />
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-3 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                        >
                          <ImagePlus className="mr-1.5 size-3.5" />
                          Changer
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePhoto();
                          }}
                        >
                          <Trash2 className="mr-1.5 size-3.5" />
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* State C: uploading */}
                  {isUploading && (
                    <div className="flex flex-col items-center gap-2 px-4 py-8">
                      <Spinner className="size-6" />
                      <p className="text-sm text-muted-foreground">
                        Upload en cours…
                      </p>
                    </div>
                  )}

                  {/* State D: drag-over */}
                  {isDragOver && (
                    <div className="flex flex-col items-center gap-2 px-4 py-8">
                      <Upload className="size-8 text-primary" />
                      <p className="text-sm font-medium text-primary">
                        Déposez pour ajouter
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Variants section — edit mode only */}
            {item && (
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setShowVariants((v) => !v)}
                  className="flex w-full items-center justify-between text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  <span>Variantes (Taille, Couleur…)</span>
                  {showVariants ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showVariants && (
                  <div className="mt-4">
                    <VariantsSectionLoader
                      catalogueItemId={item.id}
                      onSaveSuccess={onSuccess}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? item
                  ? "Modification..."
                  : "Ajout..."
                : item
                  ? "Modifier"
                  : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
