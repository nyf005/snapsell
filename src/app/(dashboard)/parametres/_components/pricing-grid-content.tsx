"use client";

import { useCallback, useMemo, useState } from "react";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "~/components/ui/card";
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { Spinner } from "~/components/ui/spinner";
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

const CATEGORY_DOT_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
  "bg-cyan-500",
];

type LocalRow = {
  id: string;
  categoryLetter: string;
  amountCents: number;
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
  amountCents: 0,
  description: "",
};

function rowToItem(r: {
  categoryLetter: string;
  amountCents: number;
  description?: string;
}) {
  return {
    categoryLetter: r.categoryLetter.trim(),
    amountCents: r.amountCents,
    description: r.description,
  };
}

export function PricingGridContent() {
  const [page, setPage] = useState(0);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyAddForm);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: serverRows = [], isLoading } = api.settings.getCategoryPrices.useQuery();
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
        amountCents: r.amountCents,
        description: r.description,
        updatedAt: r.updatedAt,
      })),
    [serverRows]
  );

  const addRowFromModal = useCallback(() => {
    const code = addForm.categoryLetter.trim();
    if (!code) return;
    const currentItems = serverRows
      .filter((r) => r.categoryLetter.trim() !== "")
      .map(rowToItem);
    const newItem = {
      categoryLetter: code,
      amountCents: addForm.amountCents,
      description: addForm.description.trim() || undefined,
    };
    setCategoryPrices.mutate(
      { items: [...currentItems, newItem] },
      {
        onSuccess: () => {
          setOpenAddModal(false);
          setAddForm(emptyAddForm);
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
        amountCents: row.amountCents,
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
              amountCents: editForm.amountCents,
              description: editForm.description.trim() || undefined,
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
      ? displayRows.reduce((s, r) => s + r.amountCents, 0) / totalCategories
      : 0;
  const lastUpdated =
    displayRows.length > 0
      ? displayRows.reduce(
          (max, r) => (r.updatedAt > max ? r.updatedAt : max),
          displayRows[0]!.updatedAt
        )
      : null;

  const paginated = useMemo(() => {
    const start = page * PAGE_SIZE;
    return displayRows.slice(start, start + PAGE_SIZE);
  }, [displayRows, page]);
  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE) || 1;
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
      <div className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
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
            if (!open) setAddForm(emptyAddForm);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle catégorie</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Saisissez le code de la catégorie, le prix et une description optionnelle.
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
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, categoryLetter: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-price">Prix ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="add-price"
                    type="text"
                    inputMode="decimal"
                    className="pl-8"
                    placeholder="0.00"
                    value={
                      addForm.amountCents === 0 ? "" : (addForm.amountCents / 100).toFixed(2)
                    }
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      const num = parseFloat(v);
                      setAddForm((f) => ({
                        ...f,
                        amountCents: Number.isNaN(num) ? 0 : Math.round(num * 100),
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-desc">Description (optionnel)</Label>
                <Input
                  id="add-desc"
                  placeholder="Description optionnelle"
                  value={addForm.description}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenAddModal(false)}>
                Annuler
              </Button>
              <Button
                onClick={addRowFromModal}
                disabled={!addForm.categoryLetter.trim() || isPending}
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
                <Label htmlFor="edit-price">Prix ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="edit-price"
                    type="text"
                    inputMode="decimal"
                    className="pl-8"
                    placeholder="0.00"
                    value={
                      editForm.amountCents === 0 ? "" : (editForm.amountCents / 100).toFixed(2)
                    }
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9.]/g, "");
                      const num = parseFloat(v);
                      setEditForm((f) => ({
                        ...f,
                        amountCents: Number.isNaN(num) ? 0 : Math.round(num * 100),
                      }));
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-desc">Description (optionnel)</Label>
                <Input
                  id="edit-desc"
                  placeholder="Description optionnelle"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
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
                disabled={!editForm.categoryLetter.trim() || isPending}
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
          <Card className="border-border transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Layers className="size-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total des catégories
                </CardDescription>
                <p className="text-xl font-bold tabular-nums md:text-2xl">
                  {totalCategories}
                </p>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-border transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <DollarSign className="size-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Prix moyen
                </CardDescription>
                <p className="text-xl font-bold tabular-nums md:text-2xl">
                  {(avgCents / 100).toFixed(2)} $
                </p>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-border transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Clock className="size-5" />
              </div>
              <div className="min-w-0 space-y-0.5">
                <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dernière MAJ
                </CardDescription>
                <p className="text-xl font-bold md:text-2xl">
                  {lastUpdated ? formatDate(lastUpdated) : "—"}
                </p>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Table */}
        <Card className="overflow-hidden border-border pb-0 pt-0 shadow-sm rounded-2xl">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Spinner className="size-8" />
              <span className="text-sm">Chargement…</span>
            </div>
          ) : (
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
                        <EmptyContent>
                          <Button onClick={() => setOpenAddModal(true)} className="gap-2" size="sm">
                            <Plus className="size-4" />
                            Ajouter une catégorie
                          </Button>
                        </EmptyContent>
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
                        {row.amountCents === 0
                          ? "—"
                          : `${(row.amountCents / 100).toFixed(2)} $`}
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
          )}
          {!isLoading && displayRows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
              <p className="text-xs text-muted-foreground">
                {paginated.length} sur {displayRows.length} catégories
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 0) setPage((p) => p - 1);
                      }}
                      className={cn(page === 0 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < totalPages - 1) setPage((p) => p + 1);
                      }}
                      className={cn(page >= totalPages - 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
