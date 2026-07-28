"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ImagePlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { api } from "~/trpc/react";
import { CodePricePreview } from "~/app/(dashboard)/_components/code-price-preview";
import { ErrorAlert } from "~/components/ui/error-alert";
import { formatError, type UserError } from "~/lib/copy";
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
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import type { CatalogueItemOutput } from "~/server/api/routers/catalogue.schema";
import { VariantsSection } from "./variants-section";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

type CatalogueItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CatalogueItemOutput | null;
  onSuccess: () => void;
  r2Configured?: boolean;
};

type VariantDraftPayload = {
  dimensions: string[];
  variants: Array<{
    label: string;
    values: Record<string, string>;
    quantity: number;
  }>;
  isValid: boolean;
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

function VariantsSectionLoader({
  catalogueItemId,
  initialDimensions,
  onChange,
}: {
  catalogueItemId: string;
  initialDimensions?: string[] | null;
  onChange?: (payload: VariantDraftPayload) => void;
}) {
  const { data, isLoading } = api.catalogue.listVariants.useQuery({ catalogueItemId });

  const existingDimensions =
    initialDimensions && initialDimensions.length > 0
      ? initialDimensions
      : data && data.length > 0
        ? Object.keys(data[0]!.values as Record<string, string>)
        : [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  return (
    <VariantsSection
      initialDimensions={existingDimensions}
      initialVariants={
        data?.map((variant) => ({
          id: variant.id,
          label: variant.label,
          values: variant.values as Record<string, string>,
          quantity: variant.quantity,
          availableQty: variant.availableQty,
          reservedQty: variant.reservedQty,
        })) ?? []
      }
      onChange={onChange}
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
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmountCents] = useState("");
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState<UserError | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [showVariants, setShowVariants] = useState(true);
  const [variantDraft, setVariantDraft] = useState<VariantDraftPayload | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const syncToMeta = api.catalogue.syncToMeta.useMutation({
    onSuccess: () => {
      setSyncError(null);
      setSyncSuccess(true);
      onSuccess();
      setTimeout(() => setSyncSuccess(false), 3000);
    },
    onError: (e) => setSyncError(formatError(e, "catalogue")),
  });

  const createMutation = api.catalogue.create.useMutation({
    onError: (err) => setError(formatError(err, "catalogue")),
  });
  const updateMutation = api.catalogue.update.useMutation({
    onError: (err) => setError(formatError(err, "catalogue")),
  });
  const upsertVariantsMutation = api.catalogue.upsertVariants.useMutation({
    onError: (err) => setError(formatError(err, "catalogue")),
  });
  const deleteVariantsMutation = api.catalogue.deleteVariants.useMutation({
    onError: (err) => setError(formatError(err, "catalogue")),
  });

  useEffect(() => {
    if (item) {
      setCode(item.code);
      setName(item.name ?? "");
      setQuantity(item.quantity.toString());
      setAmountCents(item.amount !== null ? (item.amount / 100).toString() : "");
      setShowVariants(false);
    } else {
      resetForm();
      setShowVariants(true);
    }

    setSelectedFile(null);
    setPreviewUrl(null);
    setRemoveExistingPhoto(false);
    setError(null);
    setSyncError(null);
    setSyncSuccess(false);
    setVariantDraft(null);
  }, [item, open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetForm = () => {
    setCode("");
    setName("");
    setQuantity("1");
    setAmountCents("");
    setError(null);
    setSyncError(null);
    setSyncSuccess(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setRemoveExistingPhoto(false);
    setVariantDraft(null);
  };

  const validateAndSetFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError({ title: "Type de fichier non autorisé. Acceptés : JPEG, PNG, WebP" });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError({ title: "Taille maximale dépassée (5 MB)" });
      return;
    }

    setError(null);
    setSelectedFile(file);
    setRemoveExistingPhoto(false);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const qty = effectiveQuantity;
    if (Number.isNaN(qty) || qty < 1) {
      setError({ title: "La quantité doit être un nombre positif" });
      return;
    }

    let amountValue: number | undefined;
    if (amount.trim()) {
      const parsed = Number.parseInt(amount, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        setError({ title: "Le prix doit être un nombre positif" });
        return;
      }
      amountValue = parsed * 100;
    }

    if (showVariants && variantDraft && !variantDraft.isValid) {
      setError({
        title: item
          ? "Corrigez les variantes avant de modifier l’article."
          : "Corrigez les variantes avant d’ajouter l’article.",
      });
      return;
    }

    try {
      if (item) {
        const hasPhotoWork = (removeExistingPhoto && !selectedFile) || !!selectedFile;
        if (hasPhotoWork) setIsUploading(true);

        if (removeExistingPhoto && !selectedFile) {
          await deletePhoto(item.id);
        }
        if (selectedFile) {
          await uploadPhoto(item.id, selectedFile);
        }
        if (hasPhotoWork) setIsUploading(false);

        const updates: Record<string, unknown> = { id: item.id };
        if (code.trim() !== item.code) updates.code = code.trim();
        const nameVal = name.trim() || null;
        if (nameVal !== (item.name ?? null)) updates.name = nameVal;
        if (!hasActiveVariants && qty !== item.quantity) updates.quantity = qty;
        if (amountValue !== undefined) updates.amount = amountValue;

        if (Object.keys(updates).length > 1) {
          await updateMutation.mutateAsync(updates as Parameters<typeof updateMutation.mutateAsync>[0]);
        }

        if (showVariants && variantDraft) {
          if (variantDraft.variants.length === 0) {
            await deleteVariantsMutation.mutateAsync({ catalogueItemId: item.id });
          } else {
            await upsertVariantsMutation.mutateAsync({
              catalogueItemId: item.id,
              dimensions: variantDraft.dimensions,
              variants: variantDraft.variants,
            });
          }
        }
      } else {
        const created = await createMutation.mutateAsync({
          code: code.trim(),
          name: name.trim() || null,
          quantity: qty,
          amount: amountValue,
        });

        if (selectedFile && created.id) {
          setIsUploading(true);
          try {
            await uploadPhoto(created.id, selectedFile);
          } finally {
            setIsUploading(false);
          }
        }

        if (showVariants && variantDraft && variantDraft.variants.length > 0) {
          await upsertVariantsMutation.mutateAsync({
            catalogueItemId: created.id,
            dimensions: variantDraft.dimensions,
            variants: variantDraft.variants,
          });
        }
      }

      onSuccess();
      resetForm();
    } catch (err) {
      setIsUploading(false);
      if (err instanceof Error && !error) {
        setError(formatError(err, "catalogue"));
      }
    }
  };

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    upsertVariantsMutation.isPending ||
    deleteVariantsMutation.isPending ||
    isUploading;

  const canSyncToMeta = !!item && !!item.name && !!item.mediaStorageKey;

  const variantDerivedTotal =
    variantDraft?.variants.reduce((sum, variant) => sum + variant.quantity, 0) ?? 0;
  const hasInitialVariants = Boolean(item?.attributes && item.attributes.length > 0);
  const hasActiveVariants =
    variantDraft !== null ? variantDraft.variants.length > 0 : hasInitialVariants;
  const effectiveQuantity = hasActiveVariants
    ? variantDraft !== null
      ? variantDerivedTotal
      : item?.quantity ?? 0
    : Number.parseInt(quantity, 10);

  const hasExistingPhoto = item?.mediaStorageKey && !removeExistingPhoto && !selectedFile;
  const showPhotoSection = r2Configured;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet-on-mobile" className="sm:max-w-6xl max-h-[92vh] overflow-y-auto overflow-x-hidden custom-scrollbar">
        <DialogHeader>
          <DialogTitle>{item ? "Modifier l'article" : "Ajouter un article"}</DialogTitle>
          <DialogDescription>
            {item
              ? "Modifiez les informations de l'article du catalogue."
              : "Ajoutez un nouvel article à votre catalogue. Le prix sera automatiquement dérivé de votre grille si vous ne le spécifiez pas."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            <div className="grid gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(420px,520px)] lg:items-start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="item-name">Nom de l&apos;article</Label>
                  <Input
                    id="item-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="ex: Robe fleurie bleue"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nom affiché sur WhatsApp.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="ex: A12"
                    required
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Le code sera normalisé (majuscules, espaces supprimés)
                  </p>
                  {/* Montre le prix qui sera annoncé, plutôt que de le décrire. */}
                  <CodePricePreview code={code} disabled={amount.trim().length > 0} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantité *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={hasActiveVariants ? String(effectiveQuantity) : quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    required
                    disabled={isSubmitting || hasActiveVariants}
                  />
                  <p className="text-xs text-muted-foreground">
                    {hasActiveVariants
                      ? "La quantité totale est calculée automatiquement depuis les variantes."
                      : "Utilisé comme stock total tant qu'aucune variante n'est active."}
                  </p>
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
                      onChange={(event) => setAmountCents(event.target.value.replace(/[^0-9]/g, ""))}
                      disabled={isSubmitting}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sans prix, SnapSell applique celui de la catégorie qui commence le code (A12 → catégorie A).
                  </p>
                </div>
                {showPhotoSection ? (
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
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setIsDragOver(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsDragOver(false);
                        const file = event.dataTransfer.files[0];
                        if (file) validateAndSetFile(file);
                      }}
                      className={cn(
                        "relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-colors",
                        isUploading && "pointer-events-none opacity-60",
                        isDragOver
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/30 hover:border-primary/50",
                      )}
                    >
                      {!previewUrl && !hasExistingPhoto && !isUploading && !isDragOver ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-8">
                          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                            <Upload className="size-5 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Déposez une image ici ou{" "}
                            <span className="font-medium text-primary">parcourir vos fichiers</span>
                          </p>
                          <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP — 5 MB max</p>
                        </div>
                      ) : null}

                      {(previewUrl ?? hasExistingPhoto) && !isUploading && !isDragOver ? (
                        <div className="group relative">
                          <img
                            src={previewUrl ?? `/api/catalogue/${item!.id}/photo`}
                            alt="Aperçu de la photo"
                            className="h-[220px] w-full object-contain"
                          />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-3 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
                              onClick={(event) => {
                                event.stopPropagation();
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
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemovePhoto();
                              }}
                            >
                              <Trash2 className="mr-1.5 size-3.5" />
                              Supprimer
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      {isUploading ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-8">
                          <Spinner className="size-6" />
                          <p className="text-sm text-muted-foreground">Upload en cours…</p>
                        </div>
                      ) : null}

                      {isDragOver ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-8">
                          <Upload className="size-8 text-primary" />
                          <p className="text-sm font-medium text-primary">Déposez pour ajouter</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div>
                  <button
                    type="button"
                    onClick={() => setShowVariants((value) => !value)}
                    className="flex w-full items-center justify-between px-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    <span>Variantes</span>
                    {showVariants ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <p className="px-1 pt-2 text-xs text-muted-foreground">
                    Saisissez chaque variante directement, par exemple {item ? "Rouge / S" : "Option 1 / Option 2"}.
                  </p>
                  {showVariants ? (
                    <div className="mt-4">
                      {item ? (
                        <VariantsSectionLoader
                          catalogueItemId={item.id}
                          initialDimensions={item.attributes ?? null}
                          onChange={setVariantDraft}
                        />
                      ) : (
                        <VariantsSection initialDimensions={[]} initialVariants={[]} onChange={setVariantDraft} />
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {!r2Configured ? (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                L’envoi de photos n’est pas encore activé. Vous pouvez créer l’article sans photo et l’ajouter plus tard.
              </div>
            ) : null}

            {error ? <ErrorAlert error={error} /> : null}

            {item && (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Catalogue Meta Commerce</p>
                    <p className="text-xs text-muted-foreground">
                      {item.syncedToMeta
                        ? "Article synchronisé avec Meta."
                        : canSyncToMeta
                          ? "Prêt à synchroniser (nom + photo présents)."
                          : "Ajoutez un nom et une photo pour synchroniser."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.syncedToMeta && (
                      <Badge variant="success" className="text-xs">Synchronisé</Badge>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canSyncToMeta || syncToMeta.isPending}
                      onClick={() => syncToMeta.mutate({ id: item.id })}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn("size-3.5", syncToMeta.isPending && "animate-spin")} />
                      {syncToMeta.isPending ? "Synchro…" : item.syncedToMeta ? "Re-synchroniser" : "Synchroniser avec Meta"}
                    </Button>
                  </div>
                </div>
                {syncSuccess && (
                  <p className="text-xs text-success">Article synchronisé avec succès.</p>
                )}
                {syncError && (
                  <ErrorAlert error={syncError} />
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (item ? "Modification..." : "Ajout...") : item ? "Modifier" : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
