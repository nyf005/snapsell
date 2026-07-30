"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { api, type RouterOutputs } from "~/trpc/react";
import type { z } from "zod";
import { eventTypeEnumSchema } from "~/server/api/routers/eventLog.schema";
import { useDebounce } from "~/hooks/use-debounce";
import { Button } from "~/components/ui/button";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { DataPagination } from "~/components/ui/data-pagination";
import { ScrollText, CalendarIcon, Info, Shield } from "lucide-react";

type EventLogItem = RouterOutputs["ops"]["eventLogs"]["list"]["items"][number];
type EventType = z.infer<typeof eventTypeEnumSchema>;

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tous les types" },
  { value: "webhook_received", label: "Webhook reçu" },
  { value: "message_sent", label: "Message envoyé" },
  { value: "idempotent_ignored", label: "Idempotent ignoré" },
  { value: "live_session_created", label: "Session live créée" },
  { value: "live_session_closed", label: "Session live fermée" },
  { value: "live_item_created", label: "Item live créé" },
  { value: "reservation_started", label: "Réservation démarrée" },
  { value: "reservation_confirmed", label: "Réservation confirmée" },
  { value: "reservation_expired", label: "Réservation expirée" },
  { value: "waitlist_promoted", label: "Waitlist promue" },
  { value: "order_created", label: "Commande créée" },
  { value: "order.status_changed", label: "Statut commande" },
  { value: "deposit_approved", label: "Acompte approuvé" },
  { value: "deposit_rejected", label: "Acompte refusé" },
];

