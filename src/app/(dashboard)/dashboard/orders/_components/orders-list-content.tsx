"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { api } from "~/trpc/react";
import { formatDateCompact, formatDateTime, formatErrorText } from "~/lib/copy";
import {
  depositStatusLabel,
  hasDeposit,
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
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { DashboardEmptyState } from "~/app/(dashboard)/_components/dashboard-empty-state";
import { Card, CardContent } from "~/components/ui/card";
import { KpiCard } from "~/components/ui/kpi-card";
import { Input } from "~/components/ui/input";

import { OrdersListSkeleton } from "./orders-skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { DataPagination } from "~/components/ui/data-pagination";
import { Package, ListOrdered, Wallet, Truck, XCircle, Search, CalendarIcon, FileCheck, Download, Receipt, Check } from "lucide-react";
import type { RouterOutputs } from "~/trpc/react";

type OrderOutput = RouterOutputs["orders"]["list"]["items"][number];
type OrderStatus =
  | "confirmed"
  | "confirmed_pending_deposit"
  | "preparing"
  | "in_delivery"
  | "delivered"
  | "cancelled";


/**
 * ── LE BADGE D'ACOMPTE EST LA PORTE VERS LA PREUVE ──────────────────────────
 * Vérifier un acompte imposait un aller-retour : lire le numéro sur l'écran des
 * preuves, revenir aux commandes, le retrouver. Et cet aller-retour n'était
 * possible que dans une fenêtre étroite — `proofs.listPending` ne liste que les
 * preuves en attente, donc une fois validée, la preuve devenait introuvable.
 *
 * Le badge dit déjà qu'il y a un acompte : c'est donc là que se pose l'affordance
 * qui mène à la preuve, plutôt que dans une colonne de plus. La table en a déjà
 * cinq et doit tenir sur un téléphone pendant un live, et la plupart des commandes
 * n'ont aucun acompte — la colonne serait vide la plupart du temps.
 *
 * Le repère apparaît dès qu'un acompte existe, quel que soit l'état de la commande.
 * Il était conditionné à `confirmed_pending_deposit` seul : une commande livrée
 * dont l'acompte avait été validé n'en disait donc rien.
 * ────────────────────────────────────────────────────────────────────────────
 */
function StatusBadge({
  status,
  depositStatus,
  onShowDeposit,
}: {
  status: OrderStatus;
  depositStatus?: string | null;
  onShowDeposit?: () => void;
}) {
  const variant =
    status === "delivered"
      ? "success"
      : status === "cancelled"
        ? "destructive"
        : status === "confirmed_pending_deposit"
          ? "secondary"
          : status === "preparing" || status === "in_delivery"
            ? "outline"
            : "default";
  const label = orderStatusLabel(status);
  const content = (
    <Badge variant={variant} className="whitespace-nowrap">
      {label}
    </Badge>
  );
  if (!hasDeposit(depositStatus)) return content;

  const depositLabel = depositStatusLabel(depositStatus);

  // Sans gestionnaire, on garde l'infobulle seule — le badge reste informatif.
  if (!onShowDeposit) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>{depositLabel}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onShowDeposit}
          aria-label={`${depositLabel} — voir la preuve`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {content}
          <Receipt className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent>{depositLabel} — voir la preuve</TooltipContent>
    </Tooltip>
  );
}

