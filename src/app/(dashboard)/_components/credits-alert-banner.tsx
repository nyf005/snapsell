"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { formatCreditCount, ui } from "~/lib/copy";
import { api } from "~/trpc/react";

/**
 * Alerte de solde bas, version mobile.
 *
 * L'alerte n'existait que dans le pied de la barre latérale — un composant réservé au
 * desktop, et sur mobile enfermé dans une feuille que la vendeuse doit ouvrir. La barre
 * de navigation mobile ne rend pas la barre latérale du tout : l'avertissement le plus
 * actionnable du produit était donc invisible sur téléphone.
 *
 * On l'affiche ici en pleine largeur en haut de /dashboard, sous `md` uniquement —
 * au-dessus, l'alerte de la barre latérale suffit.
 */
export function CreditsAlertBanner({
  canManageSubscription,
}: {
  canManageSubscription: boolean;
}) {
  const { data } = api.subscription.getCreditsUsage.useQuery(undefined, {
    staleTime: 60_000,
    enabled: canManageSubscription,
  });

  if (!canManageSubscription || !data?.isLowCredits) return null;

  return (
    <Link
      href="/parametres/abonnement"
      role="status"
      className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 md:hidden"
    >
      <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {formatCreditCount(data.balance)} restantes
        </span>
        <span className="block text-xs leading-4 text-muted-foreground">
          {ui.credits.lowDetail}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
