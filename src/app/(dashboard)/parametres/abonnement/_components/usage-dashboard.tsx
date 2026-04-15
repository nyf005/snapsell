"use client";

import { CheckCircle2, FileCheck, Users, CalendarDays, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface UsageDashboardProps {
  data: {
    confirmedOrders: number;
    proofs: number;
    agents: number;
    maxAgents: number;
    cycleStart: Date;
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
  icon: typeof CheckCircle2;
}) {
  const isUnlimited = max === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="font-medium tabular-nums text-foreground">
          {current}
          {!isUnlimited && (
            <span className="font-normal text-muted-foreground"> / {max}</span>
          )}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
          <div
            className={`h-full rounded-full transition-all ${
              isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-primary"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CycleDates({ cycleStart }: { cycleStart: Date }) {
  const start = new Date(cycleStart);
  const cycleEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((cycleEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const fmt = (d: Date) =>
    d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <CalendarDays className="size-3.5" />
        Cycle {fmt(start)} → {fmt(cycleEnd)}
      </span>
      <span className="font-medium tabular-nums text-foreground">
        {daysRemaining}j restants
      </span>
    </div>
  );
}

export function UsageDashboard({ data }: UsageDashboardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Usage ce cycle</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CycleDates cycleStart={data.cycleStart} />

        <div className="space-y-3">
          <UsageBar
            current={data.confirmedOrders}
            max={-1}
            label="Commandes"
            icon={CheckCircle2}
          />
          <UsageBar
            current={data.proofs}
            max={-1}
            label="Preuves de paiement"
            icon={FileCheck}
          />
          <UsageBar
            current={data.agents}
            max={data.maxAgents}
            label="Agents"
            icon={Users}
          />
        </div>

        {data.agents >= data.maxAgents && data.maxAgents > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-medium text-red-800 dark:text-red-200">
              <AlertTriangle className="size-3.5 shrink-0" />
              Limite agents atteinte — passez au plan Starter
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
