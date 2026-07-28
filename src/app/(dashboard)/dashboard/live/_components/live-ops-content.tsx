"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "~/trpc/react";
import { formatErrorText, formatXof } from "~/lib/copy";
import { DataList } from "~/components/ui/data-list";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { SetupRequiredBanner } from "~/app/(dashboard)/_components/setup-required-banner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { KpiCard } from "~/components/ui/kpi-card";

import { LiveOpsSkeleton } from "./live-ops-skeletons";
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
import { DashboardEmptyState } from "~/app/(dashboard)/_components/dashboard-empty-state";
import {
  Radio,
  Package,
  Clock,
  ShoppingCart,
  Users,
  BarChart2,
  AlarmClock,
  Settings,
  Download,
  X,
  ChevronDown,
  TrendingUp,
  Play,
} from "lucide-react";

const POLL_INTERVAL_LIVE_MS = 5_000;  // live actif avec réservations: rafraîchissement toutes les 5s
const POLL_INTERVAL_ACTIVE_MS = 15_000; // live actif sans réservation récente: toutes les 15s
const POLL_INTERVAL_IDLE_MS = 60_000; // pas de live : rafraîchissement toutes les 60s
const EXPIRING_SOON_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

/** Returns remaining "MM:SS" or "0:00" when expired. Updates every second when in range. */
function useExpiryCountdown(expiresAt: Date | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = new Date(expiresAt).getTime();
    if (t <= now) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt, now]);

  if (!expiresAt) return "—";
  const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function isExpiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < EXPIRING_SOON_THRESHOLD_MS && new Date(expiresAt).getTime() > Date.now();
}

type StockLevel = "full" | "low" | "critical";
function getStockLevel(availableQty: number, quantity: number): StockLevel {
  if (quantity <= 0) return "full";
  const pct = (availableQty / quantity) * 100;
  if (pct < 10) return "critical";
  if (pct < 25) return "low";
  return "full";
}

