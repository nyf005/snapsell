"use client";

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import Link from "next/link";
import { api, type RouterOutputs } from "~/trpc/react";
import { formatDateCompact, formatDateTime, formatErrorText, formatRelativeDate, humanizeEventType } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import type { z } from "zod";
import { eventTypeEnumSchema } from "~/server/api/routers/eventLog.schema";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

import { AuditTrailSkeleton } from "./audit-trail-skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { DataPagination } from "~/components/ui/data-pagination";
import {
  ScrollText,
  CalendarIcon,
  Download,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  MessageSquare,
  MessageSquareOff,
  ArrowRight,
  PackageCheck,
  Wallet,
  Package,
  Users,
  Truck,
} from "lucide-react";

type EventLogItem = RouterOutputs["eventLog"]["list"]["items"][number];
type EventType = z.infer<typeof eventTypeEnumSchema>;

// ─── Catégories pour les filtres ─────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: string; label: string; types: EventType[] }[] = [
  {
    value: "orders",
    label: "Commandes",
    types: ["order_created", "order.status_changed", "deposit_requested", "deposit_approved", "deposit_rejected"],
  },
  {
    value: "reservations",
    label: "Réservations",
    types: ["reservation_started", "reservation_expired", "waitlist_promoted", "reservation_reminder_sent", "reservation_hold", "reservation_released", "reservation_confirmed"],
  },
  {
    value: "live",
    label: "Lives",
    types: ["live_session_created", "live_session_closed", "live_item_created", "live_item_duplicate_rejected", "live_item_photo_linked"],
  },
  {
    value: "messages",
    label: "Messages",
    types: ["message_sent", "webhook_received", "idempotent_ignored", "opt_out_recorded", "message_blocked_optout"],
  },
];

const ALL_CATEGORIES = [
  { value: "", label: "Toutes les catégories", types: [] as EventType[] },
  ...CATEGORY_OPTIONS,
];

// ─── Mapping event → présentation lisible ────────────────────────────────────

