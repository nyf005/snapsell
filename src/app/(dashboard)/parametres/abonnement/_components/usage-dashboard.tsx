"use client";

import {
  CreditCard,
  CheckCircle2,
  Users,
  AlertTriangle,
} from "lucide-react";
import { formatPriceFCFA } from "~/lib/subscription-plans";

interface UsageDashboardProps {
  data: {
    balance: number;
    totalMonthly: number;
    used: number;
    confirmedOrders: number;
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
  icon: typeof CreditCard;
}) {
  const isUnlimited = max === -1;
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;
  const isAtLimit = !isUnlimited && percentage >= 100;

  if (isUnlimited) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="font-medium tabular-nums text-foreground">{current}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </span>
        <span className="font-medium tabular-nums text-foreground">
          {current}
          <span className="font-normal text-muted-foreground"> / {max}</span>
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

export function UsageDashboard({ data }: UsageDashboardProps) {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
      aria-labelledby="usage-title"
    >
      <h2 id="usage-title" className="mb-5 font-semibold text-foreground">
        Usage ce cycle
      </h2>
      <div className="space-y-5">
        <UsageBar
          current={data.confirmedOrders}
          max={-1}
          label="Commandes"
          icon={CheckCircle2}
        />
        <UsageBar
          current={data.used}
          max={data.totalMonthly}
          label="Crédits utilisés"
          icon={CreditCard}
        />
        <UsageBar
          current={data.agents}
          max={data.maxAgents}
          label="Agents"
          icon={Users}
        />
      </div>

      {data.overageCount > 0 && data.overageAmountFCFA > 0 && (
        <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0" />
            Overage : {data.overageCount} crédits ·{" "}
            {formatPriceFCFA(data.overageAmountFCFA)} en fin de cycle
          </p>
        </div>
      )}

      {data.plan === "free" &&
        data.used >= data.totalMonthly && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-red-800 dark:text-red-200">
              <AlertTriangle className="size-4 shrink-0" />
              Quota atteint — passez au plan Starter pour continuer
            </p>
          </div>
        )}
    </section>
  );
}