function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDateShort(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Retourne YYYY-MM-DD en date locale (pas UTC) pour éviter les décalages timezone. */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function OpsEventLogsContent() {
  const [tenantId, setTenantId] = useState<string>("");
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [correlationIdSearch, setCorrelationIdSearch] = useState("");
  const debouncedCorrelationId = useDebounce(correlationIdSearch.trim(), 400);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Charger la liste des tenants pour le filtre
  const { data: tenantsData } = api.ops.tenants.list.useQuery();

  const queryInput = useMemo(
    () => ({
      tenantId: tenantId || undefined,
      eventType: (eventTypeFilter || undefined) as EventType | undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      correlationId: debouncedCorrelationId || undefined,
      limit: 50,
      cursor,
    }),
    [tenantId, eventTypeFilter, dateFrom, dateTo, debouncedCorrelationId, cursor],
  );

  // Activer la requête si tenant OU correlationId fourni (CR 7B-1 M1)
  const canQuery = !!(tenantId || debouncedCorrelationId);
  const { data, isLoading, error } = api.ops.eventLogs.list.useQuery(
    queryInput,
    {
      enabled: canQuery,
    },
  );

  const [accumulatedItems, setAccumulatedItems] = useState<EventLogItem[]>([]);

  useEffect(() => {
    if (!data?.items) return;
    if (!cursor) {
      setAccumulatedItems(data.items);
    } else {
      setAccumulatedItems((prev) => [...prev, ...data.items]);
    }
  }, [data?.items, cursor]);

  const items = accumulatedItems;
  const nextCursor = data?.nextCursor;
  const tenantName = data?.tenantName;

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const resetCursor = () => {
    setCursor(undefined);
    setAccumulatedItems([]);
  };

  const handleFilterChange = () => {
    resetCursor();
  };

  return (
    <>
      <TooltipProvider>
        <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
          <div className="space-y-8 p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Shield className="size-6 text-primary" />
                <h1 className="text-3xl font-black tracking-tight">
                  Console Ops – Logs d&apos;événements
                </h1>
              </div>
              <p className="max-w-2xl text-muted-foreground">
                Consultez les logs d&apos;événements pour diagnostiquer les
                incidents. Filtrez par tenant et correlationId pour obtenir le
                film complet d&apos;un incident.
              </p>
            </div>

            <Card className="rounded-xl border border-border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="grid w-full grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_1fr]">
                  <div className="min-w-0">
                    <label
                      htmlFor="ops-tenant-select"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Tenant
                    </label>
                    <Select
                      value={tenantId}
                      onValueChange={(v) => {
                        setTenantId(v);
                        handleFilterChange();
                      }}
                    >
                      <SelectTrigger
                        id="ops-tenant-select"
                        className="h-9 w-full border-border bg-muted/50"
                      >
                        <SelectValue placeholder="Sélectionner un tenant" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenantsData?.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor="ops-event-type"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Type d&apos;événement
                    </label>
                    <Select
                      value={eventTypeFilter || "all"}
                      onValueChange={(v) => {
                        setEventTypeFilter(v === "all" ? "" : (v as EventType));
                        handleFilterChange();
                      }}
                      disabled={!canQuery}
                    >
                      <SelectTrigger
                        id="ops-event-type"
                        className="h-9 w-full border-border bg-muted/50"
                      >
                        <SelectValue placeholder="Tous" />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPE_OPTIONS.map((opt) => (
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
                  <div className="min-w-0">
                    <label
                      htmlFor="ops-correlation-id"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Correlation ID
                    </label>
                    <Input
                      id="ops-correlation-id"
                      className="h-9 w-full border-border bg-muted/50"
                      placeholder="Rechercher (cross-tenant)…"
                      value={correlationIdSearch}
                      onChange={(e) => {
                        setCorrelationIdSearch(e.target.value);
                        handleFilterChange();
                      }}
                      aria-label="Filtrer par correlation ID"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Période
                    </span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-9 w-full justify-start rounded-lg border-border bg-muted/50 text-left text-sm font-normal data-[empty=true]:text-muted-foreground"
                          data-empty={!dateFrom && !dateTo}
                          disabled={!canQuery}
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
                              range?.from ? toLocalDateString(range.from) : "",
                            );
                            setDateTo(
                              range?.to ? toLocalDateString(range.to) : "",
                            );
                            handleFilterChange();
                          }}
                          numberOfMonths={2}
                          locale={fr}
                          className="rounded-lg border-0"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!canQuery ? (
              <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                  <Shield className="size-12" />
                  <p className="text-sm font-medium">
                    Sélectionnez un tenant ou saisissez un correlationId
                  </p>
                </div>
              </Card>
            ) : error ? (
              <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-destructive">
                  <p className="text-sm font-medium">
                    Erreur lors du chargement des logs
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error.message}
                  </p>
                </div>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
                {isLoading && !data ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Spinner className="size-8" />
                    <span className="text-sm">Chargement…</span>
                  </div>
                ) : (
                  <>
                    {tenantName ? (
                      <div className="border-b border-border bg-muted/30 px-6 py-3">
                        <p className="text-sm font-medium">
                          Tenant : <span className="text-muted-foreground">{tenantName}</span>
                        </p>
                      </div>
                    ) : debouncedCorrelationId && !tenantId ? (
                      <div className="border-b border-border bg-muted/30 px-6 py-3">
                        <p className="text-sm font-medium">
                          Recherche cross-tenant : <span className="font-mono text-muted-foreground">{debouncedCorrelationId}</span>
                        </p>
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-x-auto">
                      <Table aria-label="Logs d'événements (console ops)">
                        <TableHeader>
                          <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                            <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Date
                            </TableHead>
                            <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Type
                            </TableHead>
                            <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Entité
                            </TableHead>
                            <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Correlation ID
                            </TableHead>
                            <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Acteur
                            </TableHead>
                            <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Détails
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell
                                colSpan={6}
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
                                      Aucun événement ne correspond aux critères.
                                      Modifiez les filtres.
                                    </EmptyDescription>
                                  </EmptyHeader>
                                </Empty>
                              </TableCell>
                            </TableRow>
                          ) : (
                            items.map((row) => (
                              <TableRow
                                key={row.id}
                                className="border-border hover:bg-muted/40"
                              >
                                <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                  {formatEventDate(new Date(row.createdAt))}
                                </TableCell>
                                <TableCell className="px-6 py-4 font-medium">
                                  {row.eventType}
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                  {row.entityType}
                                  {row.entityId ? ` (${row.entityId})` : ""}
                                </TableCell>
                                <TableCell className="px-6 py-4 font-mono text-xs text-muted-foreground">
                                  {row.correlationId}
                                </TableCell>
                                <TableCell className="px-6 py-4 text-sm">
                                  {row.actorType}
                                </TableCell>
                                <TableCell className="px-6 py-4 text-right">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-9 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label="Voir les détails du payload"
                                      >
                                        <Info className="size-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="left"
                                      className="max-w-md break-all font-mono text-xs"
                                    >
                                      <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(row.payload, null, 2)}
                                      </pre>
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <DataPagination
                      totalItems={items.length}
                      pageSize={1}
                      summary={`${items.length} événement${items.length > 1 ? "s" : ""}`}
                      onNext={loadMore}
                      hasNext={Boolean(nextCursor)}
                      isLoading={isLoading}
                    />
                  </>
                )}
              </Card>
            )}
          </div>
        </main>
      </TooltipProvider>
    </>
  );
}
