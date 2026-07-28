"use client";

import Link from "next/link";
import { ArrowRight, MessageCircleOff } from "lucide-react";

import { ui } from "~/lib/copy";
import { api } from "~/trpc/react";

/**
 * Bandeau affiché tant que WhatsApp n'est pas connecté.
 *
 * Blocage **souple** : la page reste entièrement utilisable. Préparer un catalogue
 * ou une grille de prix avant de connecter WhatsApp est un usage légitime — on
 * informe, on ne barre pas la route.
 *
 * Non masquable : c'est la seule chose qui explique pourquoi aucun message n'arrive.
 */
export function SetupRequiredBanner() {
  const { data } = api.onboarding.getStatus.useQuery();

  if (!data || data.whatsappConnected) return null;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <MessageCircleOff className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{ui.notConnected.title}</p>
          <p className="mt-0.5 max-w-[60ch] text-sm leading-5 text-muted-foreground">
            {ui.notConnected.detail}
          </p>
        </div>
      </div>
      <Link
        href="/parametres/whatsapp"
        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
      >
        {ui.notConnected.action}
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
