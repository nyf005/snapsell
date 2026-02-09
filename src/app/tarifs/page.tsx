import { type Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  X,
  Zap,
  Crown,
  Users,
  ShoppingCart,
  Lock,
  Shield,
  TrendingUp,
  Sparkles,
} from "lucide-react";

import { SiteHeader } from "~/components/site-header";
import { LandingFooter } from "~/app/_components/landing/landing-footer";
import { Button } from "~/components/ui/button";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import {
  SUBSCRIPTION_PLANS,
  PLAN_IDS,
  formatPriceFCFA,
  type PlanId,
} from "~/lib/subscription-plans";

export const metadata: Metadata = {
  title: "Tarifs — SnapSell",
  description:
    "Choisissez le plan SnapSell adapté à votre activité : Free, Starter ou Pro. Commencez gratuitement, passez à la vitesse supérieure quand vous êtes prêt.",
};

const planIcons: Record<PlanId, typeof Zap> = {
  free: ShoppingCart,
  starter: Zap,
  pro: Crown,
};

const planAccent: Record<PlanId, { icon: string; border: string; badge: string; cta: string; glow: string }> = {
  free: {
    icon: "bg-muted text-muted-foreground",
    border: "border-border hover:border-border/80",
    badge: "",
    cta: "outline",
    glow: "",
  },
  starter: {
    icon: "bg-primary/10 text-primary",
    border: "border-primary/20 hover:border-primary/40",
    badge: "",
    cta: "outline",
    glow: "",
  },
  pro: {
    icon: "bg-amber-500/10 text-amber-500",
    border: "border-amber-500/30 hover:border-amber-500/50",
    badge: "bg-amber-500 text-white",
    cta: "default",
    glow: "shadow-[0_0_40px_-12px] shadow-amber-500/20",
  },
};

/** Comparaison détaillée pour le tableau */
const comparisonRows = [
  { label: "Commandes confirmées / mois", free: "50", starter: "300", pro: "700" },
  { label: "Overage", free: "Bloqué", starter: "75 FCFA / cmd", pro: "100 FCFA / cmd" },
  { label: "Preuves / mois", free: "20", starter: "Illimité", pro: "Illimité" },
  { label: "Agents", free: "0", starter: "1", pro: "5" },
  { label: "Grille catégories → prix", free: true, starter: true, pro: true },
  { label: "Live session auto", free: true, starter: true, pro: true },
  { label: "Réservation + file + TTL", free: true, starter: true, pro: true },
  { label: "Dashboard commandes", free: true, starter: true, pro: true },
  { label: "Proofs inbox", free: "Limité", starter: "Complet", pro: "Complet" },
  { label: "Export CSV", free: false, starter: "Basique", pro: "Avancé" },
  { label: "Notifications hors 24h", free: false, starter: true, pro: true },
  { label: "Acompte recommandé", free: false, starter: true, pro: true },
  { label: "Filtres avancés + audit", free: false, starter: "Basique", pro: "Avancé" },
  { label: "Support prioritaire", free: false, starter: false, pro: true },
  { label: "Branding SnapSell", free: "Oui", starter: "Non", pro: "Non" },
] as const;

type TarifsPageProps = { searchParams?: Promise<{ error?: string }> };

