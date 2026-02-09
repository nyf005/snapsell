"use client";

import { Bell } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { PaymentHistory } from "./payment-history";
import { SubscriptionActions } from "./subscription-actions";
import { SubscriptionCard } from "./subscription-card";
import { UsageDashboard } from "./usage-dashboard";

export function SubscriptionContent() {
  const subscription = api.subscription.getSubscription.useQuery();
  const usage = api.subscription.getUsage.useQuery();
  const payments = api.subscription.getPaymentHistory.useQuery();

  if (subscription.isLoading || usage.isLoading) {
    return (
      <>
        <DashboardHeader
          right={
            <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
              <Bell className="size-5" />
            </Button>
          }
        />
        <div className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (subscription.error || usage.error) {
    return (
      <>
        <DashboardHeader
          right={
            <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
              <Bell className="size-5" />
            </Button>
          }
        />
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <p className="text-destructive">
            Erreur lors du chargement des données d&apos;abonnement.
          </p>
        </div>
      </>
    );
  }

  // Guard: after loading check, data should be defined but TS can't prove it
  if (!subscription.data || !usage.data) {
    return null;
  }

  return (
    <>
      <DashboardHeader
        right={
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
            <Bell className="size-5" />
          </Button>
        }
      />
      <div className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Abonnement
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Gérez votre plan, suivez votre usage et consultez vos paiements.
          </p>
        </div>

        {/* Plan card + status */}
        <SubscriptionCard data={subscription.data} />

        {/* Usage dashboard */}
        <UsageDashboard data={usage.data} />

        {/* Actions (subscribe/cancel/update card) */}
        <SubscriptionActions data={subscription.data} />

        {/* Payment history */}
        <PaymentHistory
          data={payments.data ?? []}
          isLoading={payments.isLoading}
        />
      </div>
    </>
  );
}
