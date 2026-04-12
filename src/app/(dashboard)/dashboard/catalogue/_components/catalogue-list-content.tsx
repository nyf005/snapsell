"use client";

import { useState } from "react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
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

  const { data: items, isLoading, refetch } = api.catalogue.list.useQuery();
  const { data: r2Status } = api.catalogue.r2Status.useQuery();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  // ── Pagination ────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const totalItems = items?.length ?? 0;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pagedItems = items?.slice(startIndex, startIndex + itemsPerPage) ?? [];

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
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground custom-scrollbar">
        <div className="space-y-6 p-6 md:p-8 animate-in fade-in duration-500">
          {/* Page Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-muted/20 p-6 rounded-2xl border border-border/50">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-3xl font-black tracking-tighter text-indigo-600">Catalogue</h1>
              <p className="max-w-2xl text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Inventaire & Stock Global
                {totalItems > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-indigo-500/10 text-indigo-600 rounded-full text-[10px] font-bold">
                    {totalItems} ARTICLE{totalItems > 1 ? "S" : ""}
                  </span>
                )}
              </p>
            </div>
            <Button 
              onClick={handleAddItem}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-widest px-6 shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nouvel article
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-24">
              <Spinner className="h-8 w-8 text-indigo-500" />
            </div>
          ) : items && items.length > 0 ? (
            <div className="space-y-4">
              <Card className="overflow-hidden rounded-2xl border-border/60 shadow-xl shadow-black/5 bg-background">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="w-16 px-6 py-4 text-[10px] font-black uppercase tracking-tighter">Photo</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-tighter">Code</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-tighter">Prix</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-tighter">Stock Total</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-tighter">Dispo</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-tighter">Réservé</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-tighter">Origine</TableHead>
                        <TableHead className="text-right px-6 text-[10px] font-black uppercase tracking-tighter">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedItems.map((item) => (
                        <TableRow key={item.id} className="group hover:bg-indigo-500/[0.01] transition-colors border-border/40">
                          <TableCell className="px-6 py-3">
                            {item.mediaStorageKey ? (
                              <a
                                href={`/api/catalogue/${item.id}/photo`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative block size-10 overflow-hidden rounded-xl border border-border/50 bg-muted shadow-sm transition-transform group-hover:scale-105"
                              >
                                <img
                                  src={`/api/catalogue/${item.id}/photo`}
                                  alt={`Photo ${item.code}`}
                                  className="size-full object-cover opacity-0 transition-opacity duration-300"
                                  onLoad={(e) => e.currentTarget.classList.replace("opacity-0", "opacity-100")}
                                />
                              </a>
                            ) : (
                              <div className="flex size-10 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/50 text-muted-foreground/40">
                                <ImageOff className="size-4" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-sm tracking-tight bg-indigo-500/5 text-indigo-700 px-2 py-0.5 rounded border border-indigo-500/10 uppercase">
                              {item.code}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold">{formatPrice(item.amount)}</TableCell>
                          <TableCell className="text-right font-medium text-xs">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            <Badge 
                              variant={item.availableQty > 0 ? "default" : "secondary"}
                              className={cn(
                                "text-[10px] font-black min-w-[32px] justify-center",
                                item.availableQty > 0 ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20" : "bg-muted text-muted-foreground"
                              )}
                            >
                              {item.availableQty}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {item.reservedQty > 0 ? (
                              <Badge variant="outline" className="text-[10px] font-black bg-amber-500/5 text-amber-600 border-amber-500/20">
                                {item.reservedQty}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="secondary" 
                              className={cn(
                                "text-[9px] font-bold uppercase tracking-tight",
                                isLiveCatalogueOrigin(item.origin) ? "bg-indigo-500/5 text-indigo-600" : "bg-muted/50 text-muted-foreground"
                              )}
                            >
                              {getCatalogueOriginLabel(item.origin)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right px-6">
                            <div className="flex justify-end gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-full hover:bg-indigo-500/10 hover:text-indigo-600"
                                onClick={() => handleEditItem(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive text-muted-foreground/50"
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
              </Card>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 py-2">
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                    Page <span className="text-indigo-600">{currentPage}</span> / {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                      className="h-8 px-4 text-[10px] font-bold uppercase border-border/60"
                    >
                      Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      className="h-8 px-4 text-[10px] font-bold uppercase border-border/60"
                    >
                      Suivant
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Empty>
              <EmptyMedia>
                <PackageOpen className="h-16 w-16 text-indigo-500/20" />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle className="text-indigo-600 font-black">Catalogue Vide</EmptyTitle>
                <EmptyDescription>
                  Commencez par ajouter votre premier article. 
                  Vous pourrez ensuite gérer vos stocks et vos variantes en toute simplicité.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={handleAddItem} className="mt-4 bg-indigo-600 font-bold uppercase text-[10px] tracking-widest">
                Ajouter mon premier article
              </Button>
            </Empty>
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
