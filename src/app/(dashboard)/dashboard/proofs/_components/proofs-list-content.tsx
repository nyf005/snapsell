"use client";

import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Check, FileCheck, Phone, X } from "lucide-react";
import { cn } from "~/lib/utils";

function formatProofDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ProofsListContent() {
  const utils = api.useUtils();
  const { data: proofs = [], isLoading } = api.proofs.listPending.useQuery();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const approve = api.proofs.approve.useMutation({
    onSuccess: () => {
      void utils.proofs.listPending.invalidate();
    },
  });
  const reject = api.proofs.reject.useMutation({
    onSuccess: () => {
      void utils.proofs.listPending.invalidate();
    },
  });
  const bulkApprove = api.proofs.bulkApprove.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      void utils.proofs.listPending.invalidate();
    },
  });
  const bulkReject = api.proofs.bulkReject.useMutation({
    onSuccess: () => {
      setSelectedIds(new Set());
      void utils.proofs.listPending.invalidate();
    },
  });

  const isPending =
    approve.isPending || reject.isPending || bulkApprove.isPending || bulkReject.isPending;
  const allIds = useMemo(() => proofs.map((p) => p.id), [proofs]);
  const isAllSelected =
    proofs.length > 0 && selectedIds.size > 0 && allIds.every((id) => selectedIds.has(id));
  const isSomeSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    bulkApprove.mutate({ proofIds: Array.from(selectedIds) });
  };

  const handleBulkReject = () => {
    if (selectedIds.size === 0) return;
    bulkReject.mutate({ proofIds: Array.from(selectedIds) });
  };

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          {/* Page header */}
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Vérification des preuves d&apos;acompte
            </h1>
            <p className="text-base font-medium text-muted-foreground">
              Consultez, validez ou refusez les preuves d&apos;acompte envoyées par les clientes pour confirmer leurs commandes.
            </p>
          </div>

          <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                <Spinner className="size-8" />
                <span className="text-sm">Chargement…</span>
              </div>
            ) : (
              <>
              {/* Barre en haut du tableau : onglet + actions groupées */}
              {proofs.length > 0 && (
                <div className="flex flex-col gap-4 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex p-1">
                    <span className="flex h-9 items-center justify-center rounded-lg bg-card px-4 text-sm font-bold text-primary shadow-sm">
                      En attente
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 px-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Actions groupées :
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                      disabled={!isSomeSelected || isPending}
                      onClick={handleBulkApprove}
                    >
                      <Check className="size-3.5" />
                      Tout valider
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20"
                      disabled={!isSomeSelected || isPending}
                      onClick={handleBulkReject}
                    >
                      <X className="size-3.5" />
                      Tout refuser
                    </Button>
                  </div>
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-x-auto">
              <Table aria-label="Preuves d'acompte en attente de validation">
                <TableHeader>
                  <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                    <TableHead className="w-12 px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="flex size-5 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
                        aria-label={isAllSelected ? "Tout désélectionner" : "Tout sélectionner"}
                      >
                        {isAllSelected && <Check className="size-3" strokeWidth={3} />}
                      </button>
                    </TableHead>
                    <TableHead className="w-24 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Aperçu
                    </TableHead>
                    <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      N° commande
                    </TableHead>
                    <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Type
                    </TableHead>
                    <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Client
                    </TableHead>
                    <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Reçue le
                    </TableHead>
                    <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proofs.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="px-6 py-16 text-center">
                        <Empty className="mx-auto max-w-sm border-0 p-0">
                          <EmptyHeader>
                            <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                              <FileCheck />
                            </EmptyMedia>
                            <EmptyTitle>Aucune preuve en attente</EmptyTitle>
                            <EmptyDescription>
                              Les preuves d&apos;acompte envoyées par les clientes apparaîtront ici pour validation.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : (
                    proofs.map((proof, idx) => (
                      <TableRow
                        key={proof.id}
                        className={cn(
                          "group border-border transition-colors hover:bg-muted/40",
                          idx % 2 === 1 && "bg-muted/20",
                        )}
                      >
                        <TableCell className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleOne(proof.id)}
                            className={cn(
                              "flex size-5 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0",
                            )}
                            aria-label={`Sélectionner la preuve ${proof.orderNumber}`}
                          >
                            {selectedIds.has(proof.id) && (
                              <Check className="size-3" strokeWidth={3} />
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          {proof.mediaStorageKey ? (
                            <a
                              href={`/api/proofs/${proof.id}/media`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative block size-12 overflow-hidden rounded-lg border border-border bg-muted"
                            >
                              <img
                                src={`/api/proofs/${proof.id}/media`}
                                alt={`Preuve pour ${proof.orderNumber}`}
                                className="absolute inset-0 size-full object-cover opacity-0 transition-[opacity,transform] duration-300 group-hover:scale-110"
                                onLoad={(e) => e.currentTarget.classList.replace("opacity-0", "opacity-100")}
                              />
                            </a>
                          ) : (
                            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                              <FileCheck className="size-5" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-primary">
                              {proof.orderNumber}
                            </span>
                            <Badge
                              variant="secondary"
                              className="w-fit bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            >
                              En attente
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm font-medium text-muted-foreground">
                          {proof.mediaStorageKey ? "Image" : proof.textPayload ? "Texte" : "—"}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-foreground">
                            <Phone className="size-4 shrink-0 text-muted-foreground" />
                            <span>{proof.clientPhone}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                          {formatProofDate(new Date(proof.createdAt))}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 rounded-md bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              disabled={isPending}
                              aria-label={`Refuser la preuve pour la commande ${proof.orderNumber}`}
                              onClick={() => reject.mutate({ proofId: proof.id })}
                            >
                              <X className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110"
                              disabled={isPending}
                              aria-label={`Valider la preuve pour la commande ${proof.orderNumber}`}
                              onClick={() => approve.mutate({ proofId: proof.id })}
                            >
                              Valider
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
                <p className="text-xs text-muted-foreground">
                  {proofs.length} sur {proofs.length} résultat{proofs.length > 1 ? "s" : ""}
                </p>
                <span className="flex gap-2" aria-label="Pagination (sera activée avec les données serveur)">
                  <Button variant="outline" size="xs" disabled title="Pagination avec données serveur">
                    Précédent
                  </Button>
                  <Button variant="outline" size="xs" disabled title="Pagination avec données serveur">
                    Suivant
                  </Button>
                </span>
              </div>
              </>
            )}
          </Card>

          {(approve.isError || reject.isError || bulkApprove.isError || bulkReject.isError) && (
            <p role="alert" aria-live="polite" className="text-sm text-destructive">
              {approve.error?.message ??
                reject.error?.message ??
                bulkApprove.error?.message ??
                bulkReject.error?.message}
            </p>
          )}

          {/* Barre flottante de sélection (style code.html) */}
          {isSomeSelected && (
            <div className="fixed bottom-8 left-1/2 z-40 w-auto -translate-x-1/2">
              <div className="flex items-center gap-6 rounded-full border border-border bg-card px-6 py-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-primary-foreground">
                    {selectedIds.size}
                  </span>
                  <span className="whitespace-nowrap text-sm font-bold">
                    {selectedIds.size} élément{selectedIds.size > 1 ? "s" : ""} sélectionné
                    {selectedIds.size > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
                    disabled={isPending}
                    onClick={handleBulkApprove}
                  >
                    <Check className="size-3.5" />
                    Valider la sélection
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold"
                    disabled={isPending}
                    onClick={handleBulkReject}
                  >
                    <X className="size-3.5" />
                    Refuser la sélection
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Annuler la sélection"
                    onClick={clearSelection}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
