"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { AlertCircle, Info, MailWarning, Shield } from "lucide-react";

/* ──────────────────────── Types ──────────────────────── */

type DlqItem = RouterOutputs["ops"]["dlq"]["list"]["items"][number];
type FailedMsgItem =
  RouterOutputs["ops"]["dlq"]["failedMessages"]["items"][number];

/* ──────────────────────── Options / Helpers ──────────── */

const JOB_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "message_out", label: "Message sortant" },
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function truncate(str: string, maxLen: number) {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}…`;
}

/* ──────────────────────── Component ─────────────────── */

export function OpsErrorsContent() {
  /* ── Shared filters ── */
  const [tenantId, setTenantId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("dlq");

  /* ── DLQ-specific ── */
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [dlqCursor, setDlqCursor] = useState<string | undefined>(undefined);

  /* ── FailedMessages-specific ── */
  const [fmCursor, setFmCursor] = useState<string | undefined>(undefined);

  /* ── Tenants list ── */
  const { data: tenantsData } = api.ops.tenants.list.useQuery();

  /* ────────── DLQ query ────────── */
  const dlqInput = useMemo(
    () => ({
      tenantId: tenantId || undefined,
      jobType: jobTypeFilter || undefined,
      resolved: unresolvedOnly ? false : undefined,
      limit: 50,
      cursor: dlqCursor,
    }),
    [tenantId, jobTypeFilter, unresolvedOnly, dlqCursor],
  );

  const {
    data: dlqData,
    isLoading: dlqLoading,
    error: dlqError,
  } = api.ops.dlq.list.useQuery(dlqInput, { enabled: activeTab === "dlq" });

  const [dlqItems, setDlqItems] = useState<DlqItem[]>([]);
  useEffect(() => {
    if (!dlqData?.items) return;
    if (!dlqCursor) {
      setDlqItems(dlqData.items);
    } else {
      setDlqItems((prev) => [...prev, ...dlqData.items]);
    }
  }, [dlqData?.items, dlqCursor]);

  /* ────────── Failed Messages query ────────── */
  const fmInput = useMemo(
    () => ({
      tenantId: tenantId || undefined,
      limit: 50,
      cursor: fmCursor,
    }),
    [tenantId, fmCursor],
  );

  const {
    data: fmData,
    isLoading: fmLoading,
    error: fmError,
  } = api.ops.dlq.failedMessages.useQuery(fmInput, {
    enabled: activeTab === "failed",
  });

  const [fmItems, setFmItems] = useState<FailedMsgItem[]>([]);
  useEffect(() => {
    if (!fmData?.items) return;
    if (!fmCursor) {
      setFmItems(fmData.items);
    } else {
      setFmItems((prev) => [...prev, ...fmData.items]);
    }
  }, [fmData?.items, fmCursor]);

  /* ── Handlers ── */
  const resetDlq = () => {
    setDlqCursor(undefined);
    setDlqItems([]);
  };
  const resetFm = () => {
    setFmCursor(undefined);
    setFmItems([]);
  };

  const handleTenantChange = (v: string) => {
    setTenantId(v === "__all__" ? "" : v);
    resetDlq();
    resetFm();
  };

  /* ────────────────── Render ────────────────── */
  return (
    <TooltipProvider>
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          {/* Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Shield className="size-6 text-primary" />
              <h1 className="text-3xl font-black tracking-tight">
                Console Ops – File d&apos;erreurs
              </h1>
            </div>
            <p className="max-w-2xl text-muted-foreground">
              Consultez les jobs en échec (DLQ) et les envois échoués pour
              diagnostiquer les incidents.
            </p>
          </div>

          {/* Filters */}
          <Card className="rounded-xl border border-border bg-card shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div className="grid w-full grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
                {/* Tenant filter (shared) */}
                <div className="min-w-0">
                  <label
                    htmlFor="ops-errors-tenant"
                    className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Tenant
                  </label>
                  <Select
                    value={tenantId || "__all__"}
                    onValueChange={handleTenantChange}
                  >
                    <SelectTrigger
                      id="ops-errors-tenant"
                      className="h-9 w-full border-border bg-muted/50"
                    >
                      <SelectValue placeholder="Tous les tenants" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tous les tenants</SelectItem>
                      {tenantsData?.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Job type filter (DLQ tab only) */}
                {activeTab === "dlq" && (
                  <div className="min-w-0">
                    <label
                      htmlFor="ops-errors-job-type"
                      className="mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Type de job
                    </label>
                    <Select
                      value={jobTypeFilter || "__all__"}
                      onValueChange={(v) => {
                        setJobTypeFilter(v === "__all__" ? "" : v);
                        resetDlq();
                      }}
                    >
                      <SelectTrigger
                        id="ops-errors-job-type"
                        className="h-9 w-full border-border bg-muted/50"
                      >
                        <SelectValue placeholder="Tous" />
                      </SelectTrigger>
                      <SelectContent>
                        {JOB_TYPE_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt.value || "__all__"}
                            value={opt.value || "__all__"}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Unresolved-only checkbox (DLQ tab only) */}
                {activeTab === "dlq" && (
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox
                      id="ops-errors-unresolved"
                      checked={unresolvedOnly}
                      onCheckedChange={(checked) => {
                        setUnresolvedOnly(checked === true);
                        resetDlq();
                      }}
                    />
                    <label
                      htmlFor="ops-errors-unresolved"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Non résolu uniquement
                    </label>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs DLQ / Envois échoués */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="dlq">
                <AlertCircle className="mr-1.5 size-4" />
                DLQ
              </TabsTrigger>
              <TabsTrigger value="failed">
                <MailWarning className="mr-1.5 size-4" />
                Envois échoués
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dlq">
              <DlqTable
                items={dlqItems}
                isLoading={dlqLoading}
                error={dlqError}
                hasData={!!dlqData}
                nextCursor={dlqData?.nextCursor}
                onLoadMore={() => {
                  if (dlqData?.nextCursor) setDlqCursor(dlqData.nextCursor);
                }}
              />
            </TabsContent>

            <TabsContent value="failed">
              <FailedMessagesTable
                items={fmItems}
                isLoading={fmLoading}
                error={fmError}
                hasData={!!fmData}
                nextCursor={fmData?.nextCursor}
                onLoadMore={() => {
                  if (fmData?.nextCursor) setFmCursor(fmData.nextCursor);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </TooltipProvider>
  );
}

/* ──────────────── DLQ Table ──────────────── */

function DlqTable({
  items,
  isLoading,
  error,
  hasData,
  nextCursor,
  onLoadMore,
}: {
  items: DlqItem[];
  isLoading: boolean;
  error: { message: string } | null;
  hasData: boolean;
  nextCursor: string | undefined;
  onLoadMore: () => void;
}) {
  if (error) {
    return (
      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-destructive">
          <AlertCircle className="size-12" />
          <p className="text-sm font-medium">
            Erreur lors du chargement de la file d&apos;erreurs
          </p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
      {isLoading && !hasData ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Spinner className="size-8" />
          <span className="text-sm">Chargement…</span>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-x-auto">
            <Table aria-label="File d'erreurs (DLQ)">
              <TableHeader>
                <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Type
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tenant
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Erreur
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tentatives
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Statut
                  </TableHead>
                  <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Détails
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="px-6 py-16 text-center">
                      <Empty className="mx-auto max-w-sm border-0 p-0">
                        <EmptyHeader>
                          <EmptyMedia
                            variant="icon"
                            className="size-14 rounded-2xl [&_svg]:size-7"
                          >
                            <AlertCircle />
                          </EmptyMedia>
                          <EmptyTitle>Aucune entrée DLQ</EmptyTitle>
                          <EmptyDescription>
                            Aucun job en file d&apos;erreurs pour ces critères.
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
                        {formatDate(new Date(row.createdAt))}
                      </TableCell>
                      <TableCell className="px-6 py-4 font-medium">
                        {row.jobType}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                        {row.tenantName}
                      </TableCell>
                      <TableCell className="max-w-[200px] px-6 py-4 font-mono text-xs text-muted-foreground">
                        {row.errorMessage
                          ? truncate(row.errorMessage, 80)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm tabular-nums">
                        {row.attempts}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        {row.resolvedAt ? (
                          <Badge variant="secondary" className="text-xs">
                            Résolu
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            Non résolu
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-9 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="Voir le payload"
                            >
                              <Info className="size-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[80vh] max-w-2xl overflow-auto">
                            <DialogHeader>
                              <DialogTitle>Payload (masqué)</DialogTitle>
                            </DialogHeader>
                            <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs">
                              {JSON.stringify(row.payload, null, 2)}
                            </pre>
                            {row.errorStack && (
                              <>
                                <p className="text-sm font-semibold">Stack</p>
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/30 p-4 font-mono text-xs">
                                  {row.errorStack}
                                </pre>
                              </>
                            )}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
            <p className="text-xs text-muted-foreground">
              {items.length} entrée{items.length > 1 ? "s" : ""}
            </p>
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoading}
              >
                Charger la suite
              </Button>
            ) : (
              <span />
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/* ──────────── Failed Messages Table (AC3) ──────────── */

function FailedMessagesTable({
  items,
  isLoading,
  error,
  hasData,
  nextCursor,
  onLoadMore,
}: {
  items: FailedMsgItem[];
  isLoading: boolean;
  error: { message: string } | null;
  hasData: boolean;
  nextCursor: string | undefined;
  onLoadMore: () => void;
}) {
  if (error) {
    return (
      <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-destructive">
          <MailWarning className="size-12" />
          <p className="text-sm font-medium">
            Erreur lors du chargement des envois échoués
          </p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border gap-0 pb-0 pt-0 shadow-sm">
      {isLoading && !hasData ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Spinner className="size-8" />
          <span className="text-sm">Chargement…</span>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-x-auto">
            <Table aria-label="Envois échoués (MessageOut failed)">
              <TableHeader>
                <TableRow className="border-border bg-muted/60 hover:bg-muted/60">
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tenant
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Destinataire
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Erreur
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tentatives
                  </TableHead>
                  <TableHead className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Correlation ID
                  </TableHead>
                  <TableHead className="w-12 px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Body
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="px-6 py-16 text-center">
                      <Empty className="mx-auto max-w-sm border-0 p-0">
                        <EmptyHeader>
                          <EmptyMedia
                            variant="icon"
                            className="size-14 rounded-2xl [&_svg]:size-7"
                          >
                            <MailWarning />
                          </EmptyMedia>
                          <EmptyTitle>Aucun envoi échoué</EmptyTitle>
                          <EmptyDescription>
                            Aucun message sortant en statut failed pour ces
                            critères.
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
                        {formatDate(new Date(row.createdAt))}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                        {row.tenantName}
                      </TableCell>
                      <TableCell className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {row.to}
                      </TableCell>
                      <TableCell className="max-w-[200px] px-6 py-4 font-mono text-xs text-muted-foreground">
                        {row.lastError ? truncate(row.lastError, 80) : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm tabular-nums">
                        {row.attempts}
                      </TableCell>
                      <TableCell className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {row.correlationId
                          ? truncate(row.correlationId, 24)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-9 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="Voir le body du message"
                            >
                              <Info className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="max-w-md break-all font-mono text-xs"
                          >
                            <pre className="whitespace-pre-wrap">
                              {row.body}
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
          <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/30 px-6 py-3">
            <p className="text-xs text-muted-foreground">
              {items.length} entrée{items.length > 1 ? "s" : ""}
            </p>
            {nextCursor ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoading}
              >
                Charger la suite
              </Button>
            ) : (
              <span />
            )}
          </div>
        </>
      )}
    </Card>
  );
}