export default async function TarifsPage(props: TarifsPageProps) {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const isManager =
    isLoggedIn && canManageGrid(session.user.role as string);

  const searchParams = props.searchParams != null ? await props.searchParams : {};
  const paymentError = searchParams.error === "payment_init_failed";

  return (
    <>
      <SiteHeader user={session?.user ? { name: session.user.name, email: session.user.email! } : null} />
      <main id="main-content" className="min-h-screen bg-background">
        {paymentError && (
          <div className="mx-auto max-w-5xl px-6 pt-4">
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertDescription>
                Impossible d&apos;ouvrir la page de paiement. Vérifiez que les clés Paystack et les plan codes sont correctement configurés, ou réessayez plus tard.
              </AlertDescription>
            </Alert>
          </div>
        )}
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pb-20 pt-24 text-center">
          {/* Subtle glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,var(--primary),transparent_70%)] opacity-[0.07]"
          />
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5" />
              Pas de surprise, pas d&apos;engagement
            </div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Un plan pour chaque{" "}
              <span className="text-primary">vendeur</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Commencez gratuitement, passez à la vitesse supérieure quand vos
              ventes décollent. Facturation sur les{" "}
              <strong className="text-foreground">commandes confirmées</strong>{" "}
              uniquement.
            </p>
          </div>
        </section>

        {/* Plan Cards */}
        <section className="mx-auto max-w-5xl px-6 pb-24" aria-label="Plans tarifaires">
          <div className="grid items-start gap-6 md:grid-cols-3">
            {PLAN_IDS.map((planId) => {
              const plan = SUBSCRIPTION_PLANS[planId];
              const Icon = planIcons[planId];
              const accent = planAccent[planId];
              const isPopular = plan.popular;

              // CTA logic
              let ctaHref: string;
              let ctaLabel: string;
              if (planId === "free") {
                ctaHref = isLoggedIn ? "/dashboard" : "/login?tab=signup";
                ctaLabel = isLoggedIn
                  ? "Tableau de bord"
                  : "Commencer gratuitement";
              } else if (isLoggedIn && isManager) {
                ctaHref = `/api/payment/subscribe?plan=${planId}`;
                ctaLabel = "S'abonner";
              } else if (isLoggedIn) {
                ctaHref = "/dashboard";
                ctaLabel = "Contactez votre manager";
              } else {
                ctaHref = `/login?tab=signup&plan=${planId}`;
                ctaLabel = "S'abonner";
              }

              return (
                <div
                  key={planId}
                  className={`relative flex flex-col rounded-2xl border bg-card transition-all duration-300 ${accent.border} ${accent.glow} ${isPopular ? "md:-mt-4 md:mb-[-16px]" : ""}`}
                >
                  {/* Popular badge */}
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-1 text-xs font-bold text-white shadow-lg shadow-amber-500/25">
                        <Crown className="size-3" />
                        Le plus populaire
                      </span>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
                    {/* Icon */}
                    <div className={`mb-4 flex size-12 items-center justify-center rounded-xl ${accent.icon}`}>
                      <Icon className="size-6" />
                    </div>

                    {/* Plan name */}
                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="mt-5">
                      <span className="font-display text-5xl font-extrabold tracking-tight">
                        {plan.price === 0
                          ? "0"
                          : new Intl.NumberFormat("fr-FR").format(plan.price)}
                      </span>
                      <span className="ml-1 text-sm font-medium text-muted-foreground">
                        {plan.price === 0 ? "FCFA" : "FCFA / mois"}
                      </span>
                    </div>

                    {/* Overage label — always rendered for equal height */}
                    <p className={`mt-2 h-4 text-xs ${plan.overageLabel ? "text-muted-foreground" : "invisible"}`}>
                      {plan.overageLabel ? `+ ${plan.overageLabel}` : "\u00A0"}
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="mx-6 border-t border-border" />

                  {/* Features */}
                  <div className="flex flex-1 flex-col px-6 pb-8 pt-6">
                    <ul
                      className="flex-1 space-y-3"
                      role="list"
                      aria-label={`Fonctionnalités du plan ${plan.name}`}
                    >
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-sm"
                        >
                          <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                            <Check
                              className="size-3 text-green-500"
                              aria-hidden="true"
                            />
                          </div>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="mt-8">
                      <Button
                        asChild
                        className={`w-full rounded-xl font-bold transition-transform hover:scale-[1.02] active:scale-[0.98] ${
                          isPopular
                            ? "shadow-lg shadow-primary/25"
                            : ""
                        }`}
                        variant={isPopular ? "default" : "outline"}
                        size="lg"
                      >
                        <Link href={ctaHref}>
                          {ctaLabel}
                          <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-2 text-center text-2xl font-bold">
            Comparaison détaillée
          </h2>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            Tout ce qui est inclus dans chaque plan
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3.5 text-left font-semibold">
                    Fonctionnalité
                  </th>
                  {PLAN_IDS.map((planId) => (
                    <th
                      key={planId}
                      className="px-5 py-3.5 text-center font-semibold"
                    >
                      {SUBSCRIPTION_PLANS[planId].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => (
                  <tr
                    key={row.label}
                    className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/30"}`}
                  >
                    <td className="px-5 py-3 font-medium">{row.label}</td>
                    {(["free", "starter", "pro"] as const).map((planId) => {
                      const val = row[planId];
                      return (
                        <td key={planId} className="px-5 py-3 text-center">
                          {val === true ? (
                            <div className="mx-auto flex size-5 items-center justify-center rounded-full bg-green-500/10">
                              <Check
                                className="size-3 text-green-500"
                                aria-label="Inclus"
                              />
                            </div>
                          ) : val === false ? (
                            <X
                              className="mx-auto size-4 text-muted-foreground/30"
                              aria-label="Non inclus"
                            />
                          ) : (
                            <span className="text-muted-foreground">{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Trust section */}
        <section className="mx-auto max-w-4xl px-6 pb-24">
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                icon: Lock,
                title: "Paiement sécurisé",
                text: "Via Paystack — Visa, Mastercard, Wave, Mobile Money",
              },
              {
                icon: Shield,
                title: "Sans engagement",
                text: "Annulez à tout moment, accès maintenu jusqu'à fin de période",
              },
              {
                icon: Users,
                title: "Support réactif",
                text: "Assistance par WhatsApp, réponse rapide",
              },
            ].map(({ icon: TrustIcon, title, text }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card p-6 text-center"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <TrustIcon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  );
}
