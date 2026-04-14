"use client";

import { CreditCard, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { api } from "~/trpc/react";

export function CreditsAlert() {
  const { data, isLoading } = api.subscription.getCreditsUsage.useQuery(undefined, {
    staleTime: 60_000, // 1 minute
  });

  if (isLoading || !data) return null;

  if (!data.isLowCredits) return null;

  return (
    <Link
      href="/parametres/abonnement"
      className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300"
    >
      <CreditCard className="size-3.5" />
      <span className="hidden sm:inline">
        {data.balance} credits restants
      </span>
      <AlertTriangle className="size-3.5 sm:hidden" />
    </Link>
  );
}