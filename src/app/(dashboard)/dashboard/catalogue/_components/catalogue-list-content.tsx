"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { ErrorAlert } from "~/components/ui/error-alert";
import { formatError, formatXof, type UserError } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { SetupRequiredBanner } from "~/app/(dashboard)/_components/setup-required-banner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

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
import { Plus, Pencil, Trash2, PackageOpen, ImageOff, Send } from "lucide-react";
import { CatalogueItemFormDialog } from "./catalogue-item-form-dialog";
import { SendProductCardDialog } from "./send-product-card-dialog";
import { DashboardEmptyState } from "~/app/(dashboard)/_components/dashboard-empty-state";

import type { CatalogueItemOutput } from "~/server/api/routers/catalogue.schema";
import { getCatalogueOriginLabel, isLiveCatalogueOrigin } from "~/server/catalogue/origin";

export function CatalogueListContent() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogueItemOutput | null>(null);
  const [deletingItem, setDeletingItem] = useState<CatalogueItemOutput | null>(null);
  /** Article dont on envoie la fiche produit. `null` = dialogue fermé. */
  const [productCardItem, setProductCardItem] = useState<{ id: string; code: string } | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
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

  const { data: r2Status } = api.catalogue.r2Status.useQuery();
  const [deleteError, setDeleteError] = useState<UserError | null>(null);

  const deleteMutation = api.catalogue.delete.useMutation({
    onSuccess: () => {
      void refetch();
      setDeletingItem(null);
      setDeleteError(null);
    },
    onError: (err) => {
      setDeleteError(formatError(err, "catalogue"));
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
          <SetupRequiredBanner />
          <TaskPageHeader
            href="/dashboard/catalogue"
            description={
              <>
                Ces articles restent disponibles d’un live à l’autre. Ceux improvisés pendant un
                live sont suivis dans « Live du moment ».
                {items && items.length > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    {items.length} article{items.length > 1 ? "s" : ""} chargé{items.length > 1 ? "s" : ""}.
                  </span>
                )}
              </>
            }
            actions={
              <Button onClick={handleAddItem} className="w-full sm:w-auto">
                <Plus className="size-4" />
                Ajouter un article permanent
              </Button>
            }
          />

          {sentMessage ? (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-foreground"
            >
              <span>{sentMessage}</span>
              <Button variant="ghost" size="sm" onClick={() => setSentMessage(null)}>
                Fermer
              </Button>
            </div>
          ) : null}

          {isLoading ? (
            <CatalogueListSkeleton />
          ) : items && items.length > 0 ? (
            <div className="space-y-4">
              <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
                <CardContent className="p-0">
                  <DataList
                    items={items}
                    getKey={(item) => item.id}
                    label="Articles du catalogue"
                    columns={[
                      {
                        id: "photo",
                        header: "Photo",
                        role: "hiddenOnMobile",
                        headerClassName: "w-16",
                        className: "px-3 py-2",
                        cell: (item) =>
                          item.mediaStorageKey ? (
                            <a
                              href={`/api/catalogue/${item.id}/photo`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative block size-10 overflow-hidden rounded-lg border border-border bg-muted"
                            >
                              <img
                                src={`/api/catalogue/${item.id}/photo`}
                                alt={`Photo ${item.code}`}
                                className="size-full object-cover"
                              />
                            </a>
                          ) : (
                            <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                              <ImageOff className="size-4" />
                            </div>
                          ),
                      },
                      {
                        id: "article",
                        header: "Article",
                        role: "primary",
                        cell: (item) => (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{item.code}</span>
                            {item.name && (
                              <span className="text-xs text-muted-foreground">{item.name}</span>
                            )}
                          </div>
                        ),
                      },
                      {
                        id: "price",
                        header: "Prix",
                        role: "secondary",
                        cell: (item) => formatXof(item.amount),
                      },
                      {
                        id: "quantity",
                        header: "Quantité totale",
                        role: "meta",
                        headerClassName: "text-right",
                        className: "text-right",
                        cell: (item) => item.quantity,
                      },
                      {
                        id: "available",
                        header: "Disponible",
                        role: "meta",
                        headerClassName: "text-right",
                        className: "text-right",
                        cell: (item) => (
                          <Badge variant={item.availableQty > 0 ? "default" : "secondary"}>
                            {item.availableQty}
                          </Badge>
                        ),
                      },
                      {
                        id: "reserved",
                        header: "Réservé",
                        role: "meta",
                        headerClassName: "text-right",
                        className: "text-right",
                        cell: (item) =>
                          item.reservedQty > 0 ? (
                            <Badge variant="outline">{item.reservedQty}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          ),
                      },
                      {
                        id: "origin",
                        header: "Origine",
                        role: "hiddenOnMobile",
                        cell: (item) => (
                          <Badge
                            variant={isLiveCatalogueOrigin(item.origin) ? "default" : "secondary"}
                          >
                            {getCatalogueOriginLabel(item.origin)}
                          </Badge>
                        ),
                      },
                    ]}
                    actions={(item) => (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditItem(item)}
                          aria-label={`Modifier l’article ${item.code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {/*
                          Visible seulement si l'article est synchronisé avec Meta :
                          `sendProductCard` le refuserait sinon, et proposer un
                          bouton qui échoue est pire que ne rien proposer.
                        */}
                        {item.syncedToMeta ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setProductCardItem({ id: item.id, code: item.code })}
                            aria-label={`Envoyer la fiche de l’article ${item.code}`}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item)}
                          disabled={item.reservedQty > 0}
                          aria-label={`Supprimer l’article ${item.code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  />
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

      <SendProductCardDialog
        item={productCardItem}
        onOpenChange={(open) => !open && setProductCardItem(null)}
        onSent={(message) => {
          setSentMessage(message);
          setTimeout(() => setSentMessage(null), 4000);
        }}
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
          {deleteError && <ErrorAlert error={deleteError} />}
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
