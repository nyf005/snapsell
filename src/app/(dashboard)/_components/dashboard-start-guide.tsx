"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Radio, ShoppingCart } from "lucide-react";

import { Button } from "~/components/ui/button";

/**
 * Bandeau d'action prioritaire — « le travail du moment d'abord » (PRODUCT.md).
 *
 * Ne s'occupe QUE du triage quotidien. La mise en route d'une nouvelle boutique est
 * gérée par SetupChecklist, qui connaît l'état réel de la configuration ; ce composant
 * ne le connaît pas et ne doit donc rien proposer à un compte neuf.
 */
type DashboardStartGuideProps = {
  hasLiveSession: boolean;
  pendingProofsCount: number;
  ordersPreparingCount: number;
};

export function DashboardStartGuide({
  hasLiveSession,
  pendingProofsCount,
  ordersPreparingCount,
}: DashboardStartGuideProps) {
  const priority =
    pendingProofsCount > 0
      ? {
          href: "/dashboard/proofs",
          icon: CheckCircle2,
          eyebrow: "À traiter maintenant",
          title: `${pendingProofsCount} preuve${pendingProofsCount > 1 ? "s" : ""} à vérifier`,
          description: "Validez les acomptes pour ne pas retarder les commandes.",
          action: "Vérifier les preuves",
        }
      : ordersPreparingCount > 0
        ? {
            href: "/dashboard/orders",
            icon: ShoppingCart,
            eyebrow: "Prochaine étape",
            title: `${ordersPreparingCount} commande${ordersPreparingCount > 1 ? "s" : ""} à préparer`,
            description: "Passez les commandes prêtes à l’étape suivante.",
            action: "Ouvrir les commandes",
          }
        : hasLiveSession
          ? {
              href: "/dashboard/live",
              icon: Radio,
              eyebrow: "Live en cours",
              title: "Les réservations arrivent ici",
              description: "Suivez les délais et libérez une réservation si nécessaire.",
              action: "Suivre le live",
            }
          : null;

  // Rien d'urgent : la place revient à SetupChecklist si la boutique n'est pas prête,
  // sinon aux indicateurs du jour.
  if (!priority) return null;

  const Icon = priority.icon;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            {priority.eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">{priority.title}</h2>
          <p className="mt-1 max-w-[58ch] text-sm leading-6 text-muted-foreground">
            {priority.description}
          </p>
        </div>
      </div>
      <Button asChild className="w-full shrink-0 sm:w-auto">
        <Link href={priority.href}>
          {priority.action}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
