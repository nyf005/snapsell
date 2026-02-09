"use client";

import {
  ShoppingCart,
  CheckCircle2,
  Users,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { formatPriceFCFA } from "~/lib/subscription-plans";

interface UsageDashboardProps {
  data: {
    confirmedOrders: number;
    maxConfirmedOrders: number;
    proofs: number;
    maxProofs: number;
    agents: number;
    maxAgents: number;
    overageCount: number;
    overageAmountFCFA: number;
    plan: string;
  };
}

function UsageBar({
  current,
  max,
  label,
  icon: Icon,
}: {
  current: number;
  max: number;
  label: string;
  icon: typeof ShoppingCart;
}) {
  const isUnlimited = max === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-muted-foreground" />
          {label}
        </div>
        <span className="text-sm text-muted-foreground">
          {current} / {isUnlimited ? "∞" : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              isAtLimit
                ? "bg-red-500"
                : isNearLimit
                  ? "bg-amber-500"
                  : "bg-primary"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="h-2 rounded-full bg-green-500/20" />
      )}
    </div>
  );
}

export function UsageDashboard({ data }: UsageDashboardProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-bold">Usage ce cycle</h2>
      </CardHeader>
      <CardContent className="space-y-6">
        <UsageBar
          current={data.confirmedOrders}
          max={data.maxConfirmedOrders}
          label="Commandes confirmées"
          icon={ShoppingCart}
        />
        <UsageBar
          current={data.proofs}
          max={data.maxProofs}
          label="Preuves traitées"
          icon={CheckCircle2}
        />
        <UsageBar
          current={data.agents}
          max={data.maxAgents}
          label="Agents utilisés"
          icon={Users}
        />

        {/* Overage banner */}
        {data.overageCount > 0 && data.overageAmountFCFA > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              <span className="font-medium text-amber-600">
                Overage accumulé
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              {data.overageCount} commandes au-delà du quota ·{" "}
              <strong>{formatPriceFCFA(data.overageAmountFCFA)}</strong>{" "}
              seront facturées en fin de cycle.
            </p>
          </div>
        )}

        {/* Free plan quota reached */}
        {data.plan === "free" &&
          data.confirmedOrders >= data.maxConfirmedOrders && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-500" />
                <span className="font-medium text-red-600">
                  Limite atteinte
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Vous avez atteint votre quota de commandes gratuites. Passez au
                plan Starter pour continuer à confirmer des commandes.
              </p>
            </div>
          )}
      </CardContent>
    </Card>
  );
}
