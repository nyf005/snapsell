"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Zap, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { api } from "~/trpc/react";

interface SubscriptionActionsProps {
  data: {
    plan: string;
    status: string;
    hasPaystackSubscription: boolean;
  };
}

export function SubscriptionActions({ data }: SubscriptionActionsProps) {
  const utils = api.useUtils();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelMutation = api.subscription.cancelSubscription.useMutation({
    onSuccess: () => {
      void utils.subscription.getSubscription.invalidate();
      setCancelError(null);
    },
    onError: (err) => {
      setCancelError(err.message);
    },
  });

  const manageCardQuery = api.subscription.getManageCardLink.useQuery(
    undefined,
    { enabled: false },
  );

  const handleManageCard = async () => {
    const result = await manageCardQuery.refetch();
    if (result.data?.link) {
      window.open(result.data.link, "_blank");
    }
  };

  const isFree = data.plan === "free";
  const isPaid = data.plan === "starter" || data.plan === "pro";
  const canCancel =
    isPaid &&
    data.status !== "cancelled" &&
    data.status !== "non_renewing";
  const showUpdateCard =
    isPaid &&
    data.hasPaystackSubscription &&
    (data.status === "active" || data.status === "attention");

  return (
    <section
      className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
      aria-labelledby="actions-title"
    >
      <h2 id="actions-title" className="mb-5 font-semibold text-foreground">
        Actions
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {isFree && (
          <>
            <Button asChild size="sm">
              <Link href="/tarifs">
                <Zap className="mr-2 size-4" />
                Passer au plan Starter
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/tarifs">Voir les plans</Link>
            </Button>
          </>
        )}

        {data.plan === "starter" && data.status === "active" && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/tarifs">
              <Zap className="mr-2 size-4" />
              Passer au plan Pro
            </Link>
          </Button>
        )}

        {showUpdateCard && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleManageCard}
            disabled={manageCardQuery.isFetching}
          >
            <CreditCard className="mr-2 size-4" />
            {data.status === "attention"
              ? "Mettre à jour ma carte"
              : "Gérer ma carte"}
          </Button>
        )}

        {canCancel && (
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <X className="mr-2 size-4" />
                  Annuler l&apos;abonnement
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Annuler votre abonnement ?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Votre accès sera maintenu jusqu&apos;à la fin de votre
                    période de facturation. Ensuite, votre compte passera au
                    plan Free.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Garder mon abonnement</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending
                      ? "Annulation..."
                      : "Confirmer l'annulation"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {cancelError && (
              <p className="text-sm text-destructive">{cancelError}</p>
            )}
          </div>
        )}

        {data.status === "cancelled" && (
          <p className="text-sm text-muted-foreground">
            Abonnement annulé.{" "}
            <Link href="/tarifs" className="text-primary hover:underline">
              Réabonnez-vous
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
