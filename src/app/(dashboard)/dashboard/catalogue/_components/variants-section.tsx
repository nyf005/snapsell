"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DataPagination } from "~/components/ui/data-pagination";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type VariantRow = {
  key: string;
  label: string;
  quantity: number;
};

type VariantsSectionProps = {
  initialDimensions?: string[];
  initialVariants?: Array<{
    id: string;
    label: string;
    values: Record<string, string>;
    quantity: number;
    availableQty: number;
    reservedQty: number;
  }>;
  onChange?: (payload: {
    dimensions: string[];
    variants: Array<{
      label: string;
      values: Record<string, string>;
      quantity: number;
    }>;
    isValid: boolean;
  }) => void;
};

const PLACEHOLDER_DIMENSION_PATTERN = /^Dim\d+$/i;

function normalizeVariantLabel(label: string) {
  return label
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

function buildValuesFromLabel(label: string, dimensions: string[]) {
  const parts = normalizeVariantLabel(label).split(" / ").filter(Boolean);
  return Object.fromEntries(parts.map((part, index) => [dimensions[index] ?? `Option ${index + 1}`, part]));
}

function inferDimensions(labels: string[], initialDimensions: string[]) {
  const normalized = initialDimensions.filter(Boolean);
  const maxParts = labels.reduce((max, label) => {
    const partCount = normalizeVariantLabel(label).split(" / ").filter(Boolean).length;
    return Math.max(max, partCount);
  }, 0);

  if (maxParts === 0) {
    return normalized.length > 0 ? normalized : [];
  }

  return Array.from({ length: maxParts }, (_, index) => {
    const existing = normalized[index];
    if (!existing || PLACEHOLDER_DIMENSION_PATTERN.test(existing)) {
      return `Option ${index + 1}`;
    }
    return existing;
  });
}

export function VariantsSection({
  initialDimensions = [],
  initialVariants = [],
  onChange,
}: VariantsSectionProps) {
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const lastEmittedPayloadRef = useRef<string | null>(null);

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        dimensions: initialDimensions,
        variants: initialVariants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          availableQty: variant.availableQty,
        })),
      }),
    [initialDimensions, initialVariants],
  );

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(variants.length / itemsPerPage));
  const pagedVariants = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return variants.slice(startIndex, startIndex + itemsPerPage);
  }, [currentPage, variants]);

  const effectiveDimensions = useMemo(
    () => inferDimensions(variants.map((variant) => variant.label), initialDimensions),
    [initialDimensions, variants],
  );

  const dimensionHint =
    effectiveDimensions.length > 0 ? effectiveDimensions.join(" / ") : "Rouge / S";

  useEffect(() => {
    setVariants(
      initialVariants.map((variant, index) => ({
        key: variant.id ?? `${variant.label}-${index}`,
        label: normalizeVariantLabel(variant.label),
        quantity: variant.availableQty,
      })),
    );
  }, [initialSnapshot, initialVariants]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const addVariant = () => {
    setVariants((previous) => [
      ...previous,
      {
        key: `draft-${crypto.randomUUID()}`,
        label: "",
        quantity: 0,
      },
    ]);
    setFormError(null);
  };

  const totalStock = variants.reduce((sum, variant) => sum + variant.quantity, 0);
  
  useEffect(() => {
    const cleanedVariants = variants
      .map((variant) => ({
        ...variant,
        label: normalizeVariantLabel(variant.label),
      }))
      .filter((variant) => variant.label.length > 0);

    if (cleanedVariants.length === 0) {
      setFormError(null);
      const payload = {
        dimensions: [],
        variants: [],
        isValid: true,
      };
      const nextSignature = JSON.stringify(payload);
      if (lastEmittedPayloadRef.current !== nextSignature) {
        lastEmittedPayloadRef.current = nextSignature;
        onChange?.(payload);
      }
      return;
    }

    const segmentCounts = cleanedVariants.map(
      (variant) => variant.label.split(" / ").filter(Boolean).length,
    );
    const uniqueSegmentCounts = new Set(segmentCounts);

    if (uniqueSegmentCounts.size > 1) {
      setFormError("Toutes les variantes doivent suivre le meme format de libelle.");
      const payload = {
        dimensions: [],
        variants: [],
        isValid: false,
      };
      const nextSignature = JSON.stringify(payload);
      if (lastEmittedPayloadRef.current !== nextSignature) {
        lastEmittedPayloadRef.current = nextSignature;
        onChange?.(payload);
      }
      return;
    }

    const duplicateLabels = new Set<string>();
    const seenLabels = new Set<string>();
    for (const variant of cleanedVariants) {
      const key = variant.label.toLowerCase();
      if (seenLabels.has(key)) {
        duplicateLabels.add(variant.label);
      }
      seenLabels.add(key);
    }

    if (duplicateLabels.size > 0) {
      setFormError("Chaque variante doit avoir un libelle unique.");
      const payload = {
        dimensions: [],
        variants: [],
        isValid: false,
      };
      const nextSignature = JSON.stringify(payload);
      if (lastEmittedPayloadRef.current !== nextSignature) {
        lastEmittedPayloadRef.current = nextSignature;
        onChange?.(payload);
      }
      return;
    }

    const dimensions = inferDimensions(
      cleanedVariants.map((variant) => variant.label),
      initialDimensions,
    );

    setFormError(null);
    const payload = {
      dimensions,
      variants: cleanedVariants.map((variant) => ({
        label: variant.label,
        values: buildValuesFromLabel(variant.label, dimensions),
        quantity: variant.quantity,
      })),
      isValid: true,
    };
    const nextSignature = JSON.stringify(payload);
    if (lastEmittedPayloadRef.current !== nextSignature) {
      lastEmittedPayloadRef.current = nextSignature;
      onChange?.(payload);
    }
  }, [initialDimensions, onChange, variants]);

  return (
    <div className="space-y-4">
      <Card className="gap-0 overflow-hidden rounded-2xl border-border py-0 shadow-sm">
        <CardHeader className="py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Stock par variante</CardTitle>
              <p className="text-sm text-muted-foreground">
                Une ligne = un libelle vendeur + sa quantite.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Stock total</span>
              <span className="text-base font-semibold">{totalStock}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variante</TableHead>
                <TableHead className="w-36 text-right">Stock</TableHead>
                <TableHead className="w-16 text-right">Suppr.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedVariants.length > 0 ? (
                pagedVariants.map((variant) => (
                  <TableRow key={variant.key}>
                    <TableCell className="py-3">
                      <Input
                        value={variant.label}
                        onChange={(event) => {
                          const nextLabel = event.target.value;
                          setVariants((previous) =>
                            previous.map((row) =>
                              row.key === variant.key ? { ...row, label: nextLabel } : row,
                            ),
                          );
                        }}
                        className="h-10"
                        placeholder={dimensionHint}
                      />
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {variant.quantity > 0 ? (
                          <CheckCircle2 className="size-4 text-success" />
                        ) : null}
                        <Input
                          type="number"
                          min={0}
                          value={variant.quantity}
                          onChange={(event) => {
                            const value = Number.parseInt(event.target.value, 10);
                            setVariants((previous) =>
                              previous.map((row) =>
                                row.key === variant.key
                                  ? { ...row, quantity: Number.isNaN(value) ? 0 : Math.max(0, value) }
                                  : row,
                              ),
                            );
                          }}
                          className="h-10 w-24 text-right"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setVariants((previous) =>
                            previous.filter((row) => row.key !== variant.key),
                          );
                          setFormError(null);
                        }}
                        aria-label={`Supprimer ${variant.label || "la variante"}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    Aucune variante pour le moment.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>
              <Plus className="size-4" />
              Ajouter une variante
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={variants.length === 0}
              onClick={() => {
                setVariants([]);
                setCurrentPage(1);
                setFormError(null);
              }}
            >
              Réinitialiser les variantes
            </Button>
          </div>

          <DataPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={variants.length}
            pageSize={itemsPerPage}
            itemLabel={`variante${variants.length > 1 ? "s" : ""}`}
            onPageChange={setCurrentPage}
          />
        </CardContent>
      </Card>

      {formError ? (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </div>
      ) : null}
    </div>
  );
}
