import { type Metadata } from "next";
import { marketing } from "~/lib/copy/marketing";
import { formatXofUnitsParts } from "~/lib/copy";
import Link from "next/link";
import { ArrowRight, Check, Zap, Crown, Users, ShoppingCart, Lock, Shield, ShieldCheck, Sparkles, ChevronDown, AlertCircle } from "lucide-react";

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
    "Choisissez le plan SnapSell adapté à votre activité : Free, Starter ou Pro. Commencez gratuitement, passez à la vitesse supérieure quand vos ventes décollent.",
};

const planIcons: Record<PlanId, typeof Zap> = {
  free: ShoppingCart,
  starter: Zap,
  pro: Crown,
};

/* ── C : Tableau de comparaison avec categories ─────────────────────────── */

type ComparisonItem =
  | { kind: "group"; label: string }
  | {
      kind: "row";
      label: string;
      free: string | boolean;
      starter: string | boolean;
      pro: string | boolean;
    };

/**
 * Les lignes quantitatives sont DÉRIVÉES de SUBSCRIPTION_PLANS plutôt que recopiées.
 *
 * Ce tableau était auparavant entièrement codé en dur, indépendamment de la config :
 * deux sources de vérité pour la même grille, et l'une a dérivé sans que l'autre
 * bouge. Tout ce qui peut être calculé depuis les entitlements doit l'être.
 */
const ent = (id: PlanId) => SUBSCRIPTION_PLANS[id].entitlements;

/**
 * Renvoie `false` — et non un tiret — quand le plan ne propose pas de recharge :
 * la cellule emprunte alors le même rendu que les autres « non inclus », donc le
 * même tiret ET le libellé sr-only « Non inclus » qu'un caractère seul n'aurait pas.
 */
const packLabel = (id: PlanId): string | false => {
  const price = SUBSCRIPTION_PLANS[id].creditPackPriceFCFA;
  return price ? `${price.toLocaleString("fr-FR")} FCFA / 100` : false;
};

const auditLabel = (id: PlanId) => {
  const days = ent(id).auditRetentionDays;
  return days === -1 ? "Illimité" : `${days} jours`;
};

const comparisonItems: ComparisonItem[] = [
  { kind: "group", label: "Volume & limites" },
  {
    kind: "row",
    label: "Conversations client / mois",
    free: ent("free").creditsTotalMonthly.toLocaleString("fr-FR"),
    starter: ent("starter").creditsTotalMonthly.toLocaleString("fr-FR"),
    pro: ent("pro").creditsTotalMonthly.toLocaleString("fr-FR"),
  },
  { kind: "row", label: "Commandes", free: "Illimité", starter: "Illimité", pro: "Illimité" },
  {
    kind: "row",
    label: "Packs de conversations",
    free: packLabel("free"),
    starter: packLabel("starter"),
    pro: packLabel("pro"),
  },
  {
    kind: "row",
    label: "IA (analyse des intentions)",
    free: ent("free").hasAI,
    starter: ent("starter").hasAI,
    pro: ent("pro").hasAI,
  },
  { kind: "row", label: "Preuves / mois", free: "Illimité", starter: "Illimité", pro: "Illimité" },
  {
    kind: "row",
    label: "Agents",
    free: String(ent("free").maxAgents),
    starter: String(ent("starter").maxAgents),
    pro: String(ent("pro").maxAgents),
  },
  { kind: "group", label: "Fonctionnalités principales" },
  { kind: "row", label: "Grille catégories prix", free: true, starter: true, pro: true },
  { kind: "row", label: "File de réservation", free: true, starter: true, pro: true },
  { kind: "row", label: "Tableau de bord des commandes", free: true, starter: true, pro: true },
  { kind: "row", label: "Notifications de statut", free: true, starter: true, pro: true },
  { kind: "group", label: "Outils avancés" },
  {
    kind: "row",
    label: "Export CSV",
    free: ent("free").hasExportCsv,
    starter: "Standard",
    pro: "Enrichi",
  },
  {
    kind: "row",
    label: "Journal d'activité",
    free: auditLabel("free"),
    starter: auditLabel("starter"),
    pro: auditLabel("pro"),
  },
  {
    kind: "row",
    label: "Acompte recommandé",
    free: ent("free").hasDepositRecommended,
    starter: ent("starter").hasDepositRecommended,
    pro: ent("pro").hasDepositRecommended,
  },
  { kind: "group", label: "Support" },
  {
    kind: "row",
    label: "Support prioritaire",
    free: ent("free").hasPrioritySupport,
    starter: ent("starter").hasPrioritySupport,
    pro: ent("pro").hasPrioritySupport,
  },
  {
    kind: "row",
    label: "Branding SnapSell",
    free: ent("free").showBranding ? "Oui" : "Non",
    starter: ent("starter").showBranding ? "Oui" : "Non",
    pro: ent("pro").showBranding ? "Oui" : "Non",
  },
];

