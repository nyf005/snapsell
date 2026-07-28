"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleDashed,
  MessageCircle,
  PackageOpen,
  Radio,
  Tags,
  Truck,
  Phone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ui } from "~/lib/copy";
import { cn } from "~/lib/utils";
import type { SetupStepId } from "~/server/api/routers/onboarding.schema";

type Step = {
  id: SetupStepId;
  done: boolean;
  required: boolean;
};

export type SetupChecklistProps = {
  steps: Step[];
  doneCount: number;
  totalCount: number;
  /** Affichage réduit à une barre de progression, une fois WhatsApp connecté. */
  compact?: boolean;
};

const STEP_META: Record<
  SetupStepId,
  { icon: LucideIcon; title: string; description: string; href: string; action: string }
> = {
  whatsapp: {
    icon: MessageCircle,
    title: ui.setup.whatsapp.title,
    description: ui.setup.whatsapp.description,
    href: "/parametres/whatsapp",
    action: ui.setup.whatsapp.action,
  },
  prices: {
    icon: Tags,
    title: ui.setup.prices.title,
    description: ui.setup.prices.description,
    href: "/parametres",
    action: ui.setup.prices.action,
  },
  delivery: {
    icon: Truck,
    title: ui.setup.delivery.title,
    description: ui.setup.delivery.description,
    href: "/parametres/livraison",
    action: ui.setup.delivery.action,
  },
  replies: {
    icon: MessageCircle,
    title: ui.setup.replies.title,
    description: ui.setup.replies.description,
    href: "/parametres/faq",
    action: ui.setup.replies.action,
  },
  sellerPhone: {
    icon: Phone,
    title: ui.setup.sellerPhone.title,
    description: ui.setup.sellerPhone.description,
    href: "/parametres/whatsapp",
    action: ui.setup.sellerPhone.action,
  },
  firstSale: {
    icon: Radio,
    title: ui.setup.firstSale.title,
    description: ui.setup.firstSale.description,
    href: "/dashboard/live",
    action: ui.setup.firstSale.actionLive,
  },
};

/**
 * Parcours de mise en route, entièrement dérivé de l'état réel de la boutique.
 *
 * Il n'y a délibérément pas de bouton « masquer » : la checklist s'efface d'elle-même
 * quand tout est fait. Voir src/server/api/routers/onboarding.ts.
 */
export function SetupChecklist({
  steps,
  doneCount,
  totalCount,
  compact = false,
}: SetupChecklistProps) {
  const remaining = steps.filter((s) => !s.done);
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  if (remaining.length === 0) return null;

  // Une fois l'essentiel branché, on ne garde qu'une bande de progression discrète.
  if (compact) {
    const next = remaining[0];
    const meta = next ? STEP_META[next.id] : null;
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {ui.setup.progress(doneCount, totalCount)}
          </p>
          {meta && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              Prochaine étape : {meta.title}
            </p>
          )}
          <div
            className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
            aria-label={ui.setup.progress(doneCount, totalCount)}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {meta && (
          <Link
            href={meta.href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted"
          >
            {meta.action}
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="setup-checklist-heading"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-primary/5"
    >
      <div className="border-b border-primary/20 px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          {ui.setup.progress(doneCount, totalCount)}
        </p>
        <h2 id="setup-checklist-heading" className="mt-1 text-lg font-bold text-foreground">
          {ui.setup.title}
        </h2>
        <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">
          {ui.setup.subtitle}
        </p>
      </div>

      <ol className="divide-y divide-border">
        {steps.map((step) => {
          const meta = STEP_META[step.id];
          const Icon = meta.icon;

          return (
            <li key={step.id}>
              <div
                className={cn(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5",
                  step.done && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    step.done
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {step.done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={cn(
                        "font-semibold text-foreground",
                        step.done && "line-through decoration-1",
                      )}
                    >
                      {meta.title}
                    </h3>
                    {step.done ? (
                      <span className="text-xs font-medium text-primary">Terminé</span>
                    ) : step.required ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Nécessaire
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CircleDashed className="size-3" />
                        Optionnel
                      </span>
                    )}
                  </div>
                  {!step.done && (
                    <p className="mt-1 max-w-[60ch] text-sm leading-5 text-muted-foreground">
                      {meta.description}
                    </p>
                  )}
                </div>

                {!step.done && (
                  <Link
                    href={meta.href}
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
                  >
                    {meta.action}
                    <ArrowRight className="size-4" />
                  </Link>
                )}
              </div>

              {/* Le catalogue est une alternative légitime au live pour démarrer. */}
              {step.id === "firstSale" && !step.done && (
                <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <Link
                    href="/dashboard/catalogue"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    <PackageOpen className="size-4" />
                    {ui.setup.firstSale.actionCatalogue}
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
