"use client";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { PaymentHistory } from "./payment-history";
import { SubscriptionCard } from "./subscription-card";
import { UsageDashboard } from "./usage-dashboard";
import { CreditsUsageDashboard } from "./credits-usage-dashboard";

export function SubscriptionContent() {
  const subscription = api.subscription.getSubscription.useQuery();
  const usage = api.subscription.getUsage.useQuery();
  const credits = api.subscription.getCreditsUsage.useQuery();
  const payments = api.subscription.getPaymentHistory.useQuery();

  if (subscription.isLoading || usage.isLoading || credits.isLoading) {
    return (
      <>
        <DashboardHeader />
        <div className="flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-4 md:p-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </>
    );
  }

  if (subscription.error ?? usage.error ?? credits.error) {
    return (
      <>
        <DashboardHeader />
        <div className="flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-4 md:p-6">
          <p className="text-destructive">
            Erreur lors du chargement des données d&apos;abonnement.
          </p>
          <Button variant="outline" onClick={() => { void subscription.refetch(); void usage.refetch(); void credits.refetch(); }}>Réessayer</Button>
        </div>
      </>
    );
  }

  if (!subscription.data || !usage.data || !credits.data) return null;

  return (
    <>
      <DashboardHeader />
      <div className="flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-4 md:p-6">
        <TaskPageHeader
          href="/parametres/abonnement"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <SubscriptionCard data={subscription.data} />
          <CreditsUsageDashboard data={credits.data} />
        </div>

        <UsageDashboard data={usage.data} />

        {payments.error ? <div role="alert" className="space-y-2"><p>L’historique des paiements n’a pas pu être chargé.</p><Button variant="outline" onClick={() => void payments.refetch()}>Réessayer l’historique</Button></div> : <PaymentHistory data={payments.data ?? []} isLoading={payments.isLoading} />}
      </div>
    </>
  );
}
