"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { formatDateTime, formatErrorText } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";

import { ProofsListSkeleton } from "./proofs-skeletons";
import { DataPagination } from "~/components/ui/data-pagination";
import { Check, FileCheck, Phone, X } from "lucide-react";

import type { RouterOutputs } from "~/trpc/react";

type ProofOutput = RouterOutputs["proofs"]["listPending"]["items"][number];

export function ProofsListContent() {
  const utils = api.useUtils();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedProofs, setAccumulatedProofs] = useState<ProofOutput[]>([]);
  const itemsPerPage = 20;

  const queryInput = useMemo(() => ({ limit: itemsPerPage, cursor }), [cursor]);

  const { data, isLoading } = api.proofs.listPending.useQuery(queryInput);

  useEffect(() => {
    if (!data?.items) return;
    const items = data.items as ProofOutput[];
    if (!cursor) {
      setAccumulatedProofs(items);
    } else {
      setAccumulatedProofs((prev) => [...prev, ...items]);
    }
  }, [data?.items, cursor]);

  const proofs = accumulatedProofs;
  const nextCursor = data?.nextCursor;
  const hasMore = Boolean(nextCursor);

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<{ id: string; orderNumber: string } | null>(null);
  const [showBulkReject, setShowBulkReject] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const approve = api.proofs.approve.useMutation({
    onSuccess: () => {
      setActionMessage("Preuve validée. La commande peut avancer.");
      void utils.proofs.listPending.invalidate();
    },
  });
  const reject = api.proofs.reject.useMutation({
    onSuccess: () => {
      setActionMessage("Preuve refusée. Le message de suite part automatiquement.");
      setRejectTarget(null);
      void utils.proofs.listPending.invalidate();
    },
  });
  const bulkApprove = api.proofs.bulkApprove.useMutation({
    onSuccess: () => {
      setActionMessage(`${selectedIds.size} preuve${selectedIds.size > 1 ? "s" : ""} validée${selectedIds.size > 1 ? "s" : ""}.`);
      setSelectedIds(new Set());
      void utils.proofs.listPending.invalidate();
    },
  });
  const bulkReject = api.proofs.bulkReject.useMutation({
    onSuccess: () => {
      setActionMessage(`${selectedIds.size} preuve${selectedIds.size > 1 ? "s" : ""} refusée${selectedIds.size > 1 ? "s" : ""}.`);
      setSelectedIds(new Set());
      setShowBulkReject(false);
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
    setShowBulkReject(true);
  };

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          <TaskPageHeader
            href="/dashboard/proofs"
            description="Comparez la preuve avec la commande, puis validez-la ou refusez-la. Un refus demande toujours confirmation."
          />

          {actionMessage ? (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-foreground"
            >
              <span>{actionMessage}</span>
              <Button variant="ghost" size="sm" onClick={() => setActionMessage(null)}>
                Fermer
              </Button>
            </div>
          ) : null}

          <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
            {isLoading ? (
              <div className="p-6">
                <ProofsListSkeleton />
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
              <DataList
                items={proofs}
                getKey={(proof) => proof.id}
                label="Preuves de paiement en attente de validation"
                columns={[
                  {
                    id: "select",
                    // Régression : la case « tout sélectionner » vivait dans
                    // l'en-tête du tableau et avait disparu à la migration DataList.
                    header: (
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="flex size-5 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
                        aria-label={isAllSelected ? "Tout désélectionner" : "Tout sélectionner"}
                      >
                        {isAllSelected && <Check className="size-3" strokeWidth={3} />}
                      </button>
                    ),
                    role: "hiddenOnMobile",
                    headerClassName: "w-12 px-4 py-3 text-center",
                    className: "px-4 py-3 text-center",
                    cell: (proof) => (
                      <button
                        type="button"
                        onClick={() => toggleOne(proof.id)}
                        className="flex size-5 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
                        aria-label={`Sélectionner la preuve ${proof.orderNumber}`}
                      >
                        {selectedIds.has(proof.id) && (
                          <Check className="size-3" strokeWidth={3} />
                        )}
                      </button>
                    ),
                  },
                  {
                    id: "preview",
                    header: "Aperçu",
                    role: "hiddenOnMobile",
                    headerClassName:
                      "w-24 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "px-6 py-4",
                    cell: (proof) =>
                      proof.mediaStorageKey ? (
                        <a
                          href={`/api/proofs/${proof.id}/media`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block size-12 overflow-hidden rounded-lg border border-border bg-muted"
                        >
                          <img
                            src={`/api/proofs/${proof.id}/media`}
                            alt={`Preuve pour ${proof.orderNumber}`}
                            className="absolute inset-0 size-full object-cover"
                          />
                        </a>
                      ) : (
                        <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                          <FileCheck className="size-5" />
                        </div>
                      ),
                  },
                  {
                    id: "order",
                    header: "N° commande",
                    role: "primary",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "px-6 py-4",
                    cell: (proof) => (
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
                    ),
                  },
                  {
                    id: "type",
                    header: "Type",
                    role: "meta",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "px-6 py-4 text-sm font-medium text-muted-foreground",
                    cell: (proof) =>
                      proof.mediaStorageKey ? "Image" : proof.textPayload ? "Texte" : "—",
                  },
                  {
                    id: "client",
                    header: "Client",
                    role: "meta",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "px-6 py-4",
                    cell: (proof) => (
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Phone className="size-4 shrink-0 text-muted-foreground" />
                        <span>{proof.clientPhone}</span>
                      </div>
                    ),
                  },
                  {
                    id: "createdAt",
                    header: "Reçue le",
                    role: "meta",
                    headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    className: "px-6 py-4 text-sm text-muted-foreground",
                    cell: (proof) => formatDateTime(new Date(proof.createdAt)),
                  },
                ]}
                actions={(proof) => (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={isPending}
                      aria-label={`Refuser la preuve pour la commande ${proof.orderNumber}`}
                      onClick={() =>
                        setRejectTarget({ id: proof.id, orderNumber: proof.orderNumber })
                      }
                    >
                      <X className="size-4" />
                      <span className="md:hidden">Refuser</span>
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110"
                      disabled={isPending}
                      aria-label={`Valider la preuve pour la commande ${proof.orderNumber}`}
                      onClick={() => approve.mutate({ proofId: proof.id })}
                    >
                      Valider
                    </Button>
                  </>
                )}
                empty={
                  <Empty className="mx-auto max-w-sm border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                        <FileCheck />
                      </EmptyMedia>
                      <EmptyTitle>Aucune preuve en attente</EmptyTitle>
                      <EmptyDescription>
                        Quand une preuve de paiement arrivera sur WhatsApp, elle
                        apparaîtra ici pour que vous la validiez.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                }
              />
              <DataPagination
                totalItems={proofs.length}
                pageSize={itemsPerPage}
                itemLabel={`preuve${proofs.length > 1 ? "s" : ""}`}
                onNext={loadMore}
                hasNext={hasMore}
                isLoading={isLoading}
              />
              </>
            )}
          </Card>

          {(approve.isError || reject.isError || bulkApprove.isError || bulkReject.isError) && (
            <p role="alert" aria-live="polite" className="text-sm text-destructive">
              {formatErrorText(
                approve.error ?? reject.error ?? bulkApprove.error ?? bulkReject.error,
                "proofs",
              )}
            </p>
          )}

          <AlertDialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Refuser cette preuve ?</AlertDialogTitle>
                <AlertDialogDescription>
                  La preuve de la commande {rejectTarget?.orderNumber} sera marquée comme refusée.
                  Une nouvelle preuve pourra être envoyée selon le parcours actuel.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Garder la preuve</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => rejectTarget && reject.mutate({ proofId: rejectTarget.id })}
                  disabled={reject.isPending}
                  className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                >
                  {reject.isPending ? "Refus…" : "Refuser la preuve"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={showBulkReject} onOpenChange={setShowBulkReject}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Refuser {selectedIds.size} preuve{selectedIds.size > 1 ? "s" : ""} ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Chaque preuve sélectionnée sera marquée comme refusée. Vérifiez la sélection avant
                  de continuer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Revoir la sélection</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkReject.mutate({ proofIds: Array.from(selectedIds) })}
                  disabled={bulkReject.isPending}
                  className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                >
                  {bulkReject.isPending ? "Refus…" : "Refuser les preuves"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Barre flottante de sélection */}
          {isSomeSelected && (
            <div className="fixed inset-x-3 bottom-24 z-30 md:inset-x-auto md:bottom-8 md:left-1/2 md:w-auto md:-translate-x-1/2">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-xl md:flex-row md:items-center md:gap-6 md:rounded-full md:px-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-primary-foreground">
                    {selectedIds.size}
                  </span>
                  <span className="whitespace-nowrap text-sm font-bold">
                    {selectedIds.size} élément{selectedIds.size > 1 ? "s" : ""} sélectionné
                    {selectedIds.size > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="hidden h-6 w-px bg-border md:block" />
                <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-3">
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-lg px-3 text-xs font-bold md:rounded-full md:px-4"
                    disabled={isPending}
                    onClick={handleBulkApprove}
                  >
                    <Check className="size-3.5" />
                    Valider la sélection
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 rounded-lg px-3 text-xs font-bold md:rounded-full md:px-4"
                    disabled={isPending}
                    onClick={handleBulkReject}
                  >
                    <X className="size-3.5" />
                    Refuser la sélection
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 size-8 rounded-full text-muted-foreground hover:text-foreground md:static"
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
