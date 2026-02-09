"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { api, type RouterOutputs } from "~/trpc/react";
import type { z } from "zod";
import { eventTypeEnumSchema } from "~/server/api/routers/eventLog.schema";

type EventLogItem = RouterOutputs["eventLog"]["list"]["items"][number];
type EventType = z.infer<typeof eventTypeEnumSchema>;
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
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
import { ScrollText, CalendarIcon, Download, Info } from "lucide-react";

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

export function AuditTrailContent() {
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [correlationIdSearch, setCorrelationIdSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const queryInput = useMemo(
    () => ({
      eventType: (eventTypeFilter || undefined) as EventType | undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      correlationId: correlationIdSearch.trim() || undefined,
      limit: 50,
      cursor,
    }),
    [eventTypeFilter, dateFrom, dateTo, correlationIdSearch, cursor],
  );

  const exportFilters = useMemo(
    () => ({
      eventType: (eventTypeFilter || undefined) as EventType | undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      correlationId: correlationIdSearch.trim() || undefined,
    }),
    [eventTypeFilter, dateFrom, dateTo, correlationIdSearch],
  );

  const utils = api.useUtils();
  const { data, isLoading } = api.eventLog.list.useQuery(queryInput);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await utils.eventLog.exportCsv.fetch(exportFilters);
      const blob = new Blob([result.csv], {
        type: "text/csv;charset=utf-8",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = result.filename;
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

  const loadMore = () => {
    if (nextCursor) setCursor(nextCursor);
  };

  const resetCursor = () => {
    setCursor(undefined);
    setAccumulatedItems([]);
  };

  return (
    <>
      <DashboardHeader />
      <TooltipProvider>
        <main className="flex flex-1 flex-col bg-background text-foreground">
          <div className="container mx-auto space-y-8 px-6 py-8 md:px-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-black tracking-tight">
                Journal d&apos;événements
              </h1>
              <p className="max-w-2xl text-muted-foreground">
                Consultez l&apos;audit trail (Event Log) avec filtres par type,
                période et correlationId. Export en CSV possible.
              </p>
            </div>

            <Card className="rounded-xl border border-border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4">
                <div className="grid w-full grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="min-w-0">
                    <label
                      htmlFor="audit-event-type"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Type d&apos;événement
                    </label>
                    <Select
                      value={eventTypeFilter || "all"}
                      onValueChange={(v) => {
                        setEventTypeFilter(v === "all" ? "" : (v as EventType));
                        resetCursor();
                      }}
                    >
                      <SelectTrigger
                        id="audit-event-type"
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
                      htmlFor="audit-correlation-id"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Correlation ID
                    </label>
                    <Input
                      id="audit-correlation-id"
                      className="h-9 w-full border-border bg-muted/50"
                      placeholder="Rechercher…"
                      value={correlationIdSearch}
                      onChange={(e) => {
                        setCorrelationIdSearch(e.target.value);
                        resetCursor();
                      }}
                      aria-label="Filtrer par correlation ID"
                    />
                  </div>
                  <div className="min-w-0">
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
                                  to: dateTo
                                    ? new Date(dateTo)
                                    : undefined,
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
                            resetCursor();
                          }}
                          numberOfMonths={2}
                          locale={fr}
                          className="rounded-lg border-0"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      className="h-9 gap-2"
                      onClick={() => void handleExportCsv()}
                      disabled={isExporting}
                      aria-label="Exporter l'audit trail en CSV"
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
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-2xl border-border gap-0 pt-0 shadow-sm">
              {isLoading && !data ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                  <Spinner className="size-8" />
                  <span className="text-sm">Chargement…</span>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-x-auto">
                    <Table aria-label="Journal d'événements (audit trail)">
                      <TableHeader>
                        <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
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
                          <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Date
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
                              <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                                {formatEventDate(new Date(row.createdAt))}
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
                                      {JSON.stringify(
                                        row.payload,
                                        null,
                                        2,
                                      )}
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
                  {nextCursor && (
                    <div className="flex justify-center border-t border-border bg-muted/30 px-6 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMore}
                        disabled={isLoading}
                      >
                        Charger la suite
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
        </main>
      </TooltipProvider>
    </>
  );
}
