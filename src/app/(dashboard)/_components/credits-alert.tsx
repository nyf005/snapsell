"use client";

import { CreditCard } from "lucide-react";
import Link from "next/link";

import { formatCreditCount, ui } from "~/lib/copy";
import { api } from "~/trpc/react";

type CreditsAlertProps = {
  /**
   * Seuls le propriétaire et les managers peuvent lire le solde
   * (`getCreditsUsage` appelle `assertCanManageSubscription`). Monter ce composant
   * pour un AGENT ou un VENDEUR déclenchait un 403 à chaque chargement de page.
   */
  canManageSubscription: boolean;
};

export function CreditsAlert({ canManageSubscription }: CreditsAlertProps) {
  const { data } = api.subscription.getCreditsUsage.useQuery(undefined, {
    staleTime: 60_000,
    enabled: canManageSubscription,
  });

  if (!canManageSubscription || !data?.isLowCredits) return null;

  return (
    <Link
      href="/parametres/abonnement"
      className="flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning-foreground transition-colors hover:bg-warning/25"
      aria-label={`${formatCreditCount(data.balance)} restantes. ${ui.credits.lowDetail}`}
    >
      <CreditCard className="size-3.5 shrink-0" />
      {/* Le nombre était masqué sous `sm`, alors même que la sidebar qui l'héberge
          est déjà réservée au desktop : la vendeuse ne voyait jamais son solde. */}
      <span>{formatCreditCount(data.balance)}</span>
    </Link>
  );
}
