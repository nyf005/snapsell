"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { formatPriceFCFA } from "~/lib/subscription-plans";

interface Payment {
  id: string;
  type: string;
  plan: string | null;
  amount: number;
  currency: string;
  status: string;
  channel: string | null;
  cardLast4: string | null;
  overageDetails: unknown;
  createdAt: Date;
}

interface PaymentHistoryProps {
  data: Payment[];
  isLoading: boolean;
}

const statusLabel: Record<string, string> = {
  success: "Réussi",
  pending: "En attente",
  failed: "Échoué",
};

const typeLabel: Record<string, string> = {
  subscription: "Abonnement",
  overage: "Overage",
};

function StatusPill({ status }: { status: string }) {
  const label = statusLabel[status] ?? status;
  const isSuccess = status === "success";
  const isFailed = status === "failed";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isSuccess
          ? "bg-green-500/10 text-green-700 dark:text-green-400"
          : isFailed
            ? "bg-red-500/10 text-red-700 dark:text-red-400"
            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      }`}
    >
      {label}
    </span>
  );
}

export function PaymentHistory({ data, isLoading }: PaymentHistoryProps) {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
      aria-labelledby="history-title"
    >
      <h2 id="history-title" className="mb-5 font-semibold text-foreground">
        Historique des paiements
      </h2>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun paiement enregistré.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
          {data.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 first:rounded-t-xl last:rounded-b-xl sm:flex-nowrap"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {new Date(payment.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="text-sm font-medium capitalize text-foreground">
                  {typeLabel[payment.type] ?? payment.type}
                  {payment.plan && ` · ${payment.plan}`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums">
                  {formatPriceFCFA(payment.amount)}
                </span>
                <StatusPill status={payment.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
