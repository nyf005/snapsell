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
  ArrowRight,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Wallet,
  Zap,
} from "lucide-react";
import {
  getDailyPriority,
  DashboardStartGuide,
} from "~/app/(dashboard)/_components/dashboard-start-guide";
import { HelpHint } from "~/app/(dashboard)/_components/help-hint";
import { SetupChecklist } from "~/app/(dashboard)/_components/setup-checklist";
import { CreditsAlertBanner } from "~/app/(dashboard)/_components/credits-alert-banner";
import { AssistantControl } from "~/app/(dashboard)/_components/assistant-control";
import { formatError, formatXof, formatXofUnits, type UserError } from "~/lib/copy";
import { ProductMetrics } from "./product-metrics";
import { HandedOffConversations } from "./handed-off-conversations";
import { ErrorAlert } from "~/components/ui/error-alert";

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
      trend: current > 0 ? "Aucune activité hier" : "—",
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
  const { data: summary, isLoading, error: summaryError, refetch, isFetching } = api.dashboard.getSummary.useQuery(
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

  const summaryFailure = (
    <div className="space-y-3">
      <ErrorAlert error={summaryError ?? { title: "Votre activité est indisponible", detail: "Réessayez pour retrouver vos commandes et vos actions du jour." }} />
      <Button variant="outline" disabled={isFetching} onClick={() => { void refetch(); }}>
        {isFetching ? "Actualisation…" : "Réessayer"}
      </Button>
    </div>
  );
  if (!summary) return summaryFailure;

  // Sans connexion WhatsApp, les nouveaux messages n'arrivent plus et l'activité
  // courante n'est pas mise en avant. Le travail déjà créé reste toutefois traité
  // séparément par `dailyPriority` ci-dessous.
  const setupBlocking = setup ? !setup.whatsappConnected : false;

  /**
   * ── QUI TIENT LE HAUT DE L'ÉCRAN ───────────────────────────────────────
   *
   * Les deux bandeaux ont longtemps partagé le même habillage et pouvaient
   * s'empiler. La règle est désormais explicite, dans cet ordre :
   *
   * 1. Il y a du travail du jour → il passe devant, même si WhatsApp vient de se
   *    déconnecter. Une cliente qui attend son
   *    acompte prime sur une étape de configuration.
   * 2. Sinon → la mise en route reprend la tête.
   *
   * La mise en route ne disparaît jamais tant qu'elle est incomplète ; quand elle
   * cède la première place, elle passe en variante discrète.
   */
  // Une déconnexion WhatsApp n'efface pas le travail déjà créé. Une boutique
  // précédemment active peut encore avoir des preuves ou des commandes à traiter :
  // ces données réelles gardent donc la priorité sur l'état de la connexion.
  const dailyPriority = getDailyPriority({
    hasLiveSession: summary.hasLiveSession,
    pendingProofsCount: summary.pendingProofsCount,
    ordersPreparingCount: summary.ordersPreparingCount,
  });
  const showSetup = Boolean(setup && !setup.isComplete);

  const handleStartLive = () => {
    startLiveMutation.mutate();
  };


  return (
    <div className="space-y-8">
      {summaryError && summaryFailure}
      {dailyPriority && <DashboardStartGuide hasLiveSession={summary.hasLiveSession} pendingProofsCount={summary.pendingProofsCount} ordersPreparingCount={summary.ordersPreparingCount} />}
      {/* Sur mobile, c'est le seul endroit où le solde est visible. */}
      {showSetup && setup && (
          <SetupChecklist
            steps={setup.steps}
            doneCount={setup.doneCount}
            totalCount={setup.totalCount}
            compact={dailyPriority !== null}
          />
      )}
      <CreditsAlertBanner canManageSubscription={canManageSubscription} />
      <AssistantControl canManage={canManageSubscription} compact />
      {/* Section: À traiter */}
      <section aria-labelledby="a-traiter-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="a-traiter-heading"
            className="flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <ClipboardList className="size-5 text-primary" />
            Votre travail
          </h2>
          {/*
            « Aujourd'hui » n'utilise pas `TaskPageHeader` — cet écran n'a pas
            d'en-tête de tâche — donc l'aide contextuelle est posée ici à la main.
            C'est le premier écran de la journée, et le seul que voient les rôles
            sans droits de gestion : l'article du trajet complet doit y être.
          */}
          <HelpHint slug="comment-ca-marche" />
        </div>
        {setup?.isComplete && !dailyPriority && <p role="status" className="mb-4 text-base font-medium">Aucun paiement à vérifier ni commande à préparer.</p>}
        <div className="divide-y divide-border rounded-xl border border-border bg-card px-4">
          <Link href="/dashboard/orders?payment=review" className="flex min-h-20 items-center justify-between gap-4 py-3"><span><span className="block font-semibold">Paiements à vérifier</span><span className="text-sm text-muted-foreground">{summary.pendingProofsCount ? "Vérifier les justificatifs reçus" : "Aucune preuve en attente"}</span></span><span className="flex items-center gap-3"><Badge variant={summary.pendingProofsCount ? "warning" : "secondary"}>{summary.pendingProofsCount}</Badge><ArrowRight className="size-4" /></span></Link>
          <Link href="/dashboard/orders?view=preparing" className="flex min-h-20 items-center justify-between gap-4 py-3"><span><span className="block font-semibold">Commandes à préparer</span><span className="text-sm text-muted-foreground">Articles et coordonnées de livraison</span></span><span className="flex items-center gap-3"><Badge variant="secondary">{summary.ordersPreparingCount}</Badge><ArrowRight className="size-4" /></span></Link>
          <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 py-3"><span><span className="block font-semibold">{summary.hasLiveSession ? "Live en cours" : "Votre prochain live"}</span><span className="text-sm text-muted-foreground">{summary.hasLiveSession ? "Retrouver les réservations" : "Préparer vos articles et lancer la vente"}</span></span>{summary.hasLiveSession ? <Button asChild><Link href="/dashboard/live">Voir le live</Link></Button> : <Button onClick={handleStartLive} disabled={startLiveMutation.isPending}>{startLiveMutation.isPending ? "Démarrage…" : "Démarrer maintenant"}</Button>}</div>
          {startLiveError && <ErrorAlert error={startLiveError} className="py-3" />}
        </div>

        {/* Ne s'affiche que s'il y a une conversation à reprendre — sinon la
            section disparaît et ne prend pas la place du travail du jour. */}
        <HandedOffConversations />
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
        <div className="grid grid-cols-1 gap-8">
          {/* Stats + Chart */}
          <div className="space-y-6">
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
                  <span className="text-sm font-bold text-muted-foreground uppercase">
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
                      fontSize={14}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={4}
                      fontSize={14}
                      tickFormatter={(v: number) => `${v.toLocaleString("fr-FR")} F`}
                      width={60}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => [
                            // La donnée du graphique est déjà en francs (ligne 341),
                            // d'où `formatXofUnits` et non `formatXof`.
                            formatXofUnits(Number(value)),
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


        </div>
      </section>
      )}

      {canManageSubscription && !setupBlocking && (
        <details className="rounded-xl border border-border p-4 group">
          <summary className="min-h-11 cursor-pointer py-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-primary">
            Consulter le bilan des 30 derniers jours
          </summary>
          <div className="pt-4"><ProductMetrics /></div>
        </details>
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
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Mettre à niveau
          </Link>
        </div>
      )}
    </div>
  );
}
