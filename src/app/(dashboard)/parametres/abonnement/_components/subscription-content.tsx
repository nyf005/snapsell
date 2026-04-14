"use client";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { PaymentHistory } from "./payment-history";
import { SubscriptionCard } from "./subscription-card";
import { UsageDashboard } from "./usage-dashboard";

export function SubscriptionContent() {
  const subscription = api.subscription.getSubscription.useQuery();
  const usage = api.subscription.getUsage.useQuery();
  const payments = api.subscription.getPaymentHistory.useQuery();

  if (subscription.isLoading || usage.isLoading) {
    return (
      <>
        <DashboardHeader />
        <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-6 md:p-8">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </>
    );
  }

  if (subscription.error || usage.error) {
    return (
      <>
        <DashboardHeader />
        <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-6 md:p-8">
          <p className="text-destructive">
            Erreur lors du chargement des données d&apos;abonnement.
          </p>
        </div>
      </>
    );
  }

  if (!subscription.data || !usage.data) {
    return null;
  }

  return (
    <>
      <DashboardHeader />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-6 md:p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Abonnement
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Plan actuel, usage et paiements
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <SubscriptionCard data={subscription.data} />
          <UsageDashboard data={usage.data} />
        </div>

        <PaymentHistory
          data={payments.data ?? []}
          isLoading={payments.isLoading}
        />
      </div>
    </>
  );
}
