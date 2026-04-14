"use client";

import { CreditCard, Activity, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface CreditsUsageData {
  balance: number;
  totalMonthly: number;
  used: number;
  usagePercent: number;
  activeWindows: number;
  sessionsThisMonth: number;
  resetDate: Date | null;
  isLowCredits: boolean;
  plan: string;
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
          Utilisés
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
  const formatDate = (date: Date | null) => {
    if (!date) return "Non défini";
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
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

        <div className="grid grid-cols-2 gap-4">
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
              <p className="truncate text-xs text-muted-foreground">Sessions</p>
              <p className="font-semibold">{data.sessionsThisMonth}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          <span>
            Reset le <span className="font-medium">{formatDate(data.resetDate)}</span>
          </span>
        </div>

        {data.plan === "free" && data.usagePercent >= 80 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
              <AlertTriangle className="size-4 shrink-0" />
              Credits bientôt épuisés — passez à Starter pour plus de sessions
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}