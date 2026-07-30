"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Clock, DollarSign, Layers, Pencil, Plus, Save, Trash2 } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
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
import { Card } from "~/components/ui/card";
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

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";

import { DataPagination } from "~/components/ui/data-pagination";
import { PricingGridSkeleton } from "./pricing-grid-skeletons";
import { api } from "~/trpc/react";
import { CodePricePreview } from "~/app/(dashboard)/_components/code-price-preview";
import { formatDateCompact, formatXof, ui } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import { ErrorAlert } from "~/components/ui/error-alert";
import { formatError, type UserError } from "~/lib/copy";
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

/**
 * Bandeau « Tester un code ».
 *
 * La règle code→prix est le mécanisme central du produit. Plutôt que de la décrire,
 * on laisse taper un code et voir le prix qui sera annoncé.
 */
function CodeTester() {
  const [testCode, setTestCode] = useState("");

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <Label htmlFor="code-tester" className="text-sm font-semibold">
        {ui.pricing.testTitle}
      </Label>
      <p className="mt-0.5 text-xs text-muted-foreground">{ui.pricing.testHint}</p>
      <Input
        id="code-tester"
        value={testCode}
        onChange={(event) => setTestCode(event.target.value)}
        placeholder="ex. A12"
        className="mt-2 max-w-xs"
        autoComplete="off"
      />
      <CodePricePreview code={testCode} />
    </div>
  );
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
  const [saveError, setSaveError] = useState<UserError | null>(null);
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

  const utils = api.useUtils();
  const setCategoryPrices = api.settings.setCategoryPrices.useMutation({
    onSuccess: () => {
      setSaveError(null);
      void utils.settings.getCategoryPrices.invalidate();
    },
    onError: (err) => {
      setSaveError(formatError(err, "pricing"));
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
      <DashboardHeader />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-4 md:p-8">
        <TaskPageHeader
          href="/parametres/prix"
          actions={
            <Button onClick={() => setOpenAddModal(true)} className="w-full gap-2 font-semibold sm:w-auto">
              <Plus className="size-5" />
              Ajouter une catégorie
            </Button>
          }
        />

        <CodeTester />

        {saveError && <ErrorAlert error={saveError} />}

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
          <DialogContent variant="sheet-on-mobile" className="sm:max-w-md">
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
          <DialogContent variant="sheet-on-mobile" className="sm:max-w-md">
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
            value={formatXof(avgCents)}
            icon={DollarSign}
            iconVariant="success"
          />
          <KpiCard
            label="Dernière MAJ"
            value={lastUpdated ? formatDateCompact(lastUpdated) : "—"}
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
            <DataList
              items={paginated}
              getKey={(row) => row.id}
              label="Catégories de prix"
              columns={[
                {
                  id: "category",
                  header: "Catégorie",
                  role: "primary",
                  headerClassName:
                    "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  className: "px-6 py-4",
                  cell: (row) => (
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "size-2.5 shrink-0 rounded-full",
                          CATEGORY_DOT_COLORS[
                            paginated.indexOf(row) % CATEGORY_DOT_COLORS.length
                          ],
                        )}
                      />
                      <span className="text-sm font-medium">{row.categoryLetter || "—"}</span>
                    </div>
                  ),
                },
                {
                  id: "amount",
                  header: "Prix",
                  role: "secondary",
                  headerClassName:
                    "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  className: "px-6 py-4 text-sm tabular-nums",
                  cell: (row) => (row.amount === 0 ? "—" : formatXof(row.amount)),
                },
                {
                  id: "description",
                  header: "Description",
                  role: "meta",
                  headerClassName:
                    "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  className: "px-6 py-4 text-sm text-muted-foreground",
                  cell: (row) => row.description ?? "—",
                },
                {
                  id: "updated",
                  header: "Dernière MAJ",
                  role: "hiddenOnMobile",
                  headerClassName:
                    "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  className: "px-6 py-4 text-sm text-muted-foreground tabular-nums",
                  cell: (row) => formatDateCompact(row.updatedAt),
                },
              ]}
              actions={(row) => (
                <>
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
                </>
              )}
              empty={
                <Empty className="mx-auto max-w-sm border-0 p-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                      <Layers />
                    </EmptyMedia>
                    <EmptyTitle>Aucune catégorie</EmptyTitle>
                    <EmptyDescription>
                      Ajoutez des catégories (ex. A, Premium, AB) et définissez un prix pour
                      chacune.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              }
            />
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
