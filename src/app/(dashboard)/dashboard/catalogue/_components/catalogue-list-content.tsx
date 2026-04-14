"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Card, CardContent } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { DataPagination } from "~/components/ui/data-pagination";
import { CatalogueListSkeleton } from "./catalogue-skeletons";
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
import { Plus, Pencil, Trash2, PackageOpen, ImageOff } from "lucide-react";
import { CatalogueItemFormDialog } from "./catalogue-item-form-dialog";
import { DashboardEmptyState } from "~/app/(dashboard)/_components/dashboard-empty-state";
import { cn } from "~/lib/utils";

import type { CatalogueItemOutput } from "~/server/api/routers/catalogue.schema";
import { getCatalogueOriginLabel, isLiveCatalogueOrigin } from "~/server/catalogue/origin";

function formatPrice(amount: number | null): string {
  if (amount === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    minimumFractionDigits: 0,
  }).format(Math.round(amount / 100));
}

export function CatalogueListContent() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogueItemOutput | null>(null);
  const [deletingItem, setDeletingItem] = useState<CatalogueItemOutput | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedItems, setAccumulatedItems] = useState<CatalogueItemOutput[]>([]);
  const itemsPerPage = 20;

  const queryInput = useMemo(() => ({ limit: itemsPerPage, cursor }), [cursor]);

  const { data, isLoading, refetch } = api.catalogue.list.useQuery(queryInput);

  useEffect(() => {
    if (!data?.items) return;
    const items = data.items as CatalogueItemOutput[];
    if (!cursor) {
      setAccumulatedItems(items);
    } else {
      setAccumulatedItems((prev) => [...prev, ...items]);
    }
  }, [data?.items, cursor]);

  const items = useMemo(
    () =>
      (accumulatedItems ?? []).map((item) => ({
        ...item,
        attributes: Array.isArray(item.attributes)
          ? item.attributes.filter((value): value is string => typeof value === "string")
          : null,
      })),
    [accumulatedItems],
  );

  const nextCursor = data?.nextCursor;
  const hasMore = Boolean(nextCursor);

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const resetPagination = () => {
    setCursor(undefined);
    setAccumulatedItems([]);
  };

  const { data: r2Status } = api.catalogue.r2Status.useQuery();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = api.catalogue.delete.useMutation({
    onSuccess: () => {
      void refetch();
      setDeletingItem(null);
      setDeleteError(null);
    },
    onError: (err) => {
      setDeleteError(err.message);
    },
  });

  const handleAddItem = () => {
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const handleEditItem = (item: CatalogueItemOutput) => {
    setEditingItem(item);
    setIsFormOpen(true);
  };

  const handleDeleteItem = (item: CatalogueItemOutput) => {
    setDeletingItem(item);
  };

  const confirmDelete = () => {
    if (deletingItem) {
      deleteMutation.mutate({ id: deletingItem.id });
    }
  };

  const handleFormSuccess = () => {
    void refetch();
    setIsFormOpen(false);
    setEditingItem(null);
  };

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          {/* Page Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-black tracking-tight">Catalogue</h1>
              <p className="max-w-2xl text-muted-foreground">
                Gérez les articles de votre catalogue. Ces articles sont toujours
                commandables par code, en live ou après.
                {items && items.length > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    — {items.length} article{items.length > 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
            <Button onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un article
            </Button>
          </div>

          {isLoading ? (
            <CatalogueListSkeleton />
          ) : items && items.length > 0 ? (
            <div className="space-y-4">
              <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Photo</TableHead>
                        <TableHead>Article</TableHead>
                        <TableHead>Prix</TableHead>
                        <TableHead className="text-right">Quantité totale</TableHead>
                        <TableHead className="text-right">Disponible</TableHead>
                        <TableHead className="text-right">Réservé</TableHead>
                        <TableHead>Origine</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id} className="group">
                          <TableCell className="px-3 py-2">
                            {item.mediaStorageKey ? (
                              <a
                                href={`/api/catalogue/${item.id}/photo`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative block size-10 overflow-hidden rounded-lg border border-border bg-muted"
                              >
                                <img
                                  src={`/api/catalogue/${item.id}/photo`}
                                  alt={`Photo ${item.code}`}
                                  className="size-full object-cover opacity-0 transition-[opacity,transform] duration-300 group-hover:scale-110"
                                  onLoad={(e) => e.currentTarget.classList.replace("opacity-0", "opacity-100")}
                                />
                              </a>
                            ) : (
                              <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                                <ImageOff className="size-4" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{item.code}</span>
                              {item.name && (
                                <span className="text-xs text-muted-foreground">{item.name}</span>
                              )}
                              {item.syncedToMeta && (
                                <Badge variant="success" className="w-fit text-[10px] px-1.5 py-0">
                                  Meta ✓
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{formatPrice(item.amount)}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={item.availableQty > 0 ? "default" : "secondary"}>
                              {item.availableQty}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {item.reservedQty > 0 ? (
                              <Badge variant="outline">{item.reservedQty}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isLiveCatalogueOrigin(item.origin) ? "default" : "secondary"}>
                              {getCatalogueOriginLabel(item.origin)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditItem(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteItem(item)}
                                disabled={item.reservedQty > 0}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
                <DataPagination
                  totalItems={items.length}
                  pageSize={itemsPerPage}
                  itemLabel={`article${items.length > 1 ? "s" : ""}`}
                  onNext={loadMore}
                  hasNext={hasMore}
                  isLoading={isLoading}
                />
              </Card>
            </div>
          ) : (
            <DashboardEmptyState
              icon={PackageOpen}
              title="Aucun article dans le catalogue"
              description="Ajoutez votre premier article pour commencer à gérer votre inventaire et vos ventes."
              action={
                <Button onClick={handleAddItem} className="font-semibold">
                  Ajouter un article
                </Button>
              }
            />
          )}
        </div>
      </main>



      <CatalogueItemFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        item={editingItem}
        onSuccess={handleFormSuccess}
        r2Configured={r2Status?.configured ?? false}
      />

      <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'article{" "}
              <strong>{deletingItem?.code}</strong> ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteError(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
