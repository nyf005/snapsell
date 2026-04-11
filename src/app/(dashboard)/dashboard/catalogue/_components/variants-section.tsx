"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Plus, Trash2, Layers, X, AlertTriangle } from "lucide-react";

type VariantRow = {
  key: string; // local-only, used as React key
  label: string;
  values: Record<string, string>;
  quantity: number;
};

type VariantsSectionProps = {
  catalogueItemId: string;
  initialDimensions?: string[];
  initialVariants?: Array<{
    id: string;
    label: string;
    values: Record<string, string>;
    quantity: number;
    availableQty: number;
    reservedQty: number;
  }>;
  onSaveSuccess?: () => void;
};

function buildLabel(dims: string[], values: Record<string, string>) {
  return dims.map((d) => values[d] ?? "").filter(Boolean).join(" / ");
}

function generateCombinations(dims: string[], options: Record<string, string[]>): VariantRow[] {
  if (dims.length === 0) return [];
  const [first, ...rest] = dims;
  if (!first) return [];
  const firstVals = options[first] ?? [];
  if (rest.length === 0) {
    return firstVals.map((v) => ({
      key: v,
      label: v,
      values: { [first]: v },
      quantity: 0,
    }));
  }
  const subCombos = generateCombinations(rest, options);
  return firstVals.flatMap((v) =>
    subCombos.map((sub) => ({
      key: `${v}-${sub.key}`,
      label: `${v} / ${sub.label}`,
      values: { [first]: v, ...sub.values },
      quantity: sub.quantity,
    }))
  );
}

