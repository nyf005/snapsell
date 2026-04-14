"use client";

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import Link from "next/link";
import { api, type RouterOutputs } from "~/trpc/react";
import type { z } from "zod";
import { eventTypeEnumSchema } from "~/server/api/routers/eventLog.schema";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
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
import { Spinner } from "~/components/ui/spinner";
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
    label: "Sessions live",
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
        label: `Commande → ${toLabel}`,
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
      return { label: "Client promu (liste d'attente)", category: "Réservation", categoryVariant: "default", Icon: Users };
    case "reservation_reminder_sent":
      return { label: "Rappel de réservation envoyé", category: "Message", categoryVariant: "outline", Icon: MessageSquare };
    case "live_session_created":
      return { label: "Session live démarrée", category: "Live", categoryVariant: "default", Icon: Radio };
    case "live_session_closed":
      return { label: "Session live terminée", category: "Live", categoryVariant: "outline", Icon: Radio };
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
      return { label: "Message doublon ignoré", category: "Message", categoryVariant: "outline", Icon: MessageSquare };
    case "opt_out_recorded":
      return { label: "Client désabonné (opt-out)", category: "Message", categoryVariant: "destructive", Icon: MessageSquareOff };
    case "message_blocked_optout":
      return { label: "Message bloqué — opt-out", detail: "Ce client ne peut pas être contacté", category: "Message", categoryVariant: "destructive", Icon: MessageSquareOff };
    default:
      return { label: event.eventType, category: "—", categoryVariant: "outline", Icon: ScrollText };
  }
}

function actorLabel(actorType: string): string {
  if (actorType === "system") return "Système";
  if (actorType === "agent") return "Agent IA";
  if (actorType === "seller") return "Vendeur";
  return actorType;
}

// ─── Formatage des dates ──────────────────────────────────────────────────────

function formatEventDate(date: Date) {
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

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "À l'instant";
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMin / 60);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Il y a ${diffD}j`;
  return formatEventDate(date);
}

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
      setExportError(
        e instanceof Error ? e.message : "Export impossible. Réessayez.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          {/* En-tête */}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-black tracking-tight">
              Journal d&apos;activité
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Historique complet de ce qui s&apos;est passé : commandes,
              réservations, sessions live, messages. Filtrez par catégorie ou
              période.
            </p>
          </div>

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
                            ? `${formatDateShort(new Date(dateFrom))} – ${formatDateShort(new Date(dateTo))}`
                            : !dateFrom && !dateTo
                              ? "Choisir une période"
                              : dateFrom
                                ? `À partir du ${formatDateShort(new Date(dateFrom))}`
                                : `Jusqu'au ${formatDateShort(new Date(dateTo!))}`}
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
                <div className="min-h-0 flex-1 overflow-x-auto">
                  <Table aria-label="Journal d'activité">
                    <TableHeader>
                      <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                        <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Événement
                        </TableHead>
                        <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Catégorie
                        </TableHead>
                        <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Acteur
                        </TableHead>
                        <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Date
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={4}
                            className="px-6 py-16 text-center"
                          >
                            <Empty className="mx-auto max-w-sm border-0 p-0">
                              <EmptyHeader>
                                <EmptyMedia
                                  variant="icon"
                                  className="size-14 rounded-2xl [&_svg]:size-7"
                                >
                                  <ScrollText />
                                </EmptyMedia>
                                <EmptyTitle>Aucun événement</EmptyTitle>
                                <EmptyDescription>
                                  Aucun événement ne correspond à ces critères.
                                  Modifiez les filtres.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedItems.map((row, idx) => {
                          const { label, detail, category: cat, categoryVariant, Icon, href } =
                            eventPresentation(row);
                          return (
                            <TableRow
                              key={row.id}
                              className={`border-border transition-colors hover:bg-muted/40 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                            >
                              <TableCell className="px-6 py-4">
                                {href ? (
                                  <Link
                                    href={href}
                                    className="group flex flex-col gap-0.5"
                                  >
                                    <span className="flex items-center gap-1.5 text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                                      {label}
                                    </span>
                                    {detail && (
                                      <span className="ml-5 text-xs text-muted-foreground">
                                        {detail}
                                      </span>
                                    )}
                                  </Link>
                                ) : (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                                      {label}
                                    </span>
                                    {detail && (
                                      <span className="ml-5 text-xs text-muted-foreground">
                                        {detail}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <Badge
                                  variant={categoryVariant}
                                  className="whitespace-nowrap"
                                >
                                  {cat}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                {actorLabel(row.actorType)}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                <span
                                  title={formatEventDate(new Date(row.createdAt))}
                                >
                                  {formatRelativeTime(new Date(row.createdAt))}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
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
