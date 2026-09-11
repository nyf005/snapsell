"use client";

import { api } from "~/trpc/react";
import { ErrorAlert } from "~/components/ui/error-alert";
import { Button } from "~/components/ui/button";

function duration(seconds: number | null) {
  if (seconds === null) return "Pas encore mesuré";
  if (seconds < 60) return "Moins d’une minute";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} j`;
}

export function ProductMetrics() {
  const { data, error, isLoading, isFetching, refetch } = api.dashboard.getProductMetrics.useQuery(
    undefined, { staleTime: 60_000 },
  );
  return (
    <section aria-labelledby="product-metrics-heading" className="space-y-4">
      <h2 id="product-metrics-heading" className="text-lg font-bold">Le bilan de vos ventes</h2>
      <p className="text-sm text-muted-foreground">Les 30 derniers jours. Les nouvelles mesures commencent à leur activation ; une absence de données ne vaut pas zéro.</p>
      {isLoading && <p role="status">Chargement du bilan…</p>}
      {error && <div className="space-y-2"><ErrorAlert error={error} /><Button variant="outline" disabled={isFetching} onClick={() => { void refetch(); }}>Réessayer</Button></div>}
      {data && <dl className="grid gap-5 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Réservations devenues commandes</dt><dd className="text-xl font-semibold">{data.conversionPercent === null ? "Pas encore mesuré" : `${data.conversionPercent} %`}</dd><dd className="text-sm">{data.converted} sur {data.reservations} réservations, commandes annulées incluses.</dd></div>
        <div><dt className="text-sm text-muted-foreground">Conversations transmises à une personne</dt><dd className="text-xl font-semibold">{data.handoffPercent === null ? "Pas encore mesuré" : `${data.handoffPercent} %`}</dd><dd className="text-sm">{data.handedOff} sur {data.conversations} conversations mesurées.</dd></div>
        <div><dt className="text-sm text-muted-foreground">Première confirmation après inscription</dt><dd className="text-xl font-semibold">{duration(data.firstConfirmationSeconds)}</dd><dd className="text-sm">Première confirmation de commande acceptée par WhatsApp, depuis l’ouverture du compte.</dd></div>
        <div><dt className="text-sm text-muted-foreground">Du live terminé à la mise en livraison</dt><dd className="text-xl font-semibold">{duration(data.preparationSeconds)}</dd><dd className="text-sm">Délai médian sur {data.preparationSamples} commandes mises en livraison après le live.</dd></div>
      </dl>}
    </section>
  );
}
