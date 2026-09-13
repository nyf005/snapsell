"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { formatDateTime, formatErrorText } from "~/lib/copy";
import {
  paymentState,
  orderFilterOptions,
  orderStatusLabel,
  orderWorkViews,
  statusesForView,
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
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";

import { OrdersListSkeleton } from "./orders-skeletons";
import { DataPagination } from "~/components/ui/data-pagination";
import { Package, Search, FileCheck, Download, Check, X } from "lucide-react";
import type { RouterOutputs } from "~/trpc/react";

type OrderOutput = RouterOutputs["orders"]["list"]["items"][number];
export function OrdersListContent({ canExportCsv = false, initialView = "to_process", initialPayment = "", initialOrderId }: { canExportCsv?: boolean; initialView?: OrderWorkView; initialPayment?: "" | "review"; initialOrderId?: string }) {
  const [payment, setPayment] = useState<"" | "review" | "awaiting" | "approved" | "rejected" | "none">(initialPayment);
  useEffect(() => { setPayment(initialPayment); }, [initialPayment]);
  const [workView, setWorkView] = useState<OrderWorkView>(initialView);
  useEffect(() => { setWorkView(initialView); }, [initialView]);
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
      status: statusesForView(workView),
      payment: payment || undefined,
      search: search.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: itemsPerPage,
      cursor,
    }),
    [workView, payment, search, dateFrom, dateTo, cursor],
  );

  const utils = api.useUtils();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = api.orders.list.useQuery(queryInput);
  const { data: pendingProofCount = 0 } = api.proofs.pendingCount.useQuery();

  // La mutation de statut et son erreur vivent dans `OrderStatusControl`, partagé
  // avec le panneau de détail. Ici, une erreur en pied de page était loin du geste
  // qui l'avait causée ; elle s'affiche désormais sous le sélecteur concerné.

  const handleExportCsv = async () => {
    if (!canExportCsv) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const data = await utils.orders.exportCsv.fetch({
        status: statusesForView(workView),
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
    payment !== "" || search.trim().length > 0 || workView !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setPayment("");
    setSearch("");
    setWorkView("");
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
  }, [workView, payment, dateFrom, dateTo, search]);


  return (
    <>
      <DashboardHeader />

        <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
          <div className="space-y-5 p-4 md:p-6">
            <TaskPageHeader
              href="/dashboard/orders"
              description="Paiements, préparation et livraison au même endroit."
              actions={
                <>
                {(
                  <Link
                    href="/dashboard/proofs"
                    prefetch
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                    aria-label="Historique et traitement des preuves"
                  >
                    <FileCheck className="size-4" />
                    <span>
                      Historique et traitement des preuves
                    </span>
                  </Link>
                )}
                {canExportCsv && (
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      onClick={() => void handleExportCsv()}
                      disabled={isExporting}
                      className="gap-2"
                      aria-label="Exporter les commandes en CSV"
                    >
                      <Download className="size-4" />
                      {isExporting ? "Export…" : "Exporter en CSV"}
                    </Button>
                    {exportError && (
                      <p className="text-sm text-destructive" role="alert">
                        {exportError}
                      </p>
                    )}
                  </div>
                )}
                </>
              }
            />

            <nav
              aria-label="Vues des commandes"
              className="flex flex-wrap items-center gap-1"
            >
              {orderWorkViews.map((view) => {
                const active = !payment && workView === view.value;
                return (
                  <Button
                    key={view.label}
                    type="button"
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className="shrink-0"
                    aria-pressed={active}
                    onClick={() => { setPayment(""); setWorkView(view.value); }}
                  >
                    {view.label}
                  </Button>
                );
              })}
              <Button variant={payment === "review" ? "default" : "outline"} className="shrink-0" aria-pressed={payment === "review"} onClick={() => { setWorkView(""); setPayment(payment === "review" ? "" : "review"); }}>
                Paiements à vérifier{pendingProofCount > 0 ? ` · ${pendingProofCount} preuve${pendingProofCount > 1 ? "s" : ""}` : ""}
              </Button>
            </nav>

            {/* Filter Section */}
            <Card className="gap-0 border-0 bg-transparent py-0 shadow-none">
              <CardContent className="space-y-3 p-0">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[200px] flex-1 md:min-w-[280px]">
                    {/* `htmlFor`/`id` : le champ n'avait qu'un placeholder pour nom,
                        et un placeholder disparaît dès la première frappe. */}
                    <label
                      htmlFor="orders-search"
                      className="mb-1.5 ml-1 block text-sm font-medium text-muted-foreground"
                    >
                      Recherche
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="orders-search"
                        className="h-11 border-border bg-muted/50 pl-10 focus-visible:ring-primary"
                        placeholder="N° commande, code article, client..."
                        maxLength={100}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="w-full space-y-4" aria-label="Filtres des commandes">
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-muted-foreground">Statut</legend>
                      <div className="flex flex-wrap gap-2">
                        {orderFilterOptions.map((option) => <Button key={option.value || "all"} type="button" variant={workView === option.value ? "secondary" : "outline"} className="min-h-11" aria-pressed={workView === option.value} onClick={() => setWorkView(option.value as OrderWorkView)}>{option.label}</Button>)}
                      </div>
                    </fieldset>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-muted-foreground">Paiement</legend>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries({ "": "Tous les paiements", review: "Preuve à vérifier", awaiting: "Acompte attendu", approved: "Acompte validé", rejected: "Preuve refusée", none: "Aucun acompte requis" }).map(([value, label]) => <Button key={value} type="button" variant={payment === value ? "secondary" : "outline"} className="min-h-11" aria-pressed={payment === value} onClick={() => setPayment(value as typeof payment)}>{label}</Button>)}
                      </div>
                    </fieldset>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-0 flex-1 sm:max-w-48"><label htmlFor="orders-date-from" className="mb-1.5 block text-sm font-medium text-muted-foreground">Du</label><Input id="orders-date-from" type="date" className="min-h-11" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></div>
                      <div className="min-w-0 flex-1 sm:max-w-48"><label htmlFor="orders-date-to" className="mb-1.5 block text-sm font-medium text-muted-foreground">Au</label><Input id="orders-date-to" type="date" className="min-h-11" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></div>
                      <Button type="button" variant="ghost" className="min-h-11" onClick={() => void utils.orders.list.invalidate()}>Rafraîchir</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{isLoading ? "Chargement des commandes…" : `${filteredBySearch.length} commande${filteredBySearch.length > 1 ? "s" : ""} chargée${filteredBySearch.length > 1 ? "s" : ""}`}</span>
              {(dateFrom || dateTo) && <Button variant="secondary" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} aria-label="Retirer la période">{dateFrom || "Début"} → {dateTo || "Aujourd’hui"}<X className="size-3" /></Button>}
              {payment && <Button variant="secondary" size="sm" onClick={() => setPayment("")} aria-label="Retirer le filtre de paiement">Paiement : {({ review: "À vérifier", awaiting: "Attendu", approved: "Validé", rejected: "Refusé", none: "Non requis" })[payment]}<X className="size-3" /></Button>}
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
              ) : (
                <>
                <DataList
                  items={filteredBySearch}
                  getKey={(order) => order.id}
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
                      header: "N° commande",
                      role: "primary",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4 font-bold text-primary",
                      cell: (order) => (
                        <button
                          type="button"
                          onClick={() => { setShowProofs(false); setDetailOrderId(order.id); }}
                          className="min-h-11 font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {order.orderNumber}
                        </button>
                      ),
                    },
                    {
                      id: "status",
                      header: "Statut",
                      role: "secondary",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4",
                      cell: (order) => <Badge variant="secondary">{orderStatusLabel(order.status)}</Badge>,
                    },
                    {
                      id: "payment", header: "Paiement", role: "meta",
                      cell: (order) => {
                        const state = paymentState(order);
                        return <Badge variant={state.key === "review" ? "warning" : state.key === "approved" ? "success" : state.key === "rejected" ? "destructive" : "outline"}>{state.label}</Badge>;
                      },
                    },
                    {
                      id: "code",
                      header: "Code article",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4 text-sm font-medium text-foreground",
                      cell: (order) => order.liveItemCode ?? "—",
                    },
                    {
                      id: "client",
                      header: "Client",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4",
                      cell: (order) => (
                        <span className="text-sm font-bold text-foreground">
                          {order.clientPhone}
                        </span>
                      ),
                    },
                    {
                      id: "createdAt",
                      header: "Créée le",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-sm font-medium text-muted-foreground",
                      className: "px-6 py-4 text-sm text-muted-foreground",
                      cell: (order) => formatDateTime(new Date(order.createdAt)),
                    },
                  ]}
                  actions={(order) => (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="md:hidden" aria-pressed={selectedIds.has(order.id)} aria-label={`Sélectionner la commande ${order.orderNumber}`} onClick={() => toggleOne(order.id)}>{selectedIds.has(order.id) ? "Sélectionnée" : "Sélectionner"}</Button>
                      {paymentState(order).key === "review" ? <Button size="sm" onClick={() => { setShowProofs(true); setDetailOrderId(order.id); }}>Vérifier le paiement</Button> : <OrderStatusControl orderId={order.id} orderNumber={order.orderNumber} status={order.status} />}
                      {order.depositStatus && order.depositStatus !== "no_deposit" && paymentState(order).key !== "review" && <Button variant="ghost" size="sm" aria-label={`${paymentState(order).label} · voir la preuve`} onClick={() => { setShowProofs(true); setDetailOrderId(order.id); }}>Justificatifs</Button>}
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
