"use client";

import { useState } from "react";
import { CreditCard, Activity, Clock, AlertTriangle, Plus, Minus, ShoppingCart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { formatXofUnits } from "~/lib/copy";

interface CreditsUsageData {
  balance: number;
  totalMonthly: number;
  bonus: number;
  used: number;
  usagePercent: number;
  activeWindows: number;
  sessionsThisMonth: number;
  resetDate: Date | null;
  isLowCredits: boolean;
  plan: string;
  creditPackPriceFCFA: number | null;
}

function CreditsBar({ used, total }: { used: number; total: number }) {
  const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <CreditCard className="size-3.5" />
          Utilisés (mensuel)
        </span>
        <span className="font-medium tabular-nums text-foreground">
          {used} / {total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
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
    </div>
  );
}

export function CreditsUsageDashboard({ data }: { data: CreditsUsageData }) {
  const [packs, setPacks] = useState(1);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const buyCredits = api.subscription.initBuyCredits.useMutation({
    onSuccess: (result) => {
      window.location.href = result.authorizationUrl;
    },
    onSettled: () => setIsPurchasing(false),
  });

  const formatDate = (date: Date | null) => {
    if (!date) return "Non défini";
    return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const packPrice = data.creditPackPriceFCFA;
  const totalPrice = packPrice !== null ? packs * packPrice : null;

  const handleBuy = () => {
    setIsPurchasing(true);
    buyCredits.mutate({ packs });
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Usage des crédits</CardTitle>
          {data.isLowCredits && (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3" />
              Faible
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <CreditsBar used={data.used} total={data.totalMonthly} />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">Restants</p>
              <p className="font-semibold">{data.balance}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">Ce mois-ci</p>
              <p className="font-semibold">{data.sessionsThisMonth}</p>
            </div>
          </div>
        </div>

        {data.bonus > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Crédits bonus</span>
            <span className="font-semibold text-primary">+{data.bonus}</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>Renouvellement le <span className="font-medium">{formatDate(data.resetDate)}</span></span>
        </div>

        {/* Achat de crédits supplémentaires */}
        {packPrice !== null && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-foreground">
              Crédits supplémentaires — {formatXofUnits(packPrice)} / 100
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setPacks((p) => Math.max(1, p - 1))}
                disabled={packs <= 1}
              >
                <Minus className="size-3.5" />
              </Button>
              <div className="flex-1 text-center text-sm font-medium tabular-nums">
                {packs * 100} crédits
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setPacks((p) => Math.min(10, p + 1))}
                disabled={packs >= 10}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <Button
              className="w-full gap-2"
              size="sm"
              onClick={handleBuy}
              disabled={isPurchasing || buyCredits.isPending}
            >
              <ShoppingCart className="size-4" />
              {isPurchasing || buyCredits.isPending
                ? "Redirection…"
                : `Acheter — ${totalPrice !== null ? formatXofUnits(totalPrice) : "—"}`}
            </Button>
          </div>
        )}

        {data.plan === "free" && data.usagePercent >= 80 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              Crédits bientôt épuisés — achetez un pack ou passez à Starter
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