/* ── D : FAQ ─────────────────────────────────────────────────────────────── */

const faqItems = [
  {
    q: "Qu’est-ce qu’une conversation client ?",
    a: "Une conversation client correspond à 24 h d’échanges illimités avec un même numéro sur WhatsApp. Chaque nouveau numéro ouvre une conversation. Pendant 24 h, tous les échanges avec ce numéro consomment le même crédit, quel que soit le nombre de messages.",
  },
  {
    q: "Que se passe-t-il si je dépasse ma limite de conversations ?",
    a: "Les conversations avec de nouveaux numéros sont mises en pause jusqu’au renouvellement de votre mois : les échanges déjà ouverts continuent normalement. En Starter et Pro, vous pouvez recharger à tout moment par packs de 100 conversations (2 500 FCFA en Starter, 2 000 FCFA en Pro), et les conversations achetées n’expirent pas. En Free, les 70 conversations se renouvellent chaque mois — pour aller au-delà, passez à Starter. Dans tous les cas, nous vous alertons dans le tableau de bord dès 80 % de consommation.",
  },
  {
    q: "Puis-je changer de plan à tout moment ?",
    a: "Oui. Vous pouvez passer à un plan supérieur immédiatement depuis Paramètres - Abonnement. L’accès au nouveau plan est instantané.",
  },
  {
    q: "Y a-t-il un engagement minimum ?",
    a: "Aucun. Les plans sont facturés mensuellement et vous pouvez annuler à tout moment. Votre accès reste actif jusqu’à la fin de la période payée.",
  },
  {
    q: "Comment fonctionne le paiement ?",
    a: "Via Paystack - Visa, Mastercard, Wave et Mobile Money acceptés. Facturation automatique chaque mois, reçu envoyé par email.",
  },
] as const;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Une cellule du comparatif.
 *
 * Les états inclus/non inclus passent par du texte `sr-only` plutôt que par un
 * `aria-label` sur l'icône : le « non inclus » ne rendait qu'un tiret décoratif,
 * qu'un lecteur d'écran annonce « tiret » ou ignore — or c'est justement
 * l'information qu'on vient chercher dans un tableau comparatif.
 */
