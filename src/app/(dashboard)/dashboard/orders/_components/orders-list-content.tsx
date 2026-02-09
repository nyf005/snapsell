"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { api } from "~/trpc/react";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Card, CardContent } from "~/components/ui/card";
import { KpiCard } from "~/components/ui/kpi-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
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
import {
  Package,
  ListOrdered,
  Wallet,
  Truck,
  XCircle,
  Search,
  CheckCircle,
  Eye,
  Ban,
  CalendarIcon,
  FileCheck,
  Download,
} from "lucide-react";
import { getAllowedNextStatuses } from "~/lib/order-status-transitions";
function formatOrderDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateShort(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

type OrderStatus =
  | "confirmed"
  | "confirmed_pending_deposit"
  | "preparing"
  | "in_delivery"
  | "delivered"
  | "cancelled";

const STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: "Confirmée",
  confirmed_pending_deposit: "En attente acompte",
  preparing: "Prépa",
  in_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

const STATUS_FILTER_OPTIONS: { value: "" | OrderStatus; label: string }[] = [
  { value: "", label: "Tous les statuts" },
  { value: "confirmed", label: "Confirmée" },
  { value: "confirmed_pending_deposit", label: "En attente acompte" },
  { value: "preparing", label: "Prépa" },
  { value: "in_delivery", label: "En livraison" },
  { value: "delivered", label: "Livrée" },
  { value: "cancelled", label: "Annulée" },
];

/** Story 6.3: transitions depuis ~/lib/order-status-transitions (partagé avec le serveur). */

function StatusBadge({
  status,
  depositStatus,
}: {
  status: OrderStatus;
  depositStatus?: string | null;
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
  const label = STATUS_LABELS[status];
  const content = (
    <Badge variant={variant} className="whitespace-nowrap">
      {label}
    </Badge>
  );
  if (status === "confirmed_pending_deposit" && depositStatus) {
    const depositLabel =
      depositStatus === "deposit_received"
        ? "reçu"
        : depositStatus === "no_deposit"
          ? "aucun"
          : depositStatus === "pending"
            ? "en attente"
            : depositStatus;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>Acompte : {depositLabel}</TooltipContent>
      </Tooltip>
    );
  }
  return content;
}

const canChangeStatus = (s: OrderStatus) =>
  getAllowedNextStatuses(s as Parameters<typeof getAllowedNextStatuses>[0]).length > 0;

export function OrdersListContent({ canExportCsv = false }: { canExportCsv?: boolean }) {
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const queryInput = useMemo(
    () => ({
      status: statusFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [statusFilter, dateFrom, dateTo],
  );

  const utils = api.useUtils();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data: orders = [], isLoading } = api.orders.list.useQuery(queryInput);
  const { data: pendingProofCount = 0 } = api.proofs.pendingCount.useQuery();
  const updateStatus = api.orders.updateStatus.useMutation({
    onSuccess: () => {
      void utils.orders.list.invalidate();
    },
    onMutate: () => {
      updateStatus.reset();
    },
  });

  const handleExportCsv = async () => {
    if (!canExportCsv) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const data = await utils.orders.exportCsv.fetch(queryInput);
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
        e instanceof Error ? e.message : "Export impossible. Réessayez.";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
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
        <main className="flex flex-1 flex-col bg-background text-foreground">
          <div className="container mx-auto space-y-8 px-6 py-8 md:px-8">
            {/* Page Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black tracking-tight">
                  Gestion des commandes
                </h1>
                <p className="max-w-2xl text-muted-foreground">
                  Consultez la liste des commandes avec filtres par statut et date.
                  Gérez les livraisons et annulations.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pendingProofCount > 0 && (
                  <Link
                    href="/dashboard/proofs"
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
              </div>
            </div>

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

            {/* Filter Section */}
            <Card className="rounded-xl border border-border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[200px] flex-1 md:min-w-[280px]">
                    <label className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Recherche
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
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
                      value={statusFilter || "all"}
                      onValueChange={(v) =>
                        setStatusFilter((v === "all" ? "" : v) as "" | OrderStatus)
                      }
                    >
                      <SelectTrigger
                        id="orders-status-filter"
                        className="h-11 min-h-11 w-full rounded-lg border-border bg-muted/50 data-[size=default]:h-11"
                      >
                        <SelectValue placeholder="Tous les statuts" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_FILTER_OPTIONS.map((opt) => (
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
                    <label className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Période
                    </label>
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
                            ? `${formatDateShort(new Date(dateFrom))} – ${formatDateShort(new Date(dateTo))}`
                            : !dateFrom && !dateTo
                              ? "Choisir une période"
                              : dateFrom
                                ? `À partir du ${formatDateShort(new Date(dateFrom))}`
                                : `Jusqu'au ${formatDateShort(new Date(dateTo!))}`}
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
                {/* Tabs (quick filters) */}
                <div className="flex gap-1 border-t border-border pt-3">
                  {[
                    { value: "" as const, label: "Toutes" },
                    { value: "confirmed" as const, label: "Confirmée" },
                    {
                      value: "confirmed_pending_deposit" as const,
                      label: "En attente acompte",
                    },
                    { value: "preparing" as const, label: "Prépa" },
                    { value: "in_delivery" as const, label: "En livraison" },
                    { value: "delivered" as const, label: "Livrée" },
                    { value: "cancelled" as const, label: "Annulée" },
                  ].map(({ value, label }) => (
                    <button
                      key={value || "all"}
                      type="button"
                      className={`whitespace-nowrap rounded px-4 py-2 text-sm font-semibold transition-colors ${
                        statusFilter === value
                          ? "border-b-2 border-primary text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setStatusFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                  <Spinner className="size-8" />
                  <span className="text-sm">Chargement…</span>
                </div>
              ) : (
                <>
                <div className="min-h-0 flex-1 overflow-x-auto">
                  <Table aria-label="Liste des commandes">
                      <TableHeader>
                        <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                          <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            N° commande
                          </TableHead>
                          <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Code article
                          </TableHead>
                          <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Client
                          </TableHead>
                          <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Statut
                          </TableHead>
                          <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Créée le
                          </TableHead>
                          <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBySearch.length === 0 ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={6} className="px-6 py-16 text-center">
                              <Empty className="mx-auto max-w-sm border-0 p-0">
                                <EmptyHeader>
                                  <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                                    <Package />
                                  </EmptyMedia>
                                  <EmptyTitle>Aucune commande</EmptyTitle>
                                  <EmptyDescription>
                                    Aucune commande ne correspond aux critères. Modifiez les filtres ou la recherche.
                                  </EmptyDescription>
                                </EmptyHeader>
                              </Empty>
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredBySearch.map((order, idx) => {
                            const status = order.status as OrderStatus;
                            const canAct = canChangeStatus(status);
                            return (
                              <TableRow
                                key={order.id}
                                className={`border-border transition-colors hover:bg-muted/40 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                              >
                              <TableCell className="px-6 py-4 font-bold text-primary">
                                {order.orderNumber}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm font-medium text-foreground">
                                {order.liveItemCode ?? "—"}
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-foreground">
                                    {order.clientPhone}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <StatusBadge
                                  status={status}
                                  depositStatus={order.depositStatus}
                                />
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                {formatOrderDate(new Date(order.createdAt))}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-9 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label={`Voir la commande ${order.orderNumber}`}
                                      >
                                        <Eye className="size-5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Voir le détail</TooltipContent>
                                  </Tooltip>
                                  {canAct && (
                                    <Select
                                      value=""
                                      onValueChange={(newStatus) => {
                                        if (newStatus && getAllowedNextStatuses(status as Parameters<typeof getAllowedNextStatuses>[0]).includes(newStatus as OrderStatus)) {
                                          updateStatus.mutate({
                                            orderId: order.id,
                                            status: newStatus as OrderStatus,
                                          });
                                        }
                                      }}
                                      disabled={updateStatus.isPending}
                                      aria-label={`Changer le statut de la commande ${order.orderNumber}`}
                                    >
                                      <SelectTrigger className="h-9 w-[140px] border-border bg-muted/50">
                                        <SelectValue placeholder="Nouveau statut" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getAllowedNextStatuses(status as Parameters<typeof getAllowedNextStatuses>[0]).map((next) => (
                                          <SelectItem
                                            key={next}
                                            value={next}
                                          >
                                            {STATUS_LABELS[next]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                  {status === "delivered" && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground/50">
                                          <CheckCircle className="size-5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Déjà livrée
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {status === "cancelled" && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground/50">
                                          <Ban className="size-5" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        Commande annulée
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                </div>
                <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
                  <p className="text-xs text-muted-foreground">
                    {filteredBySearch.length} sur {filteredBySearch.length} résultat{filteredBySearch.length > 1 ? "s" : ""}
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

            {updateStatus.isError && (
              <p
                className="text-sm text-destructive"
                role="alert"
              >
                {updateStatus.error.message}
              </p>
            )}
          </div>
        </main>
      </TooltipProvider>
    </>
  );
}
