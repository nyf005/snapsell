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
  Sparkles,
  ChevronDown,
  AlertCircle,
} from "lucide-react";

import { SiteHeader } from "~/components/site-header";
import { LandingFooter } from "~/app/_components/landing/landing-footer";
import { Button } from "~/components/ui/button";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import {
  SUBSCRIPTION_PLANS,
  PLAN_IDS,
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

/* ── C : Tableau de comparaison avec catégories ─────────────────────────── */

type ComparisonItem =
  | { kind: "group"; label: string }
  | {
      kind: "row";
      label: string;
      free: string | boolean;
      starter: string | boolean;
      pro: string | boolean;
    };

const comparisonItems: ComparisonItem[] = [
  { kind: "group", label: "Volume & limites" },
  { kind: "row", label: "Commandes confirmées / mois", free: "50", starter: "300", pro: "700" },
  { kind: "row", label: "Overage", free: "Bloqué", starter: "75 FCFA / cmd", pro: "100 FCFA / cmd" },
  { kind: "row", label: "Preuves / mois", free: "20", starter: "Illimité", pro: "Illimité" },
  { kind: "row", label: "Agents", free: "0", starter: "1", pro: "5" },
  { kind: "group", label: "Fonctionnalités core" },
  { kind: "row", label: "Grille catégories → prix", free: true, starter: true, pro: true },
  { kind: "row", label: "Live session auto", free: true, starter: true, pro: true },
  { kind: "row", label: "Réservation + file + TTL", free: true, starter: true, pro: true },
  { kind: "row", label: "Dashboard commandes", free: true, starter: true, pro: true },
  { kind: "row", label: "Proofs inbox", free: "Limité", starter: "Complet", pro: "Complet" },
  { kind: "group", label: "Outils avancés" },
  { kind: "row", label: "Export CSV", free: false, starter: "Basique", pro: "Avancé" },
  { kind: "row", label: "Notifications hors 24h", free: false, starter: true, pro: true },
  { kind: "row", label: "Acompte recommandé", free: false, starter: true, pro: true },
  { kind: "row", label: "Filtres avancés + audit", free: false, starter: "Basique", pro: "Avancé" },
  { kind: "group", label: "Support" },
  { kind: "row", label: "Support prioritaire", free: false, starter: false, pro: true },
  { kind: "row", label: "Branding SnapSell", free: "Oui", starter: "Non", pro: "Non" },
];

/* ── D : FAQ ─────────────────────────────────────────────────────────────── */

const faqItems = [
  {
    q: "Qu'est-ce qu'une commande confirmée ?",
    a: "Une commande confirmée est une réservation WhatsApp validée et payée par votre client. Les réservations annulées ou expirées (TTL) ne sont pas comptabilisées dans votre quota.",
  },
  {
    q: "Que se passe-t-il si je dépasse ma limite mensuelle ?",
    a: "En Free, les nouvelles commandes sont bloquées jusqu'à la fin du mois. En Starter et Pro, chaque commande supplémentaire est facturée à l'overage (75 ou 100 FCFA). Vous ne perdez jamais de ventes.",
  },
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui. Vous pouvez passer à un plan supérieur immédiatement depuis Paramètres → Abonnement. L'accès au nouveau plan est instantané.",
  },
  {
    q: "Y a-t-il un engagement minimum ?",
    a: "Aucun. Les plans sont facturés mensuellement et vous pouvez annuler à tout moment. Votre accès reste actif jusqu'à la fin de la période payée.",
  },
  {
    q: "Comment fonctionne le paiement ?",
    a: "Via Paystack — Visa, Mastercard, Wave et Mobile Money acceptés. Facturation automatique chaque mois, reçu envoyé par email.",
  },
] as const;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function CellValue({
  val,
  isPro,
}: {
  val: string | boolean;
  isPro?: boolean;
}) {
  if (val === true)
    return (
      <div className="mx-auto flex size-5 items-center justify-center rounded-full bg-green-500/15">
        <Check className="size-3 text-green-500" aria-label="Inclus" />
      </div>
    );
  if (val === false)
    return (
      <X
        className="mx-auto size-4 text-muted-foreground/30"
        aria-label="Non inclus"
      />
    );
  return (
    <span className={isPro ? "font-medium text-primary" : "text-muted-foreground"}>
      {val}
    </span>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

type TarifsPageProps = { searchParams?: Promise<{ error?: string }> };

export default async function TarifsPage(props: TarifsPageProps) {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const isManager =
    isLoggedIn && canManageGrid(session.user.role as string);

  const searchParams =
    props.searchParams != null ? await props.searchParams : {};
  const paymentError = searchParams.error === "payment_init_failed";

  return (
    <>
      <SiteHeader
        user={
          session?.user
            ? { name: session.user.name, email: session.user.email! }
            : null
        }
      />
      <main id="main-content" className="min-h-screen bg-background">
        {paymentError && (
          <div className="mx-auto max-w-5xl px-6 pt-4">
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertDescription>
                Impossible d&apos;ouvrir la page de paiement. Vérifiez que les
                clés Paystack et les plan codes sont correctement configurés, ou
                réessayez plus tard.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── A : Hero cinématique ───────────────────────────────────────── */}
        <section className="relative overflow-hidden px-6 pb-24 pt-24 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,var(--primary),transparent_70%)] opacity-[0.1]"
          />
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5" />
              Pas de surprise, pas d&apos;engagement
            </div>

            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Un plan pour chaque{" "}
              <span className="hero-gradient-text">vendeur</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Commencez gratuitement, passez à la vitesse supérieure quand vos
              ventes décollent. Facturation sur les{" "}
              <strong className="text-foreground">commandes confirmées</strong>{" "}
              uniquement.
            </p>

            {/* Social proof */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-2" aria-hidden="true">
                  {["S", "A", "M", "F"].map((l) => (
                    <div
                      key={l}
                      className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary/25 text-xs font-bold text-primary"
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <span>500+ vendeurs actifs</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-green-500" aria-hidden="true" />
                <span>Aucune CB requise pour démarrer</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── B : Plan Cards ─────────────────────────────────────────────── */}
        <section
          className="mx-auto max-w-5xl px-6 pb-24"
          aria-label="Plans tarifaires"
        >
          <div className="grid items-start gap-6 md:grid-cols-3">
            {PLAN_IDS.map((planId) => {
              const plan = SUBSCRIPTION_PLANS[planId];
              const Icon = planIcons[planId];
              const isPopular = !!plan.popular;

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
                  className={`relative flex flex-col rounded-2xl transition-all duration-300 ${
                    isPopular
                      ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/40 md:-mt-6"
                      : planId === "starter"
                        ? "border border-primary/25 bg-card shadow-lg shadow-primary/5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
                        : "border border-border bg-card hover:border-border/60 hover:shadow-md"
                  }`}
                >
                  {/* Popular badge */}
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-primary shadow-lg shadow-primary/20">
                        <Crown className="size-3" />
                        Le plus populaire
                      </span>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
                    <div
                      className={`mb-4 flex size-12 items-center justify-center rounded-xl ${
                        isPopular
                          ? "bg-white/20 text-white"
                          : planId === "starter"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-6" />
                    </div>

                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <p
                      className={`mt-1 text-sm ${isPopular ? "text-white/70" : "text-muted-foreground"}`}
                    >
                      {plan.description}
                    </p>

                    <div className="mt-5">
                      <span className="font-display text-5xl font-extrabold tracking-tight">
                        {plan.price === 0
                          ? "0"
                          : new Intl.NumberFormat("fr-FR").format(plan.price)}
                      </span>
                      <span
                        className={`ml-1 text-sm font-medium ${isPopular ? "text-white/70" : "text-muted-foreground"}`}
                      >
                        {plan.price === 0 ? "FCFA" : "FCFA / mois"}
                      </span>
                    </div>

                    <p
                      className={`mt-2 h-4 text-xs ${
                        plan.overageLabel
                          ? isPopular
                            ? "text-white/60"
                            : "text-muted-foreground"
                          : "invisible"
                      }`}
                    >
                      {plan.overageLabel
                        ? `+ ${plan.overageLabel}`
                        : "\u00A0"}
                    </p>
                  </div>

                  {/* Divider */}
                  <div
                    className={`mx-6 border-t ${isPopular ? "border-white/20" : "border-border"}`}
                  />

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
                          <div
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                              isPopular ? "bg-white/20" : "bg-green-500/10"
                            }`}
                          >
                            <Check
                              className={`size-3 ${isPopular ? "text-white" : "text-green-500"}`}
                              aria-hidden="true"
                            />
                          </div>
                          <span
                            className={isPopular ? "text-white/90" : ""}
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="mt-8">
                      <Button
                        asChild
                        size="lg"
                        variant={isPopular ? "default" : "outline"}
                        className={`w-full rounded-xl font-bold transition-transform hover:scale-[1.02] active:scale-[0.98] ${
                          isPopular
                            ? "bg-white text-primary shadow-lg hover:bg-white/90"
                            : ""
                        }`}
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

        {/* ── C : Tableau de comparaison avec catégories ─────────────────── */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <h2 className="mb-2 text-center text-2xl font-bold">
            Comparaison détaillée
          </h2>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            Tout ce qui est inclus dans chaque plan
          </p>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  <th className="px-5 py-4 text-left font-semibold text-foreground">
                    Fonctionnalité
                  </th>
                  {PLAN_IDS.map((planId) => (
                    <th
                      key={planId}
                      className={`px-5 py-4 text-center font-bold ${
                        planId === "pro"
                          ? "text-primary"
                          : "text-foreground"
                      }`}
                    >
                      {planId === "pro" && (
                        <Crown className="mx-auto mb-1 size-3.5 text-primary" />
                      )}
                      {SUBSCRIPTION_PLANS[planId].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonItems.map((item, idx) => {
                  if (item.kind === "group") {
                    return (
                      <tr key={`group-${item.label}`}>
                        <td
                          colSpan={4}
                          className="bg-muted/40 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        >
                          {item.label}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={item.label}
                      className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      <td className="px-5 py-3 font-medium">{item.label}</td>
                      <td className="px-5 py-3 text-center">
                        <CellValue val={item.free} />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <CellValue val={item.starter} />
                      </td>
                      <td className="bg-primary/[0.04] px-5 py-3 text-center">
                        <CellValue val={item.pro} isPro />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── D : FAQ ────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <h2 className="mb-2 text-center text-2xl font-bold">
            Questions fréquentes
          </h2>
          <p className="mb-10 text-center text-sm text-muted-foreground">
            Tout ce que vous devez savoir avant de vous lancer
          </p>

          <div className="divide-y divide-border rounded-2xl border border-border">
            {faqItems.map(({ q, a }) => (
              <details key={q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Trust section */}
        <section className="mx-auto max-w-4xl px-6 pb-24">
          <div className="grid gap-6 sm:grid-cols-3">
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
                className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card p-6 text-center transition-all duration-300 hover:border-primary/20 hover:shadow-md"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
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