function CellValue({
  val,
  isPro,
}: {
  val: string | boolean;
  isPro?: boolean;
}) {
  if (val === true)
    return (
      <>
        <div
          aria-hidden="true"
          className="mx-auto flex size-5 items-center justify-center rounded-full bg-green-500/15"
        >
          <Check className="size-3 text-green-500" />
        </div>
        <span className="sr-only">Inclus</span>
      </>
    );
  if (val === false)
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground/40">
          -
        </span>
        <span className="sr-only">Non inclus</span>
      </>
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
                Impossible d'ouvrir la page de paiement. Vérifiez que les
                clés Paystack et les plan codes sont correctement configurés, ou
                réessayez plus tard.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ── A : Hero cinematique ───────────────────────────────────────── */}
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

            {/*
              « Facturation sur les conversations uniquement » laissait croire à
              du paiement à l'usage, alors que c'est un forfait mensuel : un
              Starter paie 25 000 F même avec trois conversations. Le sens voulu
              — rien d'autre n'est facturé — est conservé, sans l'ambiguïté.
            */}
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Commencez gratuitement, passez à la vitesse supérieure quand vos
              ventes décollent. Un forfait mensuel dimensionné par vos{" "}
              <strong className="text-foreground">conversations client</strong>{" "}
              — ni frais par commande, ni frais par message.
            </p>

            {/* Aucune preuve sociale inventée : le produit se décrit lui-même. */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <span>Aucune carte bancaire pour démarrer</span>
              <span>{marketing.promise.setup}</span>
            </div>
          </div>
        </section>

        {/* ── B : Plan Cards ─────────────────────────────────────────────── */}
        <section
          className="mx-auto max-w-5xl px-6 pb-24"
          aria-label="Plans tarifaires"
        >
          {/*
            Pas d'`items-start` : les cartes s'étirent à la hauteur de la plus
            haute, sinon le nombre de lignes de fonctionnalités décale les trois
            boutons. La carte Pro n'est pas non plus décalée vers le haut : le
            prix est ce qu'on compare d'une carte à l'autre, il doit rester sur
            une seule ligne. Sa mise en avant passe par la couleur et le badge.
          */}
          <div className="grid gap-6 md:grid-cols-3">
            {PLAN_IDS.map((planId, planIndex) => {
              const plan = SUBSCRIPTION_PLANS[planId];
              const Icon = planIcons[planId];
              const isPopular = !!plan.popular;
              const price = formatXofUnitsParts(plan.price);
              const previousPlanId = PLAN_IDS[planIndex - 1];
              const inheritsFrom = previousPlanId
                ? SUBSCRIPTION_PLANS[previousPlanId].name
                : null;

              let ctaHref: string;
              let ctaLabel: string;
              if (planId === "free") {
                ctaHref = isLoggedIn ? "/dashboard" : "/login?tab=signup";
                ctaLabel = isLoggedIn
                  ? "Tableau de bord"
                  : marketing.cta.signup;
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
                      ? // `border-transparent` : sans lui, la carte Pro n'a pas
                        // le liseré de 1px des deux autres et tout son contenu
                        // remonte d'un pixel.
                        "border border-transparent bg-primary text-primary-foreground shadow-2xl shadow-primary/40"
                      : planId === "starter"
                        ? "border border-primary/25 bg-card shadow-lg shadow-primary/5 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
                        : "border border-border bg-card hover:border-border/60 hover:shadow-md"
                  }`}
                >
                  {/* Popular badge */}
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-4 py-1.5 text-xs font-bold text-primary shadow-lg shadow-primary/20">
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
                          ? "bg-primary-foreground/15 text-primary-foreground"
                          : planId === "starter"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-6" />
                    </div>

                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <p
                      className={`mt-1 text-sm ${isPopular ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      {plan.description}
                    </p>

                    <div className="mt-5 flex flex-wrap items-baseline justify-center gap-x-1.5">
                      {plan.price === 0 ? (
                        <span className="font-display text-5xl font-extrabold tracking-tight">
                          Gratuit
                        </span>
                      ) : (
                        <>
                          <span className="font-display text-5xl font-extrabold tracking-tight data-numeric">
                            {price.amount}
                          </span>
                          <span
                            className={`text-base font-semibold ${isPopular ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                          >
                            {price.currency}
                          </span>
                          <span
                            className={`text-sm font-medium ${isPopular ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                          >
                            / mois
                          </span>
                        </>
                      )}
                    </div>

                    <p
                      className={`mt-2 h-4 text-xs ${
                        plan.creditPackLabel
                          ? isPopular
                            ? "text-primary-foreground/65"
                            : "text-muted-foreground"
                          : "invisible"
                      }`}
                    >
                      {plan.creditPackLabel ?? "\u00A0"}
                    </p>
                  </div>

                  {/* Divider */}
                  <div
                    className={`mx-6 border-t ${isPopular ? "border-primary-foreground/20" : "border-border"}`}
                  />

                  {/* Features */}
                  <div className="flex flex-1 flex-col px-6 pb-8 pt-6">
                    {/*
                      Chaque plan contient le précédent : le dire évite de
                      relire trois listes pour comprendre ce qui change.
                    */}
                    {inheritsFrom && (
                      <p
                        className={`mb-4 text-xs font-bold uppercase tracking-wider ${
                          isPopular
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        Tout dans {inheritsFrom}, plus :
                      </p>
                    )}
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
                              isPopular ? "bg-primary-foreground/15" : "bg-green-500/10"
                            }`}
                          >
                            <Check
                              className={`size-3 ${isPopular ? "text-primary-foreground" : "text-green-500"}`}
                              aria-hidden="true"
                            />
                          </div>
                          <span
                            className={isPopular ? "text-primary-foreground/90" : ""}
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
                            ? "bg-primary-foreground text-primary shadow-lg hover:bg-primary-foreground/90"
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

        {/* ── C : Tableau de comparaison avec categories ─────────────────── */}
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
                  <th
                    scope="col"
                    className="px-5 py-4 text-left font-semibold text-foreground"
                  >
                    Fonctionnalité
                  </th>
                  {PLAN_IDS.map((planId) => (
                    <th
                      key={planId}
                      scope="col"
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
                        {/* colSpan dérivé : le tableau entier suit PLAN_IDS, cette
                            ligne doit en faire autant plutôt que figer un 4. */}
                        <th
                          scope="colgroup"
                          colSpan={PLAN_IDS.length + 1}
                          className="bg-muted/40 px-5 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground"
                        >
                          {item.label}
                        </th>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={item.label}
                      className={`border-b border-border last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      {/* `th scope="row"` : sans lui, un lecteur d'écran ne peut pas
                          rattacher « Illimité » à la fois à sa ligne et à sa colonne. */}
                      <th scope="row" className="px-5 py-3 text-left font-medium">
                        {item.label}
                      </th>
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

        {/* ── D : FAQ + réassurance ───────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-primary">
            Questions fréquentes
          </p>
          <h2 className="mb-8 text-center text-2xl font-bold">
            Tout ce que vous devez savoir
          </h2>

          {/*
            La FAQ et l'encart sont deux enfants directs de la grille : ils
            s'étirent donc à la même hauteur, sous le titre commun.
          */}
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:gap-10">
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

            {/*
              Bloc de réassurance. Volontairement sans « essai gratuit » : le
              plan Free est permanent, pas une période d'essai — et le terme est
              banni par `marketing.ts`. Le dire est plus fort que l'inverse.
            */}
            <aside className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-7">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
                <ShieldCheck className="size-5 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Commencez sans risque</h2>
              <ul className="flex flex-col gap-3" role="list">
                {[
                  // Cet encart s'adresse à quelqu'un qui démarre, donc en Free.
                  // Ne rien y promettre qui soit réservé aux plans payants : la
                  // ligne « vos conversations achetées n'expirent jamais » y
                  // figurait alors que le Free n'achète pas de conversations.
                  "Le plan Free est permanent, ce n’est pas une période d’essai",
                  "Aucune carte bancaire pour démarrer",
                  "Vos 70 conversations se renouvellent chaque mois",
                  "Changez ou arrêtez votre plan à tout moment",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              {/* `mt-auto` : le bouton se cale en bas de l'encart, donc au
                  même niveau que le bas de la FAQ d'à côté. */}
              <Button asChild size="lg" className="mt-auto w-full rounded-xl font-bold">
                <Link href={isLoggedIn ? "/dashboard" : "/login?tab=signup"}>
                  {isLoggedIn ? "Tableau de bord" : marketing.cta.signup}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </aside>
          </div>
        </section>

        {/* Trust section */}
        <section className="mx-auto max-w-4xl px-6 pb-24">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: Lock,
                title: "Paiement sécurisé",
                text: "Via Paystack - Visa, Mastercard, Wave, Mobile Money",
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