export function VariantsSection({
  catalogueItemId,
  initialDimensions = [],
  initialVariants = [],
  onSaveSuccess,
}: VariantsSectionProps) {
  // ── Dimensions ──────────────────────────────────────────────────────────
  const [dimensions, setDimensions] = useState<string[]>(initialDimensions);
  const [dimInput, setDimInput] = useState("");

  // ── Options per dimension ────────────────────────────────────────────────
  // e.g. { Couleur: ["Rouge", "Bleu"], Taille: ["S", "M", "L"] }
  const [dimOptions, setDimOptions] = useState<Record<string, string[]>>({});
  const [optionInput, setOptionInput] = useState<Record<string, string>>({});

  // ── Variant rows (auto-generated from combinations) ──────────────────────
  const [variants, setVariants] = useState<VariantRow[]>([]);

  // ── Error / status ────────────────────────────────────────────────────────
  const [formError, setFormError] = useState<string | null>(null);

  const upsertMutation = api.catalogue.upsertVariants.useMutation({
    onSuccess: () => {
      onSaveSuccess?.();
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  const deleteMutation = api.catalogue.deleteVariants.useMutation({
    onSuccess: () => {
      setDimensions([]);
      setDimOptions({});
      setVariants([]);
      onSaveSuccess?.();
    },
    onError: (err) => setFormError(err.message),
  });

  // Bootstrap from props when opening an existing item
  useEffect(() => {
    if (initialDimensions.length > 0 && initialVariants.length > 0) {
      setDimensions(initialDimensions);
      // Reconstruct options from existing variants
      const opts: Record<string, string[]> = {};
      for (const dim of initialDimensions) {
        const vals = [...new Set(initialVariants.map((v) => v.values[dim]).filter(Boolean) as string[])];
        opts[dim] = vals;
      }
      setDimOptions(opts);
      setVariants(
        initialVariants.map((v) => ({
          key: v.id,
          label: v.label,
          values: v.values as Record<string, string>,
          quantity: v.availableQty, // use availableQty for editing
        }))
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Regenerate combinations whenever dims or options change
  const regenerateCombinations = (dims: string[], opts: Record<string, string[]>) => {
    const combos = generateCombinations(dims, opts);
    setVariants((prev) =>
      combos.map((c) => {
        // Preserve quantity if this combination already existed
        const existing = prev.find((p) => p.label === c.label);
        return existing ? { ...c, quantity: existing.quantity } : c;
      })
    );
  };

  // ── Dimension management ─────────────────────────────────────────────────
  const addDimension = () => {
    const dim = dimInput.trim();
    if (!dim || dimensions.includes(dim) || dimensions.length >= 3) return;
    const newDims = [...dimensions, dim];
    setDimensions(newDims);
    setDimInput("");
    setDimOptions((prev) => ({ ...prev, [dim]: [] }));
    regenerateCombinations(newDims, { ...dimOptions, [dim]: [] });
  };

  const removeDimension = (dim: string) => {
    const newDims = dimensions.filter((d) => d !== dim);
    const newOpts = { ...dimOptions };
    delete newOpts[dim];
    setDimensions(newDims);
    setDimOptions(newOpts);
    regenerateCombinations(newDims, newOpts);
  };

  // ── Option management ────────────────────────────────────────────────────
  const addOption = (dim: string) => {
    const val = (optionInput[dim] ?? "").trim();
    if (!val) return;
    const current = dimOptions[dim] ?? [];
    if (current.includes(val)) return;
    const newOpts = { ...dimOptions, [dim]: [...current, val] };
    setDimOptions(newOpts);
    setOptionInput((prev) => ({ ...prev, [dim]: "" }));
    regenerateCombinations(dimensions, newOpts);
  };

  const removeOption = (dim: string, val: string) => {
    const newOpts = { ...dimOptions, [dim]: (dimOptions[dim] ?? []).filter((v) => v !== val) };
    setDimOptions(newOpts);
    regenerateCombinations(dimensions, newOpts);
  };

  // ── Quantity editing ─────────────────────────────────────────────────────
  const setQuantity = (key: string, qty: number) => {
    setVariants((prev) =>
      prev.map((v) => (v.key === key ? { ...v, quantity: Math.max(0, qty) } : v))
    );
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = () => {
    setFormError(null);
    if (dimensions.length === 0) {
      setFormError("Ajoutez au moins une dimension.");
      return;
    }
    if (variants.length === 0) {
      setFormError("Aucune variante générée. Ajoutez des valeurs à vos dimensions.");
      return;
    }
    upsertMutation.mutate({
      catalogueItemId,
      dimensions,
      variants: variants.map((v) => ({
        label: v.label,
        values: v.values,
        quantity: v.quantity,
      })),
    });
  };

  const totalStock = variants.reduce((s, v) => s + v.quantity, 0);
  const isSubmitting = upsertMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Variantes</span>
        {variants.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {variants.length} combinaison{variants.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* ── Step 1 : Dimensions ──────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          1. Dimensions (max 3)
        </Label>
        <div className="flex flex-wrap gap-2">
          {dimensions.map((dim) => (
            <Badge key={dim} variant="outline" className="gap-1.5 pr-1.5">
              {dim}
              <button
                type="button"
                onClick={() => removeDimension(dim)}
                className="rounded-full hover:bg-destructive/10 p-0.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        {dimensions.length < 3 && (
          <div className="flex gap-2">
            <Input
              value={dimInput}
              onChange={(e) => setDimInput(e.target.value)}
              placeholder="ex: Taille"
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDimension(); } }}
            />
            <Button type="button" size="sm" variant="outline" onClick={addDimension}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* ── Step 2 : Options per dimension ──────────────────────────────── */}
      {dimensions.length > 0 && (
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            2. Valeurs par dimension
          </Label>
          {dimensions.map((dim) => (
            <div key={dim} className="space-y-1.5">
              <p className="text-xs font-medium">{dim}</p>
              <div className="flex flex-wrap gap-1.5">
                {(dimOptions[dim] ?? []).map((val) => (
                  <Badge key={val} variant="secondary" className="gap-1 pr-1">
                    {val}
                    <button
                      type="button"
                      onClick={() => removeOption(dim, val)}
                      className="rounded-full p-0.5 hover:text-destructive transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={optionInput[dim] ?? ""}
                  onChange={(e) => setOptionInput((prev) => ({ ...prev, [dim]: e.target.value }))}
                  placeholder={`ex: S, M, L…`}
                  className="h-7 text-xs"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(dim); } }}
                />
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => addOption(dim)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Step 3 : Stock per combination ──────────────────────────────── */}
      {variants.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            3. Stock par variante
          </Label>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs h-8">Variante</TableHead>
                  <TableHead className="text-xs h-8 text-right w-24">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.key} className="h-9">
                    <TableCell className="py-1 text-sm">{v.label}</TableCell>
                    <TableCell className="py-1 text-right">
                      <Input
                        type="number"
                        min={0}
                        value={v.quantity}
                        onChange={(e) => setQuantity(v.key, parseInt(e.target.value, 10) || 0)}
                        className="h-7 w-20 text-right text-xs ml-auto"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Stock total : <strong>{totalStock}</strong>
          </p>
        </div>
      )}

      {/* ── Errors ──────────────────────────────────────────────────────── */}
      {formError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        {variants.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
            disabled={isSubmitting}
            onClick={() => deleteMutation.mutate({ catalogueItemId })}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Supprimer toutes les variantes
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={isSubmitting || variants.length === 0}
          onClick={handleSave}
        >
          {isSubmitting ? <Spinner className="h-4 w-4 mr-2" /> : null}
          Enregistrer les variantes
        </Button>
      </div>
    </div>
  );
}
