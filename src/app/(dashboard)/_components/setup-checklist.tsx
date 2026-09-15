"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  MessageCircle,
  PackageOpen,
  Phone,
  Radio,
  Tags,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StepperBullet } from "~/components/ui/stepper";
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
    href: "/parametres/prix",
    action: ui.setup.prices.action,
    helpSlug: "le-code",
  },
  catalogue: {
    icon: PackageOpen,
    title: ui.setup.catalogue.title,
    description: ui.setup.catalogue.description,
    href: "/dashboard/catalogue",
    action: ui.setup.catalogue.action,
    helpSlug: "creer-un-article",
  },
  delivery: {
    icon: Truck,
    title: ui.setup.delivery.title,
    description: ui.setup.delivery.description,
    href: "/parametres/livraison",
    action: ui.setup.delivery.action,
    helpSlug: "prix-et-livraison",
  },
  assistant: {
    icon: Bot,
    title: ui.setup.assistant.title,
    description: ui.setup.assistant.description,
    href: "/dashboard#assistant-control",
    action: ui.setup.assistant.action,
    helpSlug: "comment-ca-marche",
  },
  replies: {
    icon: MessageCircle,
    title: ui.setup.replies.title,
    description: ui.setup.replies.description,
    href: "/parametres/reponses",
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

/** Une prochaine action, un compteur, et le parcours complet à portée de main. */
export function SetupChecklist({ steps, doneCount, totalCount, compact = false }: SetupChecklistProps) {
  const currentIndex = steps.findIndex((step) => !step.done);
  const current = steps[currentIndex];
  if (!current) return null;
  const meta = STEP_META[current.id];
  return (
    <section aria-labelledby="setup-checklist-heading" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="setup-checklist-heading" className="text-base font-semibold">Mise en route</h2>
          <span className="text-sm tabular-nums text-muted-foreground" aria-label={ui.setup.progress(doneCount, totalCount)}>{doneCount}/{totalCount} étapes</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{meta.title}</h3>
            {!compact && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{meta.description}</p>}
          </div>
          <Link href={meta.href} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{meta.action}<ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        {current.id === "firstSale" && <Link href="/dashboard/catalogue" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"><PackageOpen className="size-4" aria-hidden="true" />{ui.setup.firstSale.actionCatalogue}</Link>}
      </div>
      <details className="group border-t border-border bg-surface/70">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 [&::-webkit-details-marker]:hidden">
          Toutes les étapes
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
        <Link href={`/aide/${meta.helpSlug}`} className="inline-flex min-h-11 items-center px-5 text-sm font-medium text-primary hover:underline">Comprendre cette étape</Link>
      </details>
    </section>
  );
}
