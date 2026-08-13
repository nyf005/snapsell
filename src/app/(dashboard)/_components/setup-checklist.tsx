"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  MessageCircle,
  PackageOpen,
  Phone,
  Radio,
  Tags,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Stepper, StepperBullet } from "~/components/ui/stepper";
import type { StepperItem } from "~/components/ui/stepper";
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
  /** Résumé secondaire lorsque le travail quotidien occupe déjà la première place. */
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
 *
 * Le rail de pastilles donne la position dans le parcours sans en exposer le
 * contenu — six blocs ouverts d'emblée transformeraient le premier écran en
 * long formulaire d'installation. La vue d'ensemble reste disponible pour
 * comprendre le chemin et reprendre une étape antérieure, mais elle ne
 * concurrence jamais l'action du moment : titres et états seulement, aucune
 * seconde action principale.
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

  const stepperItems: StepperItem[] = steps.map((step, index) => ({
    id: step.id,
    label: STEP_META[step.id].title,
    state: step.done ? "done" : index === currentIndex ? "current" : "upcoming",
  }));

  if (compact) {
    return (
      <section
        aria-labelledby="setup-checklist-heading"
        className="overflow-hidden rounded-2xl border border-border bg-surface"
      >
        <div className="p-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Mise en route · {doneCount} sur {totalCount}
              </p>
              <h2
                id="setup-checklist-heading"
                className="mt-0.5 truncate text-sm font-semibold text-foreground"
              >
                {meta.title}
              </h2>
            </div>
            <Link
              href={meta.href}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Reprendre
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <Stepper
            items={stepperItems}
            label="Étapes de la mise en route"
            responsive
            className="mt-3"
          />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="setup-checklist-heading"
      className={cn(
        "overflow-hidden rounded-2xl border",
        "border-primary/20 bg-primary/5",
      )}
    >
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div>
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-[0.12em]",
                "text-primary",
              )}
            >
              Mise en route
            </p>
            <h2
              id="setup-checklist-heading"
              className="mt-1 text-lg font-bold text-foreground sm:text-xl"
            >
              {ui.setup.title}
            </h2>
          </div>
          {/* La phrase complète est portée par le rail, qui la lit une seule fois. */}
          <p
            className="text-sm font-medium tabular-nums text-muted-foreground"
            aria-hidden="true"
          >
            {doneCount} sur {totalCount}
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

        {/* Le chemin, sans son contenu : on voit où l'on est, pas tout ce qui reste à lire. */}
        <Stepper
          items={stepperItems}
          label="Étapes de la mise en route"
          responsive
          className="mt-4"
        />

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Prochaine action
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-lg font-bold text-foreground sm:text-xl"
              >
                {meta.title}
              </h3>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium",
                  // `text-warning-foreground` est fait pour un aplat `bg-warning`,
                  // pas pour un fond à 15 % : en thème sombre il devenait illisible.
                  current.required
                    ? "border-warning/40 bg-warning/10 text-foreground"
                    : "border-transparent bg-muted text-muted-foreground",
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
        {/* Vue synthétique : titre et état, rien d'autre. Le détail appartient à
            l'étape du moment, qui reste la seule à porter une action principale. */}
        <ol
          aria-label="Toutes les étapes de la mise en route"
          className="divide-y divide-border border-t border-border"
        >
          {steps.map((step, index) => {
            const stepMeta = STEP_META[step.id];
            const isCurrent = index === currentIndex;

            return (
              <li
                key={step.id}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-3 px-5 py-3 sm:px-6",
                  isCurrent && "bg-primary/5",
                )}
              >
                <StepperBullet
                  state={
                    step.done ? "done" : isCurrent ? "current" : "upcoming"
                  }
                  index={index + 1}
                />
                <p
                  className={cn(
                    "min-w-0 flex-1 text-sm font-medium",
                    step.done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {stepMeta.title}
                </p>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    isCurrent
                      ? "font-medium text-primary"
                      : "text-muted-foreground",
                    // Sur mobile, « Ouvrir » dit déjà qu'il reste à faire : le mot
                    // d'état prendrait la place du titre, qui serait tronqué.
                    !step.done && !isCurrent && "hidden sm:inline",
                  )}
                >
                  {step.done
                    ? "Terminée"
                    : isCurrent
                      ? "À faire en priorité"
                      : step.required
                        ? "À venir"
                        : "Recommandée"}
                </span>
                {!step.done && !isCurrent && (
                  <Link
                    href={stepMeta.href}
                    className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-primary hover:underline"
                  >
                    Ouvrir
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
