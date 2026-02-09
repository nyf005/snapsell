"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Zap, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
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
    {
      enabled: false, // Lazy — only on demand
    },
  );

  const handleManageCard = async () => {
    const result = await manageCardQuery.refetch();
    if (result.data?.link) {
      window.open(result.data.link, "_blank");
    }
  };

  const isFree = data.plan === "free";
  const isPaid =
    data.plan === "starter" || data.plan === "pro";
  const canCancel =
    isPaid &&
    data.status !== "cancelled" &&
    data.status !== "non_renewing";
  const showUpdateCard =
    isPaid &&
    data.hasPaystackSubscription &&
    (data.status === "active" || data.status === "attention");

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-bold">Actions</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upgrade CTA for Free plan */}
        {isFree && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/tarifs">
                <Zap className="mr-2 size-4" />
                Passer au plan Starter
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/tarifs">Voir tous les plans</Link>
            </Button>
          </div>
        )}

        {/* Upgrade for Starter → Pro */}
        {data.plan === "starter" && data.status === "active" && (
          <Button variant="outline" asChild>
            <Link href="/tarifs">
              <Zap className="mr-2 size-4" />
              Passer au plan Pro
            </Link>
          </Button>
        )}

        {/* Update card */}
        {showUpdateCard && (
          <Button
            variant="outline"
            onClick={handleManageCard}
            disabled={manageCardQuery.isFetching}
          >
            <CreditCard className="mr-2 size-4" />
            {data.status === "attention"
              ? "Mettre à jour ma carte"
              : "Gérer ma carte"}
          </Button>
        )}

        {/* Cancel subscription */}
        {canCancel && (
          <div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive">
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
                    période de facturation en cours. Après cela, votre compte
                    passera au plan Free.
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
              <p className="mt-2 text-sm text-destructive">{cancelError}</p>
            )}
          </div>
        )}

        {/* Status: already cancelled */}
        {data.status === "cancelled" && (
          <div className="text-sm text-muted-foreground">
            Votre abonnement est annulé.{" "}
            <Link href="/tarifs" className="text-primary hover:underline">
              Réabonnez-vous
            </Link>{" "}
            pour retrouver l&apos;accès complet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