type EventPresentation = {
  label: string;
  detail?: string;
  category: string;
  categoryVariant: "default" | "secondary" | "success" | "destructive" | "outline";
  Icon: React.ElementType;
  href?: string;
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmée",
  confirmed_pending_deposit: "Attente acompte",
  preparing: "En préparation",
  in_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

function eventPresentation(event: EventLogItem): EventPresentation {
  const p = event.payload as Record<string, unknown> | null ?? {};
  const orderHref =
    event.entityId && event.entityType === "order"
      ? `/dashboard/orders/${event.entityId}`
      : undefined;

  switch (event.eventType) {
    case "order_created":
      return { label: "Nouvelle commande", detail: p.orderNumber ? `N° ${p.orderNumber as string}` : undefined, category: "Commande", categoryVariant: "default", Icon: ShoppingCart, href: orderHref };
    case "deposit_requested":
      return { label: "Acompte demandé", detail: p.orderNumber ? `N° ${p.orderNumber as string}` : undefined, category: "Acompte", categoryVariant: "secondary", Icon: Wallet, href: orderHref };
    case "deposit_approved":
      return { label: "Acompte validé", detail: p.orderNumber ? `N° ${p.orderNumber as string}` : undefined, category: "Acompte", categoryVariant: "success", Icon: CheckCircle2, href: orderHref };
    case "deposit_rejected":
      return { label: "Acompte refusé", detail: p.orderNumber ? `N° ${p.orderNumber as string}` : undefined, category: "Acompte", categoryVariant: "destructive", Icon: XCircle, href: orderHref };
    case "order.status_changed": {
      const toLabel = p.to ? (STATUS_LABELS[p.to as string] ?? (p.to as string)) : "?";
      const isCancelled = p.to === "cancelled";
      const isDelivered = p.to === "delivered";
      return {
        label: `Commande passée à « ${toLabel} »`,
        detail: p.orderNumber ? `N° ${p.orderNumber as string}` : undefined,
        category: "Statut",
        categoryVariant: isCancelled ? "destructive" : isDelivered ? "success" : "outline",
        Icon: isCancelled ? XCircle : isDelivered ? PackageCheck : Truck,
        href: orderHref,
      };
    }
    case "reservation_started":
      return { label: "Réservation démarrée", detail: p.itemCode ? `Article ${p.itemCode as string}` : undefined, category: "Réservation", categoryVariant: "default", Icon: Package };
    case "reservation_expired":
      return { label: "Réservation expirée", detail: p.itemCode ? `Article ${p.itemCode as string}` : undefined, category: "Réservation", categoryVariant: "secondary", Icon: Clock };
    case "reservation_confirmed":
      return { label: "Réservation confirmée", category: "Réservation", categoryVariant: "success", Icon: CheckCircle2 };
    case "reservation_hold":
      return { label: "Réservation mise en attente", category: "Réservation", categoryVariant: "outline", Icon: Clock };
    case "reservation_released":
      return { label: "Réservation libérée", category: "Réservation", categoryVariant: "outline", Icon: ArrowRight };
    case "waitlist_promoted":
      return { label: "Place libérée — file d’attente", category: "Réservation", categoryVariant: "default", Icon: Users };
    case "reservation_reminder_sent":
      return { label: "Rappel de réservation envoyé", category: "Message", categoryVariant: "outline", Icon: MessageSquare };
    case "live_session_created":
      return { label: "Live démarré", category: "Live", categoryVariant: "default", Icon: Radio };
    case "live_session_closed":
      return { label: "Live terminé", category: "Live", categoryVariant: "outline", Icon: Radio };
    case "live_item_created":
      return { label: "Article live ajouté", detail: p.code ? `Code : ${p.code as string}` : undefined, category: "Live", categoryVariant: "default", Icon: Package };
    case "live_item_duplicate_rejected":
      return { label: "Article dupliqué rejeté", detail: p.code ? `Code : ${p.code as string}` : undefined, category: "Live", categoryVariant: "secondary", Icon: XCircle };
    case "live_item_photo_linked":
      return { label: "Photo liée à l'article", category: "Live", categoryVariant: "outline", Icon: Package };
    case "message_sent":
      return { label: "Message envoyé au client", category: "Message", categoryVariant: "outline", Icon: MessageSquare };
    case "webhook_received":
      return { label: "Message entrant reçu", category: "Message", categoryVariant: "outline", Icon: MessageSquare };
    case "idempotent_ignored":
      return { label: "Doublon détecté, aucune action nécessaire", category: "Message", categoryVariant: "outline", Icon: MessageSquare };
    case "opt_out_recorded":
      return { label: "Désabonnement", category: "Message", categoryVariant: "destructive", Icon: MessageSquareOff };
    case "message_blocked_optout":
      return { label: "Message non envoyé — numéro désabonné", detail: "Ce numéro a demandé à ne plus recevoir de messages", category: "Message", categoryVariant: "destructive", Icon: MessageSquareOff };
    default:
      // Sans ce repli, le type technique en snake_case s’affichait tel quel.
      return {
        label: humanizeEventType(event.eventType),
        category: "—",
        categoryVariant: "outline",
        Icon: ScrollText,
      };
  }
}

function actorLabel(actorType: string): string {
  if (actorType === "system") return "Système";
  if (actorType === "agent") return "Automatisation";
  if (actorType === "seller") return "Vendeur";
  return actorType;
}

// ─── Formatage des dates ──────────────────────────────────────────────────────

// ─── Composant principal ──────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20;

export function AuditTrailContent({
  tenantId,
  canExportCsv,
}: {
  tenantId: string | null;
  canExportCsv: boolean;
}) {
  const [category, setCategory] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const categoryTypes = useMemo(
    () => CATEGORY_OPTIONS.find((c) => c.value === category)?.types ?? [],
    [category],
  );

  const queryInput = useMemo(
    () => ({
      tenantId: tenantId ?? undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 100,
      cursor: undefined,
    }),
    [tenantId, dateFrom, dateTo],
  );

  const exportFilters = useMemo(
    () => ({
      tenantId: tenantId ?? undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [tenantId, dateFrom, dateTo],
  );

  const utils = api.useUtils();
  const { data, isLoading } = api.eventLog.list.useQuery(queryInput);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const allItems = data?.items ?? [];
  const items = useMemo(() => {
    if (!category || categoryTypes.length === 0) return allItems;
    return allItems.filter((e) =>
      (categoryTypes as string[]).includes(e.eventType),
    );
  }, [allItems, category, categoryTypes]);

  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = items.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await utils.eventLog.exportCsv.fetch(exportFilters);
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setExportError(formatErrorText(e, "generic"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          <TaskPageHeader
            href="/dashboard/audit"
          />

          {/* Filtres */}
          <Card className="rounded-xl border border-border bg-card shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[180px] flex-1">
                  <label
                    htmlFor="audit-category"
                    className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Catégorie
                  </label>
                  <Select
                    value={category || "all"}
                    onValueChange={(v) => {
                      setCategory(v === "all" ? "" : v);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger
                      id="audit-category"
                      className="h-9 w-full border-border bg-muted/50"
                    >
                      <SelectValue placeholder="Toutes" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_CATEGORIES.map((opt) => (
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

                <div className="min-w-[220px] flex-1">
                  <label className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Période
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 w-full justify-start rounded-lg border-border bg-muted/50 text-left text-sm font-normal data-[empty=true]:text-muted-foreground"
                        data-empty={!dateFrom && !dateTo}
                      >
                        <CalendarIcon className="mr-2 size-4 shrink-0" />
                        <span className="min-w-0 truncate">
                          {dateFrom && dateTo
                            ? `${formatDateCompact(new Date(dateFrom))} – ${formatDateCompact(new Date(dateTo))}`
                            : !dateFrom && !dateTo
                              ? "Choisir une période"
                              : dateFrom
                                ? `À partir du ${formatDateCompact(new Date(dateFrom))}`
                                : `Jusqu'au ${formatDateCompact(new Date(dateTo!))}`}
                        </span>
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
                                from: dateFrom
                                  ? new Date(dateFrom)
                                  : undefined,
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
                          setCurrentPage(1);
                        }}
                        numberOfMonths={2}
                        locale={fr}
                        className="rounded-lg border-0"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {canExportCsv && (
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      className="h-9 gap-2"
                      onClick={() => void handleExportCsv()}
                      disabled={isExporting}
                      aria-label="Exporter le journal en CSV"
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
            </CardContent>
          </Card>

          {/* Tableau */}
          <Card className="overflow-hidden rounded-2xl border-border gap-0 p-0 shadow-sm">
            {isLoading && !data ? (
              <div className="p-6">
                <AuditTrailSkeleton />
              </div>
            ) : (
              <>
                <DataList
                  items={paginatedItems}
                  getKey={(row) => row.id}
                  label="Journal d’activité"
                  columns={[
                    {
                      id: "event",
                      header: "Événement",
                      role: "primary",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4",
                      cell: (row) => {
                        const { label, detail, Icon, href } = eventPresentation(row);
                        const body = (
                          <>
                            <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                              {label}
                            </span>
                            {detail && (
                              <span className="ml-5 text-xs text-muted-foreground">
                                {detail}
                              </span>
                            )}
                          </>
                        );
                        return href ? (
                          <Link href={href} className="group flex flex-col gap-0.5">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex flex-col gap-0.5">{body}</div>
                        );
                      },
                    },
                    {
                      id: "date",
                      header: "Date",
                      role: "secondary",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 text-sm text-muted-foreground",
                      cell: (row) => (
                        <span title={formatDateTime(new Date(row.createdAt))}>
                          {formatRelativeDate(new Date(row.createdAt))}
                        </span>
                      ),
                    },
                    {
                      id: "category",
                      header: "Catégorie",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4",
                      cell: (row) => {
                        const { category, categoryVariant } = eventPresentation(row);
                        return (
                          <Badge variant={categoryVariant} className="whitespace-nowrap">
                            {category}
                          </Badge>
                        );
                      },
                    },
                    {
                      id: "actor",
                      header: "Acteur",
                      role: "meta",
                      headerClassName: "px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                      className: "px-6 py-4 text-sm text-muted-foreground",
                      cell: (row) => actorLabel(row.actorType),
                    },
                  ]}
                  empty={
                    <Empty className="mx-auto max-w-sm border-0 p-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon" className="size-14 rounded-2xl [&_svg]:size-7">
                          <ScrollText />
                        </EmptyMedia>
                        <EmptyTitle>Aucun événement</EmptyTitle>
                        <EmptyDescription>
                          Aucun événement ne correspond à ces critères. Élargissez la période
                          ou changez le type d’activité.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  }
                />
                <DataPagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={items.length}
                  pageSize={ITEMS_PER_PAGE}
                  itemLabel={`événement${items.length > 1 ? "s" : ""}`}
                  onPageChange={setCurrentPage}
                  className="pb-0"
                />
              </>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
