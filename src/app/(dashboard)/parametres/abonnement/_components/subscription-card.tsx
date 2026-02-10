"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  X,
  Zap,
} from "lucide-react";
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
import { formatPriceFCFA } from "~/lib/subscription-plans";

const statusConfig = {
  active: {
    label: "Actif",
    icon: CheckCircle2,
    className: "text-green-600",
    pill: "bg-green-500/10 text-green-700",
  },
  attention: {
    label: "Attention",
    icon: AlertTriangle,
    className: "text-amber-600",
    pill: "bg-amber-500/10 text-amber-700",
  },
  non_renewing: {
    label: "Non renouvelé",
    icon: Clock,
    className: "text-amber-600",
    pill: "bg-amber-500/10 text-amber-700",
  },
  expired: {
    label: "Expiré",
    icon: XCircle,
    className: "text-red-600",
    pill: "bg-red-500/10 text-red-700",
  },
  cancelled: {
    label: "Annulé",
    icon: XCircle,
    className: "text-muted-foreground",
    pill: "bg-muted text-muted-foreground",
  },
};

interface SubscriptionCardProps {
  data: {
    plan: string;
    planName: string;
    planPrice: number;
    status: string;
    expiresAt: Date | null;
    cycleStartedAt: Date | null;
    hasPaystackSubscription: boolean;
  };
}

export function SubscriptionCard({ data }: SubscriptionCardProps) {
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

  const config =
    statusConfig[data.status as keyof typeof statusConfig] ?? statusConfig.active;
  const StatusIcon = config.icon;
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
      aria-labelledby="plan-title"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
              <CreditCard className="size-5 text-primary" />
            </div>
            <div>
              <h2 id="plan-title" className="font-semibold text-foreground">
                Plan {data.planName}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.planPrice === 0
                  ? "Gratuit"
                  : `${formatPriceFCFA(data.planPrice)} / mois`}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.pill}`}
          >
            <StatusIcon className="size-3.5" />
            {config.label}
          </span>
        </div>

        {/* Messages conditionnels — compacts */}
        {data.status === "attention" && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Échec du dernier paiement
            </p>
            <p className="mt-0.5 text-amber-700/80 dark:text-amber-300/80">
              Mettez à jour votre carte pour maintenir l&apos;abonnement.
            </p>
          </div>
        )}

        {data.status === "non_renewing" && data.expiresAt && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
            <p className="text-amber-800 dark:text-amber-200">
              Accès jusqu&apos;au{" "}
              {new Date(data.expiresAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        )}

        {data.plan === "free" && (
          <p className="text-sm text-muted-foreground">
            Passez à Starter ou Pro pour plus de commandes, d&apos;agents et de
            fonctionnalités.
          </p>
        )}

        {/* Dates — une ligne discrète */}
        {(data.expiresAt || data.cycleStartedAt) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            {data.expiresAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Prochaine échéance :{" "}
                {new Date(data.expiresAt).toLocaleDateString("fr-FR")}
              </span>
            )}
            {data.cycleStartedAt && (
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Cycle depuis le{" "}
                {new Date(data.cycleStartedAt).toLocaleDateString("fr-FR")}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
          {isFree && (
            <>
              <Button asChild size="sm">
                <Link href="/api/payment/subscribe?plan=starter">
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
              <Link href="/api/payment/subscribe?plan=pro">
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
      </div>
    </section>
  );
}
