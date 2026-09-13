"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { formatDateTime, formatErrorText, formatXof } from "~/lib/copy";
import {
  paymentState,
  orderFilterOptions,
  orderStatusLabel,
  orderWorkViews,
  type OrderWorkView,
} from "~/lib/copy/orders";
import { OrderBulkBar } from "./order-bulk-bar";
import { OrderDetailSheet } from "./order-detail-sheet";
import { OrderStatusControl } from "./order-status-control";
import { DataList } from "~/components/ui/data-list";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DashboardEmptyState } from "~/app/(dashboard)/_components/dashboard-empty-state";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";

import { OrdersListSkeleton } from "./orders-skeletons";
import { DataPagination } from "~/components/ui/data-pagination";
import { Package, Search, Download, Check, X, SlidersHorizontal } from "lucide-react";
import type { OrderStatusKey } from "~/lib/order-status-transitions";
import type { RouterOutputs } from "~/trpc/react";

type Queue = "to_process" | "in_progress" | "completed" | "review" | "ready" | "awaiting" | "preparing" | "in_delivery" | "delivered" | "cancelled" | "all";
const queueForView = (view: OrderWorkView): Queue => view === "" ? "all" : view === "confirmed" ? "ready" : view === "confirmed_pending_deposit" ? "awaiting" : view;
const contextViews = {
  to_process: [{ value: "to_process", label: "Tout" }, { value: "review", label: "Paiements à vérifier" }, { value: "ready", label: "À préparer" }],
  in_progress: [{ value: "in_progress", label: "Tout" }, { value: "awaiting", label: "Acomptes attendus" }, { value: "preparing", label: "En préparation" }, { value: "in_delivery", label: "En livraison" }],
  completed: [{ value: "completed", label: "Tout" }, { value: "delivered", label: "Livrées" }, { value: "cancelled", label: "Annulées" }],
} as const;
type OrderOutput = RouterOutputs["orders"]["list"]["items"][number];
export function OrdersListContent({ canExportCsv = false, initialView = "to_process", initialPayment = "", initialOrderId }: { canExportCsv?: boolean; initialView?: OrderWorkView; initialPayment?: "" | "review"; initialOrderId?: string }) {
  const [payment, setPayment] = useState<"" | "review" | "awaiting" | "approved" | "rejected" | "none">("");
  const [queue, setQueue] = useState<Queue>(initialPayment === "review" ? "review" : queueForView(initialView));
  const [status, setStatus] = useState<"" | OrderStatusKey>("");
  const [refining, setRefining] = useState(false);
  useEffect(() => { setQueue(initialPayment === "review" ? "review" : queueForView(initialView)); }, [initialView, initialPayment]);
  const mainView = ["to_process", "review", "ready"].includes(queue) ? "to_process" : ["in_progress", "awaiting", "preparing", "in_delivery"].includes(queue) ? "in_progress" : queue === "all" ? null : "completed";
  const selectQueue = (value: Queue) => { setQueue(value); setStatus(""); setPayment(""); };
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedOrders, setAccumulatedOrders] = useState<OrderOutput[]>([]);
  /** Commande dont le panneau de détail est ouvert. `null` = fermé. */
  const [showProofs, setShowProofs] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(initialOrderId ?? null);
  useEffect(() => { setDetailOrderId(initialOrderId ?? null); }, [initialOrderId]);
  /** Sélection pour le traitement en masse, comme sur l'écran des preuves. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const filtersMounted = useRef(false);
  const itemsPerPage = 20;

  const queryInput = useMemo(
    () => ({
      queue,
      status: status ? [status] : undefined,
      payment: payment || undefined,
      search: search.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: itemsPerPage,
      cursor,
    }),
    [queue, status, payment, search, dateFrom, dateTo, cursor],
  );

  const utils = api.useUtils();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = api.orders.list.useQuery(queryInput);
  const counts = data?.counts;

  // La mutation de statut et son erreur vivent dans `OrderStatusControl`, partagé
  // avec le panneau de détail. Ici, une erreur en pied de page était loin du geste
  // qui l'avait causée ; elle s'affiche désormais sous le sélecteur concerné.

  const handleExportCsv = async () => {
    if (!canExportCsv) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const data = await utils.orders.exportCsv.fetch({
        queue,
      status: status ? [status] : undefined,
      payment: payment || undefined,
      search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const blob = new Blob([data.csv], {
        type: "text/csv;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      const message =
        e instanceof Error ? formatErrorText(e, "orders") : "Export impossible. Réessayez.";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!data?.items) return;
    if (!cursor) {
      setAccumulatedOrders(data.items);
    } else {
      setAccumulatedOrders((prev) => { const updated = new Map(data.items.map((item) => [item.id, item])); return [...prev.filter((item) => !updated.has(item.id)), ...data.items]; });
    }
  }, [data?.items, cursor]);

  const orders = accumulatedOrders;
  const nextCursor = data?.nextCursor;
  const hasMore = Boolean(nextCursor);

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const resetPagination = () => {
    setSelectedIds(new Set());
    setCursor(undefined);
    setAccumulatedOrders([]);
  };

  const hasActiveFilters =
    payment !== "" || search.trim().length > 0 || queue !== "all" || status !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setPayment("");
    setSearch("");
    setQueue("all");
    setStatus("");
    setDateFrom("");
    setDateTo("");
  };

  const filteredBySearch = orders;

  /**
   * La sélection ne garde que des commandes encore visibles : filtrer ou paginer
   * ne doit pas laisser dans la sélection des lignes qu'on ne voit plus, sinon on
   * agirait à l'aveugle sur elles.
   */
  const visibleIds = useMemo(() => filteredBySearch.map((o) => o.id), [filteredBySearch]);
  const selectedVisible = useMemo(
    () => filteredBySearch.filter((o) => selectedIds.has(o.id)),
    [filteredBySearch, selectedIds],
  );
  const isAllSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds(isAllSelected ? new Set() : new Set(visibleIds));
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

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    resetPagination();
  }, [queue, status, payment, dateFrom, dateTo, search]);


  return (
    <>
      <DashboardHeader />

        <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
          <div className="space-y-4 p-4 md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <TaskPageHeader href="/dashboard/orders" description="" />
              <div className="flex w-full items-end gap-2 lg:max-w-md">
                <div className="min-w-0 flex-1"><label htmlFor="orders-search" className="mb-1.5 block text-sm font-medium">Rechercher</label><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><Input id="orders-search" className="min-h-11 bg-surface pl-9" placeholder="N° commande, client, article…" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
                <Button variant={refining ? "secondary" : "outline"} className="min-h-11 gap-2" aria-expanded={refining} aria-controls="orders-refine" onClick={() => setRefining(!refining)}><SlidersHorizontal className="size-4" aria-hidden="true" />Affiner</Button>
              </div>
            </div>
            <nav aria-label="Vues des commandes" className="flex border-b border-border">
              {orderWorkViews.map((view) => <button key={view.value} type="button" aria-pressed={mainView === view.value} onClick={() => selectQueue(view.value as Queue)} className={`flex min-h-12 flex-1 flex-wrap items-center justify-center gap-2 border-b-2 px-2 py-2 text-sm font-semibold transition-colors sm:flex-none sm:px-6 ${mainView === view.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><span>{view.label}</span>{counts && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{counts[view.value as keyof typeof counts]}</span>}</button>)}
            </nav>
            <div className="flex flex-wrap items-center gap-2" aria-label="Raccourcis des commandes">
              {mainView ? contextViews[mainView].map((view) => <Button key={view.value} variant={queue === view.value ? "secondary" : "ghost"} className="min-h-11 gap-1.5 px-2 sm:px-3" aria-label={`${view.label}${counts ? ` ${counts[view.value]}` : ""}`} aria-pressed={queue === view.value} onClick={() => selectQueue(view.value)}>{view.value === "review" ? <><span className="sm:hidden">À vérifier</span><span className="hidden sm:inline">{view.label}</span></> : view.label}{counts && <span className="tabular-nums text-muted-foreground">{counts[view.value]}</span>}</Button>) : <Button variant="secondary" onClick={() => selectQueue("to_process")} aria-label="Retirer la vue Toutes les commandes">Toutes les commandes<X className="ml-2 size-3" /></Button>}
            </div>
            {refining && <section id="orders-refine" aria-label="Affiner les commandes" className="space-y-4 rounded-xl border border-border bg-surface p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><label htmlFor="orders-status" className="mb-1.5 block text-sm font-medium">Statut précis</label><select id="orders-status" className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={status} onChange={(event) => { setQueue("all"); setStatus(event.target.value as "" | OrderStatusKey); }}>{orderFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                <div><label htmlFor="orders-payment" className="mb-1.5 block text-sm font-medium">Paiement</label><select id="orders-payment" className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={payment} onChange={(event) => setPayment(event.target.value as typeof payment)}>{Object.entries({ "": "Tous les paiements", review: "Preuve à vérifier", awaiting: "Acompte attendu", approved: "Acompte validé", rejected: "Preuve refusée", none: "Aucun acompte requis" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label htmlFor="orders-date-from" className="mb-1.5 block text-sm font-medium">Du</label><Input id="orders-date-from" type="date" className="min-h-11" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></div>
                <div><label htmlFor="orders-date-to" className="mb-1.5 block text-sm font-medium">Au</label><Input id="orders-date-to" type="date" className="min-h-11" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={clearFilters}>Toutes les commandes</Button><Button variant="ghost" onClick={() => setRefining(false)}>Fermer les filtres</Button></div>
            </section>}
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="mr-auto" role="status">{isLoading ? "Chargement…" : data?.total != null ? `${data.total} commande${data.total > 1 ? "s" : ""}` : `${orders.length} commande${orders.length > 1 ? "s" : ""} affichée${orders.length > 1 ? "s" : ""}`}</span>
              {status && <Button variant="secondary" size="sm" onClick={() => setStatus("")} aria-label="Retirer le statut">{orderStatusLabel(status)}<X className="ml-2 size-3" /></Button>}
              {(dateFrom || dateTo) && <Button variant="secondary" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} aria-label="Retirer la période">{dateFrom || "Début"} → {dateTo || "Aujourd’hui"}<X className="ml-2 size-3" /></Button>}
              {payment && <Button variant="secondary" size="sm" onClick={() => setPayment("")} aria-label="Retirer le filtre de paiement">{({ review: "À vérifier", awaiting: "Attendu", approved: "Validé", rejected: "Refusé", none: "Non requis" })[payment]}<X className="ml-2 size-3" /></Button>}
              <Button variant="ghost" size="sm" onClick={() => void refetch()}>Rafraîchir</Button>
            </div>
            {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{formatErrorText(error, "orders")}</p><Button variant="outline" onClick={() => void refetch()}>Réessayer</Button></div>}

            {bulkMessage ? (
              <div
                role="status"
                className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-foreground"
              >
                <span>{bulkMessage}</span>
                <Button variant="ghost" size="sm" onClick={() => setBulkMessage(null)}>
                  Fermer
                </Button>
              </div>
            ) : null}

            <OrderBulkBar
              selectedIds={selectedVisible.map((o) => o.id)}
              selectedStatuses={selectedVisible.map((o) => o.status)}
              onClear={clearSelection}
              onDone={setBulkMessage}
            />

            {/* Table */}
            <Card className="overflow-hidden rounded-xl border-border gap-0 pb-0 pt-0 shadow-none">
              {isLoading ? (
                <div className="p-6">
                  <OrdersListSkeleton />
                </div>
              ) : error && !data ? null : (
                <>
                <DataList
                  items={filteredBySearch}
                  getKey={(order) => order.id}
                  onOpenItem={(order) => { setShowProofs(false); setDetailOrderId(order.id); }}
                  label="Liste des commandes"
                  columns={[
                    {
                      id: "select",
                      header: (
                        <button
                          type="button"
                          onClick={toggleAll}
                          className="flex size-11 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
                          aria-label={
                            isAllSelected ? "Tout désélectionner" : "Tout sélectionner"
                          }
                        >
                          {isAllSelected && <Check className="size-3" strokeWidth={3} />}
                        </button>
                      ),
                      role: "hiddenOnMobile",
                      headerClassName: "w-12 px-4 py-3 text-center",
                      className: "px-4 py-3 text-center",
                      cell: (order) => (
                        <button
                          type="button"
                          onClick={() => toggleOne(order.id)}
                          className="flex size-11 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
                          aria-label={`Sélectionner la commande ${order.orderNumber}`}
                        >
                          {selectedIds.has(order.id) && (
                            <Check className="size-3" strokeWidth={3} />
                          )}
                        </button>
                      ),
                    },
                    {
                      id: "orderNumber",
                      header: "Commande / Client",
                      role: "primary",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4 font-bold text-primary",
                      cell: (order) => (
                        <div><button
                          type="button"
                          onClick={() => { setShowProofs(false); setDetailOrderId(order.id); }}
                          className="min-h-11 font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {order.orderNumber}
                        </button><p className="text-sm font-normal text-foreground">{order.clientPhone}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{formatDateTime(new Date(order.createdAt))}</p></div>
                      ),
                    },
                    {
                      id: "articles", header: "Articles", role: "meta", className: "px-4 py-4",
                      cell: (order) => <div className="flex items-center gap-3">{order.articlePhotoUrl && <img src={order.articlePhotoUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" loading="lazy" />}<div><p className="text-sm font-medium">{order.articleName ?? order.liveItemCode ?? "Article"} × {order.quantity ?? "—"}</p>{order.variantLabel && <p className="text-sm text-muted-foreground">{order.variantLabel}</p>}{order.articleName && <p className="text-xs text-muted-foreground">{order.liveItemCode}</p>}<p className="mt-1 text-sm tabular-nums text-muted-foreground">{order.itemsTotalCents != null ? `${formatXof(order.itemsTotalCents)} hors livraison` : "Total non renseigné"}</p></div></div>,
                    },
                    {
                      id: "payment", header: "Paiement", role: "meta",
                      cell: (order) => {
                        const state = paymentState(order);
                        const badge = <Badge variant={state.key === "review" ? "warning" : state.key === "approved" ? "success" : state.key === "rejected" ? "destructive" : "outline"}>{state.label}</Badge>;
                        return <div className="space-y-2">{state.key !== "none" && state.key !== "review" ? <button type="button" className="min-h-11 text-left focus-visible:outline-2 focus-visible:outline-primary" aria-label={`${state.label} · voir la preuve`} onClick={() => { setShowProofs(true); setDetailOrderId(order.id); }}>{badge}</button> : badge}{order.depositAmountCents != null && <p className="text-sm tabular-nums">Acompte : {formatXof(order.depositAmountCents)}</p>}{state.key !== "none" && order.depositAmountCents == null && <p className="text-xs text-muted-foreground">Montant non renseigné</p>}</div>;
                      },
                    },
                    {
                      id: "status",
                      header: "Statut",
                      role: "secondary",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4",
                      cell: (order) => <Badge variant="secondary">{orderStatusLabel(order.status)}</Badge>,
                    },
                  ]}
                  actions={(order) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="md:hidden" aria-pressed={selectedIds.has(order.id)} aria-label={`Sélectionner la commande ${order.orderNumber}`} onClick={() => toggleOne(order.id)}>{selectedIds.has(order.id) ? "Sélectionnée" : "Sélectionner"}</Button>
                      {paymentState(order).key === "review" ? <Button size="sm" className="min-h-11" onClick={() => { setShowProofs(true); setDetailOrderId(order.id); }}>Vérifier le paiement</Button> : ["confirmed", "preparing", "in_delivery"].includes(order.status) ? <OrderStatusControl primaryOnly orderId={order.id} orderNumber={order.orderNumber} status={order.status} /> : <Button variant="outline" size="sm" onClick={() => { setShowProofs(false); setDetailOrderId(order.id); }}>Voir la commande</Button>}

                    </div>
                  )}
                  empty={
                    hasActiveFilters ? (
                      <DashboardEmptyState
                        icon={Package}
                        title="Aucun résultat"
                        description="Aucune commande ne correspond à votre recherche."
                        action={
                          <Button variant="outline" onClick={clearFilters}>
                            Effacer les filtres
                          </Button>
                        }
                      />
                    ) : (
                      <DashboardEmptyState
                        icon={Package}
                        title="Aucune commande pour l’instant"
                        description="Les commandes apparaîtront ici dès qu’une réservation sera confirmée sur WhatsApp."
                      />
                    )
                  }
                />
                <DataPagination
                  totalItems={filteredBySearch.length}
                  pageSize={itemsPerPage}
                  itemLabel={`commande${filteredBySearch.length > 1 ? "s" : ""}`}
                  onNext={loadMore}
                  hasNext={hasMore}
                  isLoading={isLoading}
                />
              </>
            )}
          </Card>
          <footer className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/dashboard/proofs" aria-label="Historique et traitement des preuves" className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:underline">Historique des paiements</Link>
            {canExportCsv && <Button variant="ghost" className="min-h-11 gap-2" aria-label="Exporter les commandes en CSV" disabled={isExporting} onClick={() => void handleExportCsv()}><Download className="size-4" />{isExporting ? "Export…" : "Exporter cette vue"}</Button>}
            {exportError && <p role="alert" className="w-full text-destructive">{exportError}</p>}
          </footer>
          </div>
        </main>

        <OrderDetailSheet
          onNext={orders.some((order) => order.id !== detailOrderId && paymentState(order).key === "review") ? () => { const next = orders.find((order) => order.id !== detailOrderId && paymentState(order).key === "review"); if (next) { setShowProofs(true); setDetailOrderId(next.id); } } : undefined}
          key={detailOrderId}
          showProofs={showProofs}
          orderId={detailOrderId}
          open={detailOrderId !== null}
          onOpenChange={(open) => {
            if (!open) setDetailOrderId(null);
          }}
        />

    </>
  );
}
