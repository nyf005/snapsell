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
import { SetupChecklist } from "~/app/(dashboard)/_components/setup-checklist";
import { CreditsAlertBanner } from "~/app/(dashboard)/_components/credits-alert-banner";
import { formatError, formatRelativeDate, formatXof, type UserError } from "~/lib/copy";
import { ErrorAlert } from "~/components/ui/error-alert";
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

export function DashboardContent({
  showUpgradeBanner,
  canManageSubscription,
}: {
  showUpgradeBanner: boolean;
  canManageSubscription: boolean;
}) {
  const router = useRouter();
  const { data: summary, isLoading } = api.dashboard.getSummary.useQuery(
    undefined,
    { refetchInterval: POLL_INTERVAL_MS }
  );
  const { data: setup } = api.onboarding.getStatus.useQuery();
  const [startLiveError, setStartLiveError] = useState<UserError | null>(null);
  const startLiveMutation = api.live.startLive.useMutation({
    onSuccess: () => {
      setStartLiveError(null);
      router.push("/dashboard/live");
    },
    onError: (err) => {
      setStartLiveError(formatError(err, "live"));
    },
  });

  if (isLoading) {
    return <DashboardLoadingState />;
  }

  if (!summary) {
    return null;
  }

  // Tant que WhatsApp n'est pas connecté, aucun message ne peut arriver : les
  // indicateurs valent zéro par construction et le graphique est vide. La place
  // revient entièrement à la mise en route.
  const setupBlocking = setup ? !setup.whatsappConnected : false;

  const handleStartLive = async () => {
    await startLiveMutation.mutateAsync();
  };

  const lastProofLabel = summary.lastProofSubmittedAt
    ? formatRelativeDate(summary.lastProofSubmittedAt)
    : "Aucune preuve reçue pour l’instant";

  return (
    <div className="space-y-8">
      {/* Sur mobile, c'est le seul endroit où le solde est visible. */}
      <CreditsAlertBanner canManageSubscription={canManageSubscription} />
      {setup && !setup.isComplete && (
        <section aria-label="Mise en route">
          <SetupChecklist
            steps={setup.steps}
            doneCount={setup.doneCount}
            totalCount={setup.totalCount}
            compact={setup.whatsappConnected}
          />
        </section>
      )}
      <section aria-label="Action prioritaire">
        <DashboardStartGuide
          hasLiveSession={summary.hasLiveSession}
          pendingProofsCount={summary.pendingProofsCount}
          ordersPreparingCount={summary.ordersPreparingCount}
        />
      </section>
      {/* Section: À traiter */}
      <section aria-labelledby="a-traiter-heading">
        <h2
          id="a-traiter-heading"
          className="text-lg font-bold text-foreground flex items-center gap-2 mb-4"
        >
          <ClipboardList className="size-5 text-primary" />
          Votre travail
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

          {/* Live du moment */}
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
                Live du moment
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {summary.hasLiveSession
                  ? "Les réservations et délais sont suivis automatiquement."
                  : "Le live peut démarrer automatiquement au premier code."}
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
                    {startLiveMutation.isPending ? "Démarrage..." : "Démarrer maintenant"}
                  </Button>
                  {startLiveError && (
                    <ErrorAlert error={startLiveError} className="mt-2" />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section: Activité — masquée tant que WhatsApp n'est pas connecté :
          sans messages entrants, tous ces chiffres valent zéro. */}
      {!setupBlocking && (
      <section aria-labelledby="activite-heading">
        <h2
          id="activite-heading"
          className="text-lg font-bold text-foreground flex items-center gap-2 mb-6"
        >
          <TrendingUp className="size-5 text-primary" />
          Résultats du jour
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
                value={formatXof(summary.revenueTodayCents)}
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
                      Live en cours
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
                    Aucune activité récente. Les réservations et commandes s’afficheront ici.
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
      )}

      {/* L'upsell passe en dernier, et disparaît tant que la boutique n'est pas
          en état de vendre : demander de payer avant le premier message envoyé
          contredit « le travail du moment d'abord ». */}
      {showUpgradeBanner && !setupBlocking && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <Zap className="size-4 shrink-0 text-primary" />
          <p className="flex-1 text-foreground">
            Vous êtes sur le plan <span className="font-semibold">Gratuit</span>. Passez au plan{" "}
            <span className="font-semibold">Starter</span> ou{" "}
            <span className="font-semibold">Pro</span> pour débloquer l’export CSV, les filtres
            avancés et plus encore.
          </p>
          <Link
            href="/parametres/abonnement"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Mettre à niveau
          </Link>
        </div>
      )}
    </div>
  );
}