export function LiveOpsContent() {
  const utils = api.useUtils();
  const [releaseTargetId, setReleaseTargetId] = useState<string | null>(null);
  const [releaseTargetCode, setReleaseTargetCode] = useState<string>("");
  const [releaseTargetClient, setReleaseTargetClient] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showEndLiveDialog, setShowEndLiveDialog] = useState(false);

  const { data: liveOpsData, isLoading } = api.live.getLiveOpsData.useQuery(undefined, {
    refetchInterval: (query) => {
      const hasLive = query.state.data?.session != null;
      const hasRecentReservations = query.state.data?.reservations.some(
        (r) => r.status === "reserved" && r.expiresAt && new Date(r.expiresAt).getTime() - Date.now() > 0
      );
      if (!hasLive) return POLL_INTERVAL_IDLE_MS;
      if (hasRecentReservations) return POLL_INTERVAL_LIVE_MS;
      return POLL_INTERVAL_ACTIVE_MS;
    },
  });

  const startLiveMutation = api.live.startLive.useMutation({
    onSuccess: () => {
      void utils.live.getLiveOpsData.invalidate();
    },
  });

  const endLiveMutation = api.live.endLive.useMutation({
    onSuccess: () => {
      setShowEndLiveDialog(false);
      void utils.live.getLiveOpsData.invalidate();
    },
  });

  const session = liveOpsData?.session ?? null;
  const items = liveOpsData?.items ?? [];
  const reservations = liveOpsData?.reservations ?? [];
  const waitlistCount = liveOpsData?.waitlistCount ?? 0;
  const hasSession = !!session;

  const releaseReservation = api.live.releaseReservation.useMutation({
    onSuccess: () => {
      setReleaseTargetId(null);
      setReleaseTargetCode("");
      setReleaseTargetClient("");
      setSuccessMessage("Réservation libérée.");
      setTimeout(() => setSuccessMessage(null), 4000);
      void utils.live.getLiveOpsData.invalidate();
    },
  });

  const confirmRelease = () => {
    if (releaseTargetId) {
      releaseReservation.mutate({ reservationId: releaseTargetId });
    }
  };

  const openReleaseDialog = (id: string, code: string, clientMasked: string) => {
    setReleaseTargetId(id);
    setReleaseTargetCode(code);
    setReleaseTargetClient(clientMasked);
  };

  const soldThroughPercent = useMemo(() => {
    if (items.length === 0) return 0;
    const total = items.reduce((s, i) => s + i.quantity, 0);
    const reserved = items.reduce((s, i) => s + i.reservedQty, 0);
    return total > 0 ? Math.round((reserved / total) * 100) : 0;
  }, [items]);

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto bg-background text-foreground">
        <div className="space-y-8 p-6 md:p-8">
          <SetupRequiredBanner />
          <TaskPageHeader
            href="/dashboard/live"
            description={
              hasSession
                ? "Surveillez d’abord les réservations qui expirent. L’inventaire se met à jour automatiquement."
                : "Le live démarre automatiquement au premier code. Le bouton reste disponible si vous souhaitez le préparer maintenant."
            }
            actions={
              <>
              {hasSession ? (
                <>
                  <Button variant="outline" size="icon" aria-label="Paramètres">
                    <Settings className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Exporter">
                    <Download className="size-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5 font-bold"
                    onClick={() => setShowEndLiveDialog(true)}
                    disabled={endLiveMutation.isPending}
                  >
                    <X className="size-4" />
                    {endLiveMutation.isPending ? "Fermeture…" : "Terminer le live"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5 font-bold"
                  onClick={() => startLiveMutation.mutate()}
                  disabled={startLiveMutation.isPending}
                >
                  <Play className="size-4" />
                  {startLiveMutation.isPending ? "Démarrage…" : "Démarrer maintenant"}
                </Button>
              )}
              </>
            }
          />

          <section aria-label="Indicateurs" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Articles du live"
              value={isLoading ? "—" : items.length}
              icon={Package}
              iconVariant="primary"
            />
            <KpiCard
              label="Réservations actives"
              value={isLoading ? "—" : reservations.length}
              icon={ShoppingCart}
              iconVariant="warning"
            />
            <KpiCard
              label="En file d'attente"
              value={isLoading ? "—" : waitlistCount}
              icon={Users}
              iconVariant="purple"
            />
          </section>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
            <div className="order-2 flex flex-col lg:order-1 lg:col-span-7">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-border gap-0 pt-0 shadow-sm">
                <CardHeader className="flex items-center border-b border-border bg-muted/30 px-6 py-2.5 [.border-b]:pb-2.5">
                  <div className="flex w-full items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg font-bold leading-tight">
                      <BarChart2 className="size-5 shrink-0 text-primary" />
                      Suivi de l&apos;inventaire live
                    </CardTitle>
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Enregistrement auto
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-auto p-0">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                      <LiveOpsSkeleton />
                    </div>
                  ) : !hasSession || items.length === 0 ? (
                    <div className="p-6">
                      <DashboardEmptyState
                        icon={Radio}
                        title={hasSession ? "Aucun article dans ce live" : "Aucun live en cours"}
                        description={
                          hasSession
                            ? "Les articles apparaîtront ici dès qu’un code sera annoncé."
                            : "Lancez un live pour voir votre inventaire en temps réel."
                        }
                        action={!hasSession ? (
                          <Button
                            size="sm"
                            onClick={() => startLiveMutation.mutate()}
                            disabled={startLiveMutation.isPending}
                          >
                            {startLiveMutation.isPending ? "Démarrage..." : "Lancer le live"}
                          </Button>
                        ) : null}
                      />
                    </div>
                  ) : (
                    <>
                      <DataList
                        items={items}
                        getKey={(item) => item.id}
                        label="Inventaire du live"
                        columns={[
                          {
                            id: "code",
                            header: "Code",
                            role: "primary",
                            headerClassName:
                              "px-6 py-4 text-xs font-bold uppercase tracking-wider",
                            className: "px-6 py-4",
                            cell: (item) => (
                              <div className="font-bold text-foreground">{item.code}</div>
                            ),
                          },
                          {
                            id: "price",
                            header: "Prix",
                            role: "secondary",
                            headerClassName:
                              "px-6 py-4 text-right text-xs font-bold uppercase tracking-wider",
                            className: "px-6 py-4 text-right font-semibold",
                            cell: (item) => formatXof(item.amount),
                          },
                          {
                            id: "stock",
                            header: "Stock",
                            role: "meta",
                            headerClassName:
                              "px-6 py-4 text-xs font-bold uppercase tracking-wider",
                            className: "px-6 py-4",
                            cell: (item) => {
                              const level = getStockLevel(item.availableQty, item.quantity);
                              const pct =
                                item.quantity > 0
                                  ? (item.availableQty / item.quantity) * 100
                                  : 0;
                              const barColor =
                                level === "critical"
                                  ? "bg-destructive"
                                  : level === "low"
                                    ? "bg-amber-500"
                                    : "bg-primary";
                              return (
                                <div className="min-w-32">
                                  <div className="flex items-center gap-3">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className={`h-full rounded-full ${barColor}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="w-8 text-right text-sm font-bold">
                                      {item.availableQty}
                                    </span>
                                  </div>
                                  <div
                                    className={`mt-1 text-[10px] ${
                                      level === "critical"
                                        ? "font-bold uppercase tracking-tighter text-destructive"
                                        : level === "low"
                                          ? "text-amber-600 dark:text-amber-400"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {level === "critical"
                                      ? "Stock critique"
                                      : level === "low"
                                        ? "Stock bas"
                                        : `Dispo. sur ${item.quantity} total`}
                                  </div>
                                </div>
                              );
                            },
                          },
                          {
                            id: "reserved",
                            header: "Réservé",
                            role: "meta",
                            headerClassName:
                              "px-6 py-4 text-center text-xs font-bold uppercase tracking-wider",
                            className: "px-6 py-4 text-center",
                            cell: (item) => (
                              <Badge variant="secondary" className="font-bold">
                                {item.reservedQty}
                              </Badge>
                            ),
                          },
                        ]}
                      />
                      <div className="border-t border-border bg-muted/20 px-4 py-4 text-center">
                        <Button variant="ghost" size="sm" className="font-bold text-primary">
                          Voir tout l&apos;inventaire de la session ({items.length} articles)
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="order-1 flex min-h-0 flex-col gap-6 lg:order-2 lg:col-span-5">
              <Card className="flex flex-1 flex-col overflow-hidden rounded-xl border-border pt-0 shadow-sm">
                <CardHeader className="flex items-center border-b border-border bg-muted/30 px-6 py-2.5 [.border-b]:pb-2.5">
                  <div className="flex w-full items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg font-bold leading-tight">
                      <Clock className="size-5 shrink-0 text-amber-500" />
                      À surveiller maintenant
                    </CardTitle>
                    <Badge variant="secondary" className="text-[10px] font-bold">
                      FLUX TEMPS RÉEL
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col p-0">
                  {isLoading ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                      <LiveOpsSkeleton />
                    </div>
                  ) : reservations.length === 0 ? (
                    <div className="flex flex-1 flex-col justify-center p-6">
                      <DashboardEmptyState
                        icon={Clock}
                        title={hasSession ? "Aucune réservation en cours" : "Aucun live en cours"}
                        description={
                          hasSession
                            ? "Dès qu’un code sera envoyé pendant votre live, la réservation s’affichera ici avec son délai."
                            : "Lancez un live pour commencer à recevoir des réservations."
                        }
                        action={!hasSession ? (
                          <Button
                            size="sm"
                            onClick={() => startLiveMutation.mutate()}
                            disabled={startLiveMutation.isPending}
                          >
                            {startLiveMutation.isPending ? "Démarrage..." : "Lancer le live"}
                          </Button>
                        ) : null}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="max-h-[600px] space-y-2 overflow-y-auto p-2">
                        {reservations.map((r) => (
                          <ReservationCard
                            key={r.id}
                            code={r.code}
                            clientPhoneMasked={r.clientPhoneMasked}
                            status={r.status}
                            expiresAt={r.expiresAt}
                            onRelease={() => openReleaseDialog(r.id, r.code, r.clientPhoneMasked)}
                            isReleasing={releaseReservation.isPending}
                          />
                        ))}
                      </div>
                      <div className="border-t border-border bg-muted/20 px-4 py-4">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {reservations.length} réservation
                            {reservations.length > 1 ? "s" : ""} active
                            {reservations.length > 1 ? "s" : ""}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto gap-1 p-0 font-bold text-primary"
                          >
                            Développer le flux
                            <ChevronDown className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="overflow-hidden rounded-xl border-0 bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <CardContent className="relative overflow-hidden p-6">
                  <div className="relative z-10">
                    <h4 className="mb-2 font-bold">Rythme du live</h4>
                    <div className="mb-4 flex items-center gap-2">
                      <span className="text-2xl font-extrabold tabular-nums">
                        {isLoading ? "—" : `${soldThroughPercent} %`}
                      </span>
                      <span className="text-sm font-bold uppercase tracking-widest opacity-80">
                        Réservé
                      </span>
                    </div>
                    <div className="mb-2 h-3 overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-white transition-[width]"
                        style={{ width: `${soldThroughPercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] opacity-70">
                      {hasSession
                        ? "Part des quantités réservées par rapport au total du live."
                        : "Lancez un live pour voir le rythme."}
                    </p>
                  </div>
                  <TrendingUp className="absolute -bottom-4 -right-4 size-24 opacity-10" />
                </CardContent>
              </Card>
            </div>
          </div>

          {successMessage && (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-success"
            >
              {successMessage}
            </p>
          )}
          {releaseReservation.isError && (
            <p
              role="alert"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              {formatErrorText(releaseReservation.error, "live")}
            </p>
          )}
        </div>
      </main>

      <AlertDialog
        open={showEndLiveDialog}
        onOpenChange={(open) => !open && setShowEndLiveDialog(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer le live ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action ferme la session en cours. Les articles restants seront promus vers
              votre catalogue. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => endLiveMutation.mutate()}
              disabled={endLiveMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Terminer la session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={releaseTargetId !== null}
        onOpenChange={(open) => !open && setReleaseTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Libérer la réservation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action libère immédiatement l&apos;article{" "}
              <span className="font-bold text-foreground">{releaseTargetCode}</span> dans le pool
              disponible pour le client{" "}
              <span className="font-bold">{releaseTargetClient}</span>. Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRelease}
              disabled={releaseReservation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Libérer l&apos;article
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReservationCard({
  code,
  clientPhoneMasked,
  status,
  expiresAt,
  onRelease,
  isReleasing,
}: {
  code: string;
  clientPhoneMasked: string;
  status: string;
  expiresAt: Date | null;
  onRelease: () => void;
  isReleasing: boolean;
}) {
  const countdown = useExpiryCountdown(expiresAt);
  const soon = isExpiringSoon(expiresAt);

  return (
    <div
      className={`relative group flex items-start justify-between gap-2 rounded-lg border p-4 transition-all ${
        soon
          ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-900/10"
          : "border-border bg-muted/30 hover:border-primary/50"
      }`}
    >
      {soon && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-amber-500"
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">
            +33 {clientPhoneMasked}
          </span>
          <Badge
            variant={soon ? "secondary" : "success"}
            className={
              soon
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold"
                : "bg-success/10 text-success text-[10px] font-bold"
            }
          >
            {soon ? "EXPIRE BIENTÔT" : "RÉSERVÉ"}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{code}</span>
        </div>
        <div
          className={`flex items-center gap-1.5 pt-1 text-xs ${
            soon ? "font-bold text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          }`}
        >
          {soon ? (
            <AlarmClock className="size-3.5" />
          ) : (
            <Clock className="size-3.5" />
          )}
          Expire dans <span className="font-bold text-foreground">{countdown}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-destructive opacity-0 hover:bg-destructive/10 group-hover:opacity-100"
        disabled={isReleasing}
        aria-label={`Libérer la réservation pour le code ${code}`}
        onClick={onRelease}
      >
        <X className="size-4 mr-1" />
        Libérer
      </Button>
    </div>
  );
}
