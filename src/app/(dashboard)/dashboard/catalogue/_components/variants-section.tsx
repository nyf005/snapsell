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

  const totalStock = variants.reduce((s, v) => s + v.quantity, 0);
  const isSubmitting = upsertMutation.isPending || deleteMutation.isPending;

  // ── Pagination ────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const totalPages = Math.ceil(variants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pagedVariants = variants.slice(startIndex, startIndex + itemsPerPage);

  // Reset to page 1 if variants length changes
  useEffect(() => {
    setCurrentPage(1);
  }, [variants.length]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Configuration des Variantes</h3>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Options & Stock</p>
          </div>
        </div>
        {variants.length > 0 && (
          <Badge variant="secondary" className="bg-indigo-500/5 text-indigo-600 border-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold">
            {variants.length} COMBINAISONS
          </Badge>
        )}
      </div>

      {/* STEP 1: ATTRIBUTES */}
      <div className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-500/80">
          <Settings2 className="h-3.5 w-3.5" />
          1. Définir les attributs (Couleur, Taille...)
        </div>
        
        <div className="flex flex-wrap gap-2">
          {dimensions.map((dim, idx) => (
            <Badge 
              key={dim} 
              variant="secondary" 
              className={cn(
                "pl-3 pr-1 py-1 gap-2 border-transparent transition-all hover:border-indigo-500/30",
                idx === 0 ? "bg-indigo-500/10 text-indigo-600" : 
                idx === 1 ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              )}
            >
              <span className="text-[11px] font-bold uppercase">{dim}</span>
              <button
                type="button"
                onClick={() => removeDimension(dim)}
                className="rounded-md hover:bg-black/5 p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {dimensions.length < 3 && (
            <div className="relative flex-1 min-w-[150px]">
              <Input
                value={dimInput}
                onChange={(e) => setDimInput(e.target.value)}
                placeholder={dimensions.length === 0 ? "Ajouter un attribut (ex: Taille)" : "Autre attribut..."}
                className="h-8 text-xs bg-background/50 border-dashed focus-visible:ring-indigo-500"
                onKeyDown={(e) => { 
                  if (e.key === "Enter") { 
                    e.preventDefault(); 
                    addDimension(); 
                  } 
                }}
              />
              <Plus className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/30" />
            </div>
          )}
        </div>
      </div>

      {/* STEP 2: OPTIONS */}
      {dimensions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dimensions.map((dim, idx) => (
            <div key={dim} className="flex flex-col p-4 rounded-xl border border-border/40 bg-background/50 space-y-3">
              <label className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter flex items-center gap-2">
                <div className={cn("w-1.5 h-1.5 rounded-full", 
                  idx === 0 ? "bg-indigo-500" : idx === 1 ? "bg-emerald-500" : "bg-amber-500"
                )} />
                Options pour {dim}
              </label>
              
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {(dimOptions[dim] ?? []).map((val) => (
                  <Badge key={val} variant="outline" className="text-[10px] font-medium bg-muted/30 px-2 py-0.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 transition-all cursor-default group">
                    {val}
                    <X className="ml-1 h-3 w-3 opacity-30 group-hover:opacity-100 cursor-pointer" onClick={() => removeOption(dim, val)} />
                  </Badge>
                ))}
              </div>

              <div className="relative">
                <Input
                  value={optionInput[dim] ?? ""}
                  onChange={(e) => setOptionInput((prev) => ({ ...prev, [dim]: e.target.value }))}
                  placeholder="Valeur + Entrée"
                  className="h-7 text-[11px] pr-8 focus-visible:ring-indigo-500 border-indigo-500/20"
                  onKeyDown={(e) => { 
                    if (e.key === "Enter") { 
                      e.preventDefault(); 
                      addOption(dim); 
                    } 
                  }}
                />
                <ArrowRight className="absolute right-2 top-1.5 h-4 w-4 text-indigo-500/20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* STEP 3: VARIANT GRID */}
      {variants.length > 0 && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
            <Label className="text-xs font-bold text-indigo-500/80 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 fill-indigo-500" />
              Saisie rapide du stock
            </Label>
            
            <div className="flex items-center gap-2 bg-emerald-500/5 p-1 rounded-lg border border-emerald-500/10">
              <Input
                type="number"
                placeholder="Qté"
                value={bulkQty}
                onChange={(e) => setBulkQty(e.target.value)}
                className="h-7 w-16 text-xs text-center focus-visible:ring-emerald-500 bg-background border-transparent"
              />
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[10px] font-black uppercase border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-700 text-emerald-600 transition-all px-3"
                onClick={applyBulkQuantity}
              >
                Appliquer à tous
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-[10px] font-bold uppercase h-9 px-4">Variante</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase h-9 text-right w-32 px-4">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedVariants.map((v) => (
                  <TableRow key={v.key} className="h-11 hover:bg-indigo-500/[0.02] transition-colors group">
                    <TableCell className="py-2 px-4 text-xs font-medium">
                      <div className="flex items-center gap-2">
                        {v.label.split(" / ").map((part, i) => (
                          <span key={i} className="flex items-center gap-2">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px] font-bold",
                              i === 0 ? "bg-indigo-500/5 text-indigo-600" :
                              i === 1 ? "bg-emerald-500/5 text-emerald-600" : "bg-amber-500/5 text-amber-600"
                            )}>{part}</span>
                            {i < v.label.split(" / ").length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 px-4 text-right">
                      <div className="flex items-center justify-end gap-2 transition-transform">
                        {v.quantity > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 animate-in zoom-in duration-300" />}
                        <Input
                          type="number"
                          min={0}
                          value={v.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10) || 0;
                            setVariants(prev => prev.map(rv => rv.key === v.key ? { ...rv, quantity: Math.max(0, val) } : rv));
                          }}
                          className="h-8 w-20 text-right text-xs bg-muted/20 font-mono focus-visible:bg-background transition-colors"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-t border-border/40">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                  Page <span className="text-foreground font-bold">{currentPage}</span> sur <span className="text-foreground font-bold">{totalPages}</span>
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="h-7 px-3 text-[10px] font-bold uppercase"
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="h-7 px-3 text-[10px] font-bold uppercase"
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-between items-center px-1">
            <p className="text-[10px] text-muted-foreground font-medium italic">
              * La modification de la quantité est sauvegardée automatiquement localement.
            </p>
            <p className="text-[11px] font-black text-muted-foreground uppercase tracking-tight">
              STOCK TOTAL : <span className="text-indigo-600 ml-1 text-sm">{totalStock.toLocaleString()} UNITES</span>
            </p>
          </div>
        </div>
      )}

      {/* ERRORS/FEEDBACK */}
      {formError && (
        <div className="flex items-center gap-3 rounded-xl bg-destructive/5 border border-destructive/20 p-4 text-xs text-destructive animate-in shake-in duration-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-semibold">{formError}</span>
        </div>
      )}

      {/* ACTIONS FOOTER */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border/40">
        {variants.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase tracking-wider"
            disabled={isSubmitting}
            onClick={() => deleteMutation.mutate({ catalogueItemId })}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Réinitialiser l'article
          </Button>
        )}
        
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            type="button"
            size="lg"
            className="flex-1 sm:flex-none h-11 px-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/30 transition-all hover:translate-y-[-1px] active:translate-y-[1px]"
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
