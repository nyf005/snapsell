"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Bell,
  Clock,
  DollarSign,
  Layers,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import {
  Alert,
  AlertDescription,
} from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { KpiCard } from "~/components/ui/kpi-card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
import { DataPagination } from "~/components/ui/data-pagination";
import { PricingGridSkeleton } from "./pricing-grid-skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";

type PriceRowOutput = RouterOutputs["settings"]["getCategoryPrices"]["items"][number];

const CATEGORY_DOT_COLORS = [
  "bg-emerald-500",
  "bg-primary",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
];

type LocalRow = {
  id: string;
  categoryLetter: string;
  amount: number;
  description?: string;
  updatedAt: Date;
  isNew?: boolean;
};

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

const PAGE_SIZE = 10;

const emptyAddForm = {
  categoryLetter: "",
  amount: 0,
  description: "",
};

function rowToItem(r: {
  categoryLetter: string;
  amount: number;
  description?: string | null;
}) {
  return {
    categoryLetter: r.categoryLetter.trim(),
    amount: r.amount,
    description: r.description ?? undefined,
  };
}

export function PricingGridContent() {
  const [currentPage, setCurrentPage] = useState(1);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedRows, setAccumulatedRows] = useState<PriceRowOutput[]>([]);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyAddForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addFormError, setAddFormError] = useState<string | null>(null);

  const queryInput = useMemo(() => ({ limit: PAGE_SIZE, cursor }), [cursor]);

  const { data: data, isLoading } = api.settings.getCategoryPrices.useQuery(queryInput);

  useEffect(() => {
    if (!data?.items) return;
    const items = data.items as PriceRowOutput[];
    if (!cursor) {
      setAccumulatedRows(items);
    } else {
      setAccumulatedRows((prev) => [...prev, ...items]);
    }
  }, [data?.items, cursor]);

  const serverRows = accumulatedRows;
  const nextCursor = data?.nextCursor;
  const hasMore = Boolean(nextCursor);

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const resetPagination = () => {
    setCursor(undefined);
    setAccumulatedRows([]);
  };

  const utils = api.useUtils();
  const setCategoryPrices = api.settings.setCategoryPrices.useMutation({
    onSuccess: () => {
      setSaveError(null);
      void utils.settings.getCategoryPrices.invalidate();
    },
    onError: (err) => {
      setSaveError(err.message ?? "Erreur lors de l’enregistrement.");
    },
  });

  const displayRows: LocalRow[] = useMemo(
    () =>
      serverRows.map((r) => ({
        id: r.id,
        categoryLetter: r.categoryLetter,
        amount: r.amount,
        description: r.description,
        updatedAt: r.updatedAt,
      })),
    [serverRows]
  );

  const addRowFromModal = useCallback(() => {
    const code = addForm.categoryLetter.trim();
    if (!code) return;
    if (!addForm.description.trim()) return;

    const duplicate = serverRows.some(
      (r) => r.categoryLetter.trim().toLowerCase() === code.toLowerCase(),
    );
    if (duplicate) {
      setAddFormError(`La catégorie « ${code} » existe déjà.`);
      return;
    }
    setAddFormError(null);

    const currentItems = serverRows
      .filter((r) => r.categoryLetter.trim() !== "")
      .map(rowToItem);
    const newItem = {
      categoryLetter: code,
      amount: addForm.amount,
      description: addForm.description.trim(),
    };
    setCategoryPrices.mutate(
      { items: [...currentItems, newItem] },
      {
        onSuccess: () => {
          setOpenAddModal(false);
          setAddForm(emptyAddForm);
          setAddFormError(null);
        },
      }
    );
  }, [addForm, serverRows, setCategoryPrices]);

  const confirmDelete = useCallback(() => {
    if (!rowToDelete) return;
    const items = serverRows
      .filter((r) => r.id !== rowToDelete && r.categoryLetter.trim() !== "")
      .map(rowToItem);
    setCategoryPrices.mutate(
      { items },
      {
        onSuccess: () => setRowToDelete(null),
      }
    );
  }, [rowToDelete, serverRows, setCategoryPrices]);

  const openEditModal = useCallback(
    (row: LocalRow) => {
      setEditingRowId(row.id);
      setEditForm({
        categoryLetter: row.categoryLetter,
        amount: row.amount,
        description: row.description ?? "",
      });
    },
    []
  );

  const saveEditModal = useCallback(() => {
    if (!editingRowId) return;
    const code = editForm.categoryLetter.trim();
    if (!code) return;
    const items = serverRows
      .filter((r) => r.categoryLetter.trim() !== "")
      .map((r) =>
        r.id === editingRowId
          ? {
              categoryLetter: code,
              amount: editForm.amount,
              description: editForm.description.trim(),
            }
          : rowToItem(r)
      );
    setCategoryPrices.mutate(
      { items },
      {
        onSuccess: () => {
          setEditingRowId(null);
          setEditForm(emptyAddForm);
        },
      }
    );
  }, [editingRowId, editForm, serverRows, setCategoryPrices]);

  const totalCategories = displayRows.length;
  const avgCents =
    totalCategories > 0
      ? displayRows.reduce((s, r) => s + r.amount, 0) / totalCategories
      : 0;
  const lastUpdated =
    displayRows.length > 0
      ? displayRows.reduce(
          (max, r) => (r.updatedAt > max ? r.updatedAt : max),
          displayRows[0]!.updatedAt
        )
      : null;

  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE) || 1;
  const currentPageClamped = Math.min(Math.max(currentPage, 1), totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginated = useMemo(() => {
    const start = (currentPageClamped - 1) * PAGE_SIZE;
    return displayRows.slice(start, start + PAGE_SIZE);
  }, [displayRows, currentPageClamped]);

  const isPending = setCategoryPrices.isPending;

  return (
    <>
      <DashboardHeader
        right={
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
            <Bell className="size-5" />
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Grille de prix
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Définissez les montants par catégorie (A, B, C…) pour appliquer automatiquement les prix à votre catalogue.
            </p>
          </div>
          <Button onClick={() => setOpenAddModal(true)} className="gap-2 font-semibold shrink-0" size="default">
            <Plus className="size-5" />
            Ajouter une catégorie
          </Button>
        </div>

        {saveError && (
          <Alert variant="destructive" className="flex flex-row flex-wrap items-center justify-between gap-2">
            <AlertDescription className="flex flex-1 items-center justify-between gap-2">
              <span>{saveError}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1 text-destructive hover:bg-destructive/20"
                onClick={() => setSaveError(null)}
              >
                Fermer
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Modale Ajouter une catégorie */}
        <Dialog
          open={openAddModal}
          onOpenChange={(open) => {
            setOpenAddModal(open);
            if (!open) {
              setAddForm(emptyAddForm);
              setAddFormError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle catégorie</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Saisissez le code de la catégorie, le prix et une description (utilisée pour nommer automatiquement les articles).
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="add-category">Catégorie</Label>
                <Input
                  id="add-category"
                  placeholder="ex. A, Premium, AB"
                  value={addForm.categoryLetter}
                  maxLength={50}
                  className={addFormError ? "border-destructive focus-visible:ring-destructive" : ""}
                  onChange={(e) => {
                    setAddFormError(null);
                    setAddForm((f) => ({ ...f, categoryLetter: e.target.value }));
                  }}
                />
                {addFormError && (
                  <p className="text-xs text-destructive">{addFormError}</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-price">Prix (FCFA)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    F
                  </span>
                  <Input
                    id="add-price"
                    type="text"
                    inputMode="numeric"
                    className="pl-8"
                    placeholder="0"
                    value={
                      addForm.amount === 0 ? "" : (addForm.amount / 100).toString()
                    }
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      const num = parseInt(v, 10);
                      setAddForm((f) => ({
                        ...f,
                        amount: Number.isNaN(num) ? 0 : num * 100,
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-desc">Description</Label>
                <Input
                  id="add-desc"
                  placeholder="ex. Robes femme, Chaussures hommes"
                  value={addForm.description}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">Sert à nommer automatiquement les articles de cette catégorie.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAddModal(false)}>
                Annuler
              </Button>
              <Button
                onClick={addRowFromModal}
                disabled={!addForm.categoryLetter.trim() || !addForm.description.trim() || isPending}
                className="gap-2"
              >
                <Plus className="size-4" />
                {isPending ? "Enregistrement…" : "Ajouter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modale Modifier une catégorie */}
        <Dialog
          open={editingRowId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setEditingRowId(null);
              setEditForm(emptyAddForm);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier la catégorie</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Modifiez le code, le prix ou la description.
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Catégorie</Label>
                <Input
                  id="edit-category"
                  placeholder="ex. A, Premium, AB"
                  value={editForm.categoryLetter}
                  maxLength={50}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, categoryLetter: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-price">Prix (FCFA)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    F
                  </span>
                  <Input
                    id="edit-price"
                    type="text"
                    inputMode="numeric"
                    className="pl-8"
                    placeholder="0"
                    value={
                      editForm.amount === 0 ? "" : (editForm.amount / 100).toString()
                    }
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "");
                      const num = parseInt(v, 10);
                      setEditForm((f) => ({
                        ...f,
                        amount: Number.isNaN(num) ? 0 : num * 100,
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-desc">Description</Label>
                <Input
                  id="edit-desc"
                  placeholder="ex. Robes femme, Chaussures hommes"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">Sert à nommer automatiquement les articles de cette catégorie.</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingRowId(null);
                  setEditForm(emptyAddForm);
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={saveEditModal}
                disabled={!editForm.categoryLetter.trim() || !editForm.description.trim() || isPending}
                className="gap-2"
              >
                <Save className="size-4" />
                {isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmation suppression */}
        <AlertDialog open={rowToDelete !== null} onOpenChange={(open) => !open && setRowToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cette catégorie ?</AlertDialogTitle>
              <AlertDialogDescription>
                La catégorie sera retirée de la grille immédiatement.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={confirmDelete}
                disabled={isPending}
              >
                {isPending ? "Suppression…" : "Supprimer"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total des catégories"
            value={totalCategories}
            icon={Layers}
            iconVariant="primary"
          />
          <KpiCard
            label="Prix moyen"
            value={`${Math.round(avgCents / 100).toLocaleString("fr-FR")} FCFA`}
            icon={DollarSign}
            iconVariant="success"
          />
          <KpiCard
            label="Dernière MAJ"
            value={lastUpdated ? formatDate(lastUpdated) : "—"}
            icon={Clock}
            iconVariant="warning"
            valueClassName="text-xl font-bold md:text-2xl"
          />
        </div>

        {/* Table */}
        <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
          {isLoading ? (
            <div className="p-6">
              <PricingGridSkeleton />
            </div>
          ) : (
            <>
            <div className="min-h-0 flex-1 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Catégorie
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Prix
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Dernière MAJ
                  </TableHead>
                  <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="px-6 py-16 text-center"
                    >
                      <Empty className="mx-auto max-w-sm border-0 p-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                            <Layers />
                          </EmptyMedia>
                          <EmptyTitle>Aucune catégorie</EmptyTitle>
                          <EmptyDescription>
                            Ajoutez des catégories (ex. A, Premium, AB) et définissez un prix pour chacune.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((row, idx) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "border-border transition-colors hover:bg-muted/40",
                        idx % 2 === 1 && "bg-muted/20"
                      )}
                    >
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "size-2.5 shrink-0 rounded-full",
                              CATEGORY_DOT_COLORS[idx % CATEGORY_DOT_COLORS.length]
                            )}
                          />
                          <span className="text-sm font-medium">
                            {row.categoryLetter || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm tabular-nums">
                        {row.amount === 0
                          ? "—"
                          : `${Math.round(row.amount / 100).toLocaleString("fr-FR")} FCFA`}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                        {row.description ?? "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground tabular-nums">
                        {formatDate(row.updatedAt)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            aria-label="Modifier la catégorie"
                            onClick={() => openEditModal(row)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Supprimer la catégorie"
                            onClick={() => setRowToDelete(row.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            <DataPagination
              totalItems={displayRows.length}
              pageSize={PAGE_SIZE}
              itemLabel={`catégorie${displayRows.length > 1 ? "s" : ""}`}
              onNext={loadMore}
              hasNext={hasMore}
              isLoading={isLoading}
            />
            </>
          )}
        </Card>
      </div>
    </>
  );
}
