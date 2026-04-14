"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { KpiCard } from "~/components/ui/kpi-card";
import { Spinner } from "~/components/ui/spinner";
import { DashboardLoadingState } from "./dashboard-skeletons";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import {
  ClipboardList,
  Package,
  Radio,
  ArrowRight,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  History,
  Wallet,
  Zap,
} from "lucide-react";
import { DashboardStartGuide } from "~/app/(dashboard)/_components/dashboard-start-guide";
import { cn } from "~/lib/utils";

const revenueChartConfig = {
  revenueCents: {
    label: "Revenu",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

const POLL_INTERVAL_MS = 60_000;

/** Tendance vs hier : contenu + className pour couleur (success / destructive). */
function trendVsHier(
  current: number,
  previous: number
): { trend: ReactNode; trendClassName?: string } {
  if (previous === 0) {
    return {
      trend: current > 0 ? "+100% vs hier" : "—",
    };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return { trend: "= vs hier" };
  }
  const sign = pct > 0 ? "+" : "";
  const Icon = pct > 0 ? TrendingUp : TrendingDown;
  return {
    trend: (
      <>
        <Icon className="size-3.5 shrink-0" />
        {sign}
        {pct}% vs hier
      </>
    ),
    trendClassName: pct < 0 ? "text-destructive" : undefined,
  };
}

function formatRevenueCents(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
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
  return `Il y a ${diffD}j`;
}

export function DashboardContent({ showUpgradeBanner }: { showUpgradeBanner: boolean }) {
  const router = useRouter();
  const { data: summary, isLoading } = api.dashboard.getSummary.useQuery(
    undefined,
    { refetchInterval: POLL_INTERVAL_MS }
  );
  const [startLiveError, setStartLiveError] = useState<string | null>(null);
  const startLiveMutation = api.live.startLive.useMutation({
    onSuccess: () => {
      setStartLiveError(null);
      router.push("/dashboard/live");
    },
    onError: (err) => {
      setStartLiveError(err.message);
    },
  });

  if (isLoading) {
    return <DashboardLoadingState />;
  }

  if (!summary) {
    return null;
  }

  const handleStartLive = async () => {
    await startLiveMutation.mutateAsync();
  };

  const lastProofLabel = summary.lastProofSubmittedAt
    ? formatRelativeTime(summary.lastProofSubmittedAt)
    : "Aucune soumission récente";

  return (
    <div className="space-y-10">
      {showUpgradeBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <Zap className="size-4 shrink-0 text-primary" />
          <p className="flex-1 text-foreground">
            Vous êtes sur le plan <span className="font-semibold">Gratuit</span>. Passez au plan{" "}
            <span className="font-semibold">Starter</span> ou{" "}
            <span className="font-semibold">Pro</span> pour débloquer l'export CSV, les filtres avancés et plus encore.
          </p>
          <a
            href="/parametres/abonnement"
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Mettre à niveau
          </a>
        </div>
      )}
      <section aria-labelledby="demarrer-heading">
        <DashboardStartGuide hasLiveSession={summary.hasLiveSession} />
      </section>
      {/* Section: À traiter */}
      <section aria-labelledby="a-traiter-heading">
        <h2
          id="a-traiter-heading"
          className="text-lg font-bold text-foreground flex items-center gap-2 mb-4"
        >
          <ClipboardList className="size-5 text-primary" />
          À traiter
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Preuves en attente */}
          <Card className="min-w-0 border-border shadow-sm hover:border-primary/50 transition-all group">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <ClipboardList className="size-5" />
                </div>
                {summary.pendingProofsCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0"
                  >
                    Urgent
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              <p className="text-2xl md:text-3xl font-extrabold text-foreground">
                {summary.pendingProofsCount}
              </p>
              <p className="text-sm font-bold text-foreground">
                Preuves en attente
              </p>
              <p className="text-xs text-muted-foreground">{lastProofLabel}</p>
              <Link
                href="/dashboard/proofs"
                prefetch
                className="text-xs font-extrabold text-primary flex items-center gap-1 mt-4 group-hover:gap-2 transition-all"
              >
                Voir les preuves
                <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          {/* Commandes à préparer */}
          <Card className="min-w-0 border-border shadow-sm hover:border-primary/50 transition-all group">
            <CardHeader className="pb-2">
              <div className="inline-flex p-2 rounded-lg bg-primary/10 text-primary w-fit">
                <Package className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              <p className="text-2xl md:text-3xl font-extrabold text-foreground">
                {summary.ordersPreparingCount}
              </p>
              <p className="text-sm font-bold text-foreground">
                Commandes à préparer
              </p>
              <p className="text-xs text-muted-foreground">
                Prêt pour expédition aujourd&apos;hui
              </p>
              <Link
                href="/dashboard/orders"
                prefetch
                className="text-xs font-extrabold text-primary flex items-center gap-1 mt-4 group-hover:gap-2 transition-all"
              >
                Voir les commandes
                <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          {/* Session Live */}
          <Card className="min-w-0 border-border shadow-sm hover:border-primary/50 transition-all group">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div
                  className={cn(
                    "p-2 rounded-lg",
                    summary.hasLiveSession
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Radio className="size-5" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      summary.hasLiveSession ? "bg-primary" : "bg-muted-foreground"
                    )}
                  />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    {summary.hasLiveSession ? "En cours" : "Inactif"}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <p className="text-xl font-extrabold text-foreground">
                Session Live
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {summary.hasLiveSession
                  ? "Une session live est en cours."
                  : "Aucun live en cours. Préparez votre prochaine session."}
              </p>
              {summary.hasLiveSession ? (
                <Button asChild size="sm" className="mt-2">
                  <Link href="/dashboard/live" prefetch>Voir le live</Link>
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={handleStartLive}
                    disabled={startLiveMutation.isPending}
                  >
                    {startLiveMutation.isPending ? "Démarrage..." : "Lancer le live"}
                  </Button>
                  {startLiveError && (
                    <p className="text-xs text-destructive mt-1">{startLiveError}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section: Activité */}
      <section aria-labelledby="activite-heading">
        <h2
          id="activite-heading"
          className="text-lg font-bold text-foreground flex items-center gap-2 mb-6"
        >
          <TrendingUp className="size-5 text-primary" />
          Activité
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Stats + Chart */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <KpiCard
                label="Ventes totales"
                value={summary.ordersTodayCount}
                icon={ShoppingBag}
                iconVariant="primary"
                {...trendVsHier(
                  summary.ordersTodayCount,
                  summary.ordersYesterdayCount
                )}
              />
              <KpiCard
                label="Revenu estimé"
                value={formatRevenueCents(summary.revenueTodayCents)}
                icon={Wallet}
                iconVariant="primary"
                {...trendVsHier(
                  summary.revenueTodayCents,
                  summary.revenueYesterdayCents
                )}
              />
            </div>
            <Card className="border-border overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-foreground">
                    Évolution des revenus
                  </h3>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    7 derniers jours
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ChartContainer
                  config={revenueChartConfig}
                  className="h-[200px] w-full"
                >
                  <BarChart
                    data={summary.revenueByDay.map((d) => ({
                      ...d,
                      revenueFcfa: d.revenueCents / 100,
                    }))}
                    accessibilityLayer
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      fontSize={11}
                      tickFormatter={(v: number) => `${v.toLocaleString("fr-FR")} F`}
                      width={60}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [
                            `${Math.round(Number(value)).toLocaleString("fr-FR")} FCFA`,
                            "Revenu",
                          ]}
                        />
                      }
                    />
                    <Bar
                      dataKey="revenueFcfa"
                      fill="var(--color-primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Flux d'activité */}
          <Card className="border-border flex flex-col">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-bold text-foreground flex items-center justify-between">
                Flux d&apos;activité
                <History className="size-4 text-muted-foreground" />
              </h3>
            </CardHeader>
            <CardContent className="pt-0 flex-1 space-y-6">
              {summary.ordersTodayCount > 0 && (
                <div className="flex gap-4">
                  <div className="relative">
                    <div className="size-2 bg-primary rounded-full mt-1.5 ring-4 ring-primary/10" />
                    <div className="absolute top-4 left-[3px] bottom-[-24px] w-[2px] bg-border" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      Commandes aujourd&apos;hui
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {summary.ordersTodayCount} commande
                      {summary.ordersTodayCount > 1 ? "s" : ""} enregistrée
                      {summary.ordersTodayCount > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              )}
              {summary.pendingProofsCount > 0 && (
                <div className="flex gap-4">
                  <div className="relative">
                    <div className="size-2 bg-amber-400 rounded-full mt-1.5 ring-4 ring-amber-400/10" />
                    <div className="absolute top-4 left-[3px] bottom-[-24px] w-[2px] bg-border" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      Preuves en attente
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {summary.pendingProofsCount} preuve
                      {summary.pendingProofsCount > 1 ? "s" : ""} à valider
                    </p>
                  </div>
                </div>
              )}
              {summary.hasLiveSession && (
                <div className="flex gap-4">
                  <div className="relative">
                    <div className="size-2 bg-success rounded-full mt-1.5 ring-4 ring-success/10" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      Session live en cours
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Consultez Live Ops pour gérer les réservations
                    </p>
                  </div>
                </div>
              )}
              {summary.ordersTodayCount === 0 &&
                summary.pendingProofsCount === 0 &&
                !summary.hasLiveSession && (
                  <p className="text-sm text-muted-foreground">
                    Aucune activité récente.
                  </p>
                )}
            </CardContent>
            <div className="px-6 pb-6">
              <Link
                href="/dashboard/orders"
                prefetch
                className="text-xs font-extrabold text-muted-foreground hover:text-primary transition-colors tracking-wide text-center block"
              >
                Voir les commandes
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
