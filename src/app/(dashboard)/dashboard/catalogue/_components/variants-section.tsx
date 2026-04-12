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
import { 
  Plus, 
  Trash2, 
  Layers, 
  X, 
  AlertTriangle, 
  Settings2, 
  ArrowRight,
  Zap,
  CheckCircle2
} from "lucide-react";
import { cn } from "~/lib/utils";

type VariantRow = {
  key: string; 
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

function generateCombinations(dims: string[], options: Record<string, string[]>): VariantRow[] {
  if (dims.length === 0) return [];
  const [first, ...rest] = dims;
  if (!first) return [];
  const firstVals = options[first] ?? [];
  if (firstVals.length === 0) return rest.length > 0 ? generateCombinations(rest, options) : [];
  
  if (rest.length === 0) {
    return firstVals.map((v) => ({
      key: v,
      label: v,
      values: { [first]: v },
      quantity: 0,
    }));
  }
  
  const subCombos = generateCombinations(rest, options);
  if (subCombos.length === 0) {
    return firstVals.map((v) => ({
      key: v,
      label: v,
      values: { [first]: v },
      quantity: 0,
    }));
  }

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
  const [dimensions, setDimensions] = useState<string[]>(initialDimensions);
  const [dimInput, setDimInput] = useState("");
  const [dimOptions, setDimOptions] = useState<Record<string, string[]>>({});
  const [optionInput, setOptionInput] = useState<Record<string, string>>({});
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [bulkQty, setBulkQty] = useState<string>("");

  const upsertMutation = api.catalogue.upsertVariants.useMutation({
    onSuccess: () => onSaveSuccess?.(),
    onError: (err) => setFormError(err.message),
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

  useEffect(() => {
    if (initialDimensions.length > 0 && initialVariants.length > 0) {
      setDimensions(initialDimensions);
      const opts: Record<string, string[]> = {};
      for (const dim of initialDimensions) {
        opts[dim] = [...new Set(initialVariants.map((v) => v.values[dim]).filter(Boolean) as string[])];
      }
      setDimOptions(opts);
      setVariants(
        initialVariants.map((v) => ({
          key: v.id,
          label: v.label,
          values: v.values as Record<string, string>,
          quantity: v.availableQty,
        }))
      );
    }
  }, [initialDimensions, initialVariants]);

  const regenerateCombinations = (dims: string[], opts: Record<string, string[]>) => {
    const combos = generateCombinations(dims, opts);
    setVariants((prev) =>
      combos.map((c) => {
        const existing = prev.find((p) => p.label === c.label);
        return existing ? { ...c, quantity: existing.quantity } : c;
      })
    );
  };

  const addDimension = () => {
    const dim = dimInput.trim();
    if (!dim || dimensions.includes(dim) || dimensions.length >= 3) return;
    const newDims = [...dimensions, dim];
    setDimensions(newDims);
    setDimInput("");
    const newOpts = { ...dimOptions, [dim]: [] };
    setDimOptions(newOpts);
    regenerateCombinations(newDims, newOpts);
  };

  const removeDimension = (dim: string) => {
    const newDims = dimensions.filter((d) => d !== dim);
    const newOpts = { ...dimOptions };
    delete newOpts[dim];
    setDimensions(newDims);
    setDimOptions(newOpts);
    regenerateCombinations(newDims, newOpts);
  };

  const addOption = (dim: string) => {
    const val = (optionInput[dim] ?? "").trim();
    if (!val) return;
    const current = dimOptions[dim] ?? [];
    if (current.includes(val)) {
      setOptionInput((prev) => ({ ...prev, [dim]: "" }));
      return;
    }
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

  const applyBulkQuantity = () => {
    const qty = parseInt(bulkQty, 10);
    if (isNaN(qty)) return;
    setVariants((prev) => prev.map((v) => ({ ...v, quantity: Math.max(0, qty) })));
    setBulkQty("");
  };

  const handleSave = () => {
    setFormError(null);
    if (dimensions.length === 0) return setFormError("Définissez au moins un attribut (ex: Taille).");
    if (variants.length === 0) return setFormError("Ajoutez des options pour générer des variantes.");
    
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

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">Variantes</h3>
        </div>
        {variants.length > 0 && (
          <Badge variant="secondary">
            {variants.length} combinaisons
          </Badge>
        )}
      </div>

      {/* STEP 1: ATTRIBUTES */}
      <div className="space-y-4">
        <Label className="text-xs font-semibold">1. Définir les attributs (Couleur, Taille...)</Label>
        <div className="flex flex-wrap gap-2">
          {dimensions.map((dim) => (
            <Badge 
              key={dim} 
              variant="default"
              className="gap-2 pr-1"
            >
              {dim}
              <button
                type="button"
                onClick={() => removeDimension(dim)}
                className="rounded-full hover:bg-black/10 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {dimensions.length < 3 && (
            <div className="flex-1 min-w-[200px]">
              <Input
                value={dimInput}
                onChange={(e) => setDimInput(e.target.value)}
                placeholder="Ajouter un attribut..."
                className="h-8 text-xs"
                onKeyDown={(e) => { 
                  if (e.key === "Enter") { 
                    e.preventDefault(); 
                    addDimension(); 
                  } 
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* STEP 2: OPTIONS */}
      {dimensions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dimensions.map((dim) => (
            <div key={dim} className="space-y-2">
              <Label className="text-[10px] uppercase text-muted-foreground">{dim}</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                {(dimOptions[dim] ?? []).map((val) => (
                  <Badge key={val} variant="secondary" className="text-[10px] gap-1">
                    {val}
                    <X className="h-3 w-3 cursor-pointer opacity-50 hover:opacity-100" onClick={() => removeOption(dim, val)} />
                  </Badge>
                ))}
              </div>
              <Input
                value={optionInput[dim] ?? ""}
                onChange={(e) => setOptionInput((prev) => ({ ...prev, [dim]: e.target.value }))}
                placeholder="Valeur + Entrée"
                className="h-8 text-xs"
                onKeyDown={(e) => { 
                  if (e.key === "Enter") { 
                    e.preventDefault(); 
                    addOption(dim); 
                  } 
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* STEP 3: VARIANT GRID */}
      {variants.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Label className="text-xs font-semibold">2. Gérer le stock des variantes</Label>
            
            <div className="flex items-center gap-2 bg-muted p-1 rounded-md">
              <Input
                type="number"
                placeholder="Qté"
                value={bulkQty}
                onChange={(e) => setBulkQty(e.target.value)}
                className="h-7 w-16 text-xs text-center border-none bg-background shadow-none"
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[10px] font-bold uppercase transition-all"
                onClick={applyBulkQuantity}
              >
                Appliquer à tous
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9">Variante</TableHead>
                  <TableHead className="h-9 text-right w-32">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedVariants.map((v) => (
                  <TableRow key={v.key} className="group">
                    <TableCell className="py-2 text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        {v.label.split(" / ").map((part, i) => (
                          <span key={i} className="flex items-center gap-1.5">
                            <span className="font-semibold">{part}</span>
                            {i < v.label.split(" / ").length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {v.quantity > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                        <Input
                          type="number"
                          min={0}
                          value={v.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setVariants(prev => prev.map(rv => rv.key === v.key ? { ...rv, quantity: Math.max(0, val) } : rv));
                          }}
                          className="h-8 w-20 text-right text-xs"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border">
                <p className="text-[10px] text-muted-foreground">
                  Page {currentPage} sur {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="h-7 px-2 text-[10px]"
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="h-7 px-2 text-[10px]"
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center px-1">
            <p className="text-[10px] text-muted-foreground italic">
              * Sauvegardé automatiquement dans le formulaire
            </p>
            <p className="text-xs font-bold uppercase">
              Stock Total : <span className="text-primary">{totalStock.toLocaleString()}</span>
            </p>
          </div>
        </div>
      )}

      {/* ERRORS/FEEDBACK */}
      {formError && (
        <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          {formError}
        </div>
      )}

      {/* ACTIONS FOOTER */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
        {variants.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-[10px] font-bold uppercase"
            disabled={isSubmitting}
            onClick={() => deleteMutation.mutate({ catalogueItemId })}
          >
            Réinitialiser les variantes
          </Button>
        )}
        
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            type="button"
            size="lg"
            className="flex-1 sm:flex-none h-10 px-8"
            disabled={isSubmitting || variants.length === 0}
            onClick={handleSave}
          >
            {isSubmitting ? <Spinner className="h-4 w-4 mr-2" /> : <Zap className="h-4 w-4 mr-2 fill-current" />}
            Enregistrer le stock
          </Button>
        </div>
      </div>
    </div>
  );
}
