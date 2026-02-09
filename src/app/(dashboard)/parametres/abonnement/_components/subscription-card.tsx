"use client";

import {
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { formatPriceFCFA } from "~/lib/subscription-plans";

const statusConfig = {
  active: {
    label: "Actif",
    variant: "default" as const,
    icon: CheckCircle2,
    className: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  attention: {
    label: "Attention",
    variant: "destructive" as const,
    icon: AlertTriangle,
    className: "bg-red-500/10 text-red-600 border-red-500/20",
  },
  non_renewing: {
    label: "Non renouvellement",
    variant: "secondary" as const,
    icon: Clock,
    className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  },
  expired: {
    label: "Expiré",
    variant: "destructive" as const,
    icon: XCircle,
    className: "bg-red-500/10 text-red-600 border-red-500/20",
  },
  cancelled: {
    label: "Annulé",
    variant: "secondary" as const,
    icon: XCircle,
    className: "bg-muted text-muted-foreground",
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
  const config =
    statusConfig[data.status as keyof typeof statusConfig] ?? statusConfig.active;
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
            <CreditCard className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Plan {data.planName}</h2>
            <p className="text-sm text-muted-foreground">
              {data.planPrice === 0
                ? "Gratuit"
                : `${formatPriceFCFA(data.planPrice)} / mois`}
            </p>
          </div>
        </div>
        <Badge className={config.className}>
          <StatusIcon className="mr-1 size-3" />
          {config.label}
        </Badge>
      </CardHeader>
      <CardContent>
        {/* Bandeaux conditionnels */}
        {data.status === "attention" && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-500" />
              <span className="font-medium text-red-600">
                Échec du paiement
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Le dernier paiement a échoué. Mettez à jour votre carte pour
              maintenir votre abonnement.
            </p>
          </div>
        )}

        {data.status === "non_renewing" && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-amber-500" />
              <span className="font-medium text-amber-600">
                Annulation programmée
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Votre abonnement ne sera pas renouvelé. Accès maintenu jusqu&apos;au{" "}
              {data.expiresAt
                ? new Date(data.expiresAt).toLocaleDateString("fr-FR")
                : "fin de période"}
              .
            </p>
          </div>
        )}

        {data.plan === "free" && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="text-muted-foreground">
              Vous êtes sur le plan gratuit. Passez au plan Starter ou Pro pour
              débloquer plus de commandes, d&apos;agents et de fonctionnalités.
            </p>
          </div>
        )}

        {/* Infos supplémentaires */}
        <div className="grid gap-4 sm:grid-cols-2">
          {data.expiresAt && (
            <div>
              <p className="text-xs text-muted-foreground">
                Prochaine échéance
              </p>
              <p className="font-medium">
                {new Date(data.expiresAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
          {data.cycleStartedAt && (
            <div>
              <p className="text-xs text-muted-foreground">Début du cycle</p>
              <p className="font-medium">
                {new Date(data.cycleStartedAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
