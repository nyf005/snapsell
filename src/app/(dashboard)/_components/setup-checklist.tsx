"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDashed,
  MessageCircle,
  PackageOpen,
  Phone,
  Radio,
  Tags,
  Truck,
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
  /** Style plus discret une fois WhatsApp connecté, sans changer le parcours. */
  compact?: boolean;
};

/**
 * Métadonnées d'affichage de chaque étape. L'état, lui, reste entièrement dérivé
 * côté serveur dans `src/server/api/routers/onboarding.ts`.
 */
export const STEP_META: Record<
  SetupStepId,
  {
    icon: LucideIcon;
    title: string;
    description: string;
    href: string;
    action: string;
    helpSlug: string;
  }
> = {
  whatsapp: {
    icon: MessageCircle,
    title: ui.setup.whatsapp.title,
    description: ui.setup.whatsapp.description,
    href: "/parametres/whatsapp",
    action: ui.setup.whatsapp.action,
    helpSlug: "connecter-whatsapp",
  },
  prices: {
    icon: Tags,
    title: ui.setup.prices.title,
    description: ui.setup.prices.description,
    href: "/parametres",
    action: ui.setup.prices.action,
    helpSlug: "le-code",
  },
  delivery: {
    icon: Truck,
    title: ui.setup.delivery.title,
    description: ui.setup.delivery.description,
    href: "/parametres/livraison",
    action: ui.setup.delivery.action,
    helpSlug: "prix-et-livraison",
  },
  replies: {
    icon: MessageCircle,
    title: ui.setup.replies.title,
    description: ui.setup.replies.description,
    href: "/parametres/faq",
    action: ui.setup.replies.action,
    helpSlug: "reponses-automatiques",
  },
  sellerPhone: {
    icon: Phone,
    title: ui.setup.sellerPhone.title,
    description: ui.setup.sellerPhone.description,
    href: "/parametres/whatsapp",
    action: ui.setup.sellerPhone.action,
    helpSlug: "mes-messages-creent-des-reservations",
  },
  firstSale: {
    icon: Radio,
    title: ui.setup.firstSale.title,
    description: ui.setup.firstSale.description,
    href: "/dashboard/live",
    action: ui.setup.firstSale.actionLive,
    helpSlug: "comment-ca-marche",
  },
};

/**
 * Mise en route progressive : une seule prochaine action est mise en avant.
 * La vue d'ensemble reste disponible pour comprendre le chemin et reprendre une
 * étape antérieure, mais elle ne concurrence jamais l'action du moment.
 */
export function SetupChecklist({
  steps,
  doneCount,
  totalCount,
  compact = false,
}: SetupChecklistProps) {
  const currentIndex = steps.findIndex((step) => !step.done);
  const current = currentIndex >= 0 ? steps[currentIndex] : null;
  const progressPercent =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  if (!current) return null;

  const meta = STEP_META[current.id];
  const Icon = meta.icon;

  return (
    <section
      aria-labelledby="setup-checklist-heading"
      className={cn(
        "overflow-hidden rounded-2xl border",
        compact
          ? "border-border bg-surface"
          : "border-primary/20 bg-primary/5",
      )}
    >
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Mise en route
            </p>
            <h2
              id="setup-checklist-heading"
              className="mt-1 text-lg font-bold text-foreground sm:text-xl"
            >
              {ui.setup.title}
            </h2>
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {ui.setup.progress(doneCount, totalCount)}
          </p>
        </div>

        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label={ui.setup.progress(doneCount, totalCount)}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Étape {currentIndex + 1} sur {totalCount}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-lg font-bold text-foreground sm:text-xl"
              >
                {meta.title}
              </h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  current.required
                    ? "bg-warning/15 text-warning-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {current.required ? "Nécessaire" : "Recommandé"}
              </span>
            </div>
            <p className="mt-1.5 max-w-[60ch] text-sm leading-6 text-muted-foreground">
              {meta.description}
            </p>
            <Link
              href={`/aide/${meta.helpSlug}`}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              Comprendre cette étape
            </Link>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
            <Link
              href={meta.href}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
            >
              {meta.action}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            {current.id === "firstSale" && (
              <Link
                href="/dashboard/catalogue"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <PackageOpen className="size-4" aria-hidden="true" />
                {ui.setup.firstSale.actionCatalogue}
              </Link>
            )}
          </div>
        </div>
      </div>

      <details className="group border-t border-border bg-surface/70">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 [&::-webkit-details-marker]:hidden">
          Voir toutes les étapes
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <ol className="divide-y divide-border border-t border-border">
          {steps.map((step, index) => {
            const stepMeta = STEP_META[step.id];
            const isCurrent = index === currentIndex;

            return (
              <li
                key={step.id}
                className={cn(
                  "flex min-h-14 items-center gap-3 px-5 py-3 sm:px-6",
                  isCurrent && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                    step.done
                      ? "bg-success/15 text-success"
                      : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {step.done ? <Check className="size-3.5" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      step.done ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {stepMeta.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step.done
                      ? "Terminée"
                      : isCurrent
                        ? "À faire en priorité"
                        : step.required
                          ? "À venir"
                          : "Recommandée"}
                  </p>
                </div>
                {!step.done && !isCurrent && (
                  <Link
                    href={stepMeta.href}
                    className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary hover:underline"
                  >
                    Ouvrir
                  </Link>
                )}
                {!step.done && isCurrent && (
                  <CircleDashed className="size-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