export function OrdersListContent({ canExportCsv = false }: { canExportCsv?: boolean }) {
  const [workView, setWorkView] = useState<OrderWorkView>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedOrders, setAccumulatedOrders] = useState<OrderOutput[]>([]);
  /** Commande dont le panneau de détail est ouvert. `null` = fermé. */
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  /** Sélection pour le traitement en masse, comme sur l'écran des preuves. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const filtersMounted = useRef(false);
  const itemsPerPage = 20;

  const queryInput = useMemo(
    () => ({
      status: statusesForView(workView),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: itemsPerPage,
      cursor,
    }),
    [workView, dateFrom, dateTo, cursor],
  );

  const utils = api.useUtils();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data, isLoading } = api.orders.list.useQuery(queryInput);
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
      setAccumulatedOrders((prev) => [...prev, ...data.items]);
    }
  }, [data?.items, cursor]);

  const orders = accumulatedOrders;
  const nextCursor = data?.nextCursor;
  const hasMore = Boolean(nextCursor);

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const resetPagination = () => {
    setCursor(undefined);
    setAccumulatedOrders([]);
  };

  const hasActiveFilters =
    search.trim().length > 0 || workView !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setSearch("");
    setWorkView("");
    setDateFrom("");
    setDateTo("");
  };

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        (o.liveItemCode?.toLowerCase().includes(q) ?? false) ||
        o.clientPhone.toLowerCase().includes(q),
    );
  }, [orders, search]);

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
  }, [workView, dateFrom, dateTo, search]);

  const kpis = useMemo(() => {
    return {
      total: orders.length,
      pendingDeposit: orders.filter((o) => o.status === "confirmed_pending_deposit").length,
      toDeliver: orders.filter(
        (o) =>
          o.status === "confirmed" ||
          o.status === "confirmed_pending_deposit" ||
          o.status === "preparing" ||
          o.status === "in_delivery",
      ).length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
    };
  }, [orders]);

  return (
    <>
      <DashboardHeader />
      <TooltipProvider>
        <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
          <div className="space-y-8 p-6 md:p-8">
            <TaskPageHeader
              href="/dashboard/orders"
              description="Avancez chaque commande jusqu’à la livraison. Les vues ci-dessous suivent votre rythme de travail."
              actions={
                <>
                {pendingProofCount > 0 && (
                  <Link
                    href="/dashboard/proofs"
                    prefetch
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                    aria-label={`${pendingProofCount} preuve(s) à valider`}
                  >
                    <FileCheck className="size-4" />
                    <span>
                      {pendingProofCount} preuve{pendingProofCount > 1 ? "s" : ""} à valider
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

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Total commandes"
                value={kpis.total}
                icon={ListOrdered}
                iconVariant="primary"
              />
              <KpiCard
                label="En attente acompte"
                value={kpis.pendingDeposit}
                icon={Wallet}
                iconVariant="warning"
              />
              <KpiCard
                label="À livrer"
                value={kpis.toDeliver}
                icon={Truck}
                iconVariant="success"
              />
              <KpiCard
                label="Annulées"
                value={kpis.cancelled}
                icon={XCircle}
                iconVariant="destructive"
              />
            </div>

            <nav
              aria-label="Vues des commandes"
              className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
            >
              {orderWorkViews.map((view) => {
                const active = workView === view.value;
                return (
                  <Button
                    key={view.label}
                    type="button"
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className="shrink-0"
                    aria-pressed={active}
                    onClick={() => setWorkView(view.value)}
                  >
                    {view.label}
                  </Button>
                );
              })}
            </nav>

            {/* Filter Section */}
            <Card className="rounded-xl border border-border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[200px] flex-1 md:min-w-[280px]">
                    {/* `htmlFor`/`id` : le champ n'avait qu'un placeholder pour nom,
                        et un placeholder disparaît dès la première frappe. */}
                    <label
                      htmlFor="orders-search"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Recherche
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="orders-search"
                        className="h-11 border-border bg-muted/50 pl-10 focus-visible:ring-primary"
                        placeholder="N° commande, code article, client..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-48">
                    <label
                      htmlFor="orders-status-filter"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Statut
                    </label>
                    <Select
                      value={workView || "all"}
                      onValueChange={(v) =>
                        setWorkView((v === "all" ? "" : v) as "" | OrderStatus)
                      }
                    >
                      <SelectTrigger
                        id="orders-status-filter"
                        className="h-11 min-h-11 w-full rounded-lg border-border bg-muted/50 data-[size=default]:h-11"
                      >
                        <SelectValue placeholder="Tous les statuts" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderFilterOptions.map((opt) => (
                          <SelectItem
                            key={opt.value || "all"}
                            value={opt.value || "all"}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full md:w-72">
                    <span className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Période
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-11 w-full justify-start rounded-lg border-border bg-muted/50 text-left font-normal data-[empty=true]:text-muted-foreground"
                          data-empty={
                            !dateFrom && !dateTo
                          }
                        >
                          <CalendarIcon className="mr-2 size-4" />
                          {dateFrom && dateTo
                            ? `${formatDateCompact(new Date(dateFrom))} – ${formatDateCompact(new Date(dateTo))}`
                            : !dateFrom && !dateTo
                              ? "Choisir une période"
                              : dateFrom
                                ? `À partir du ${formatDateCompact(new Date(dateFrom))}`
                                : `Jusqu'au ${formatDateCompact(new Date(dateTo!))}`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          defaultMonth={
                            dateFrom
                              ? new Date(dateFrom)
                              : dateTo
                                ? new Date(dateTo)
                                : new Date()
                          }
                          selected={
                            dateFrom || dateTo
                              ? {
                                  from: dateFrom ? new Date(dateFrom) : undefined,
                                  to: dateTo ? new Date(dateTo) : undefined,
                                }
                              : undefined
                          }
                          onSelect={(range: DateRange | undefined) => {
                            setDateFrom(
                              range?.from?.toISOString().slice(0, 10) ?? "",
                            );
                            setDateTo(
                              range?.to?.toISOString().slice(0, 10) ?? "",
                            );
                          }}
                          numberOfMonths={2}
                          locale={fr}
                          className="rounded-lg border-0"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button
                    type="button"
                    size="default"
                    className="h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => void utils.orders.list.invalidate()}
                  >
                    Rafraîchir
                  </Button>
                </div>
              </CardContent>
            </Card>

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
            <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
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
                          className="flex size-5 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
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
                          className="flex size-5 items-center justify-center rounded border border-input bg-transparent text-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
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
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 font-bold text-primary",
                      cell: (order) => (
                        <button
                          type="button"
                          onClick={() => setDetailOrderId(order.id)}
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
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4",
                      cell: (order) => (
                        <StatusBadge
                          status={order.status as OrderStatus}
                          depositStatus={order.depositStatus}
                          onShowDeposit={() => setDetailOrderId(order.id)}
                        />
                      ),
                    },
                    {
                      id: "code",
                      header: "Code article",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 text-sm font-medium text-foreground",
                      cell: (order) => order.liveItemCode ?? "—",
                    },
                    {
                      id: "client",
                      header: "Client",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
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
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 text-sm text-muted-foreground",
                      cell: (order) => formatDateTime(new Date(order.createdAt)),
                    },
                  ]}
                  actions={(order) => (
                    <OrderStatusControl
                      orderId={order.id}
                      orderNumber={order.orderNumber}
                      status={order.status}
                    />
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
          orderId={detailOrderId}
          open={detailOrderId !== null}
          onOpenChange={(open) => {
            if (!open) setDetailOrderId(null);
          }}
        />
      </TooltipProvider>
    </>
  );
}
