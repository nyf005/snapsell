"use client";

import { useState, useEffect } from "react";
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
import type { CatalogueItemOutput } from "~/server/api/routers/catalogue.schema";

type CatalogueItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CatalogueItemOutput | null;
  onSuccess: () => void;
};

export function CatalogueItemFormDialog({
  open,
  onOpenChange,
  item,
  onSuccess,
}: CatalogueItemFormDialogProps) {
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [amountCents, setAmountCents] = useState("");
  const [error, setError] = useState("");

  const createMutation = api.catalogue.create.useMutation({
    onSuccess: () => {
      onSuccess();
      resetForm();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateMutation = api.catalogue.update.useMutation({
    onSuccess: () => {
      onSuccess();
      resetForm();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  useEffect(() => {
    if (item) {
      setCode(item.code);
      setQuantity(item.quantity.toString());
      setAmountCents(
        item.amountCents !== null ? (item.amountCents / 100).toString() : ""
      );
    } else {
      resetForm();
    }
  }, [item, open]);

  const resetForm = () => {
    setCode("");
    setQuantity("1");
    setAmountCents("");
    setError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      setError("La quantité doit être un nombre positif");
      return;
    }

    let amountCentsValue: number | undefined = undefined;
    if (amountCents.trim()) {
      const parsed = parseFloat(amountCents);
      if (isNaN(parsed) || parsed < 0) {
        setError("Le prix doit être un nombre positif");
        return;
      }
      amountCentsValue = Math.round(parsed * 100);
    }

    if (item) {
      // Update
      updateMutation.mutate({
        id: item.id,
        code: code.trim() !== item.code ? code.trim() : undefined,
        quantity: qty !== item.quantity ? qty : undefined,
        amountCents: amountCentsValue !== undefined ? amountCentsValue : undefined,
      });
    } else {
      // Create
      createMutation.mutate({
        code: code.trim(),
        quantity: qty,
        amountCents: amountCentsValue,
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
              <Label htmlFor="amountCents">Prix (FCFA, optionnel)</Label>
              <Input
                id="amountCents"
                type="number"
                min="0"
                step="1"
                value={amountCents}
                onChange={(e) => setAmountCents(e.target.value)}
                placeholder="Laissez vide pour utiliser la grille de prix"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Si non spécifié, le prix sera dérivé de la première lettre du code
              </p>
            </div>

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
