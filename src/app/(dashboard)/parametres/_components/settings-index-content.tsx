"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { TaskPageHeader } from "~/app/(dashboard)/_components/task-page-header";
import { settingsItems } from "~/lib/navigation";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

/**
 * Index des paramètres.
 *
 * Il n'existait pas : `/parametres` *était* la grille de prix, et le seul sommaire
 * était un accordéon replié à l'intérieur de cette page. Les six autres pages de
 * paramètres n'avaient aucune navigation frère.
 *
 * Chaque section affiche son état réel, tiré de `onboarding.getStatus` : la vendeuse
 * voit d'un coup d'œil ce qui reste à configurer.
 */
export function SettingsIndexContent() {
  const { data: setup } = api.onboarding.getStatus.useQuery();

  /** État de configuration par route, dérivé des étapes de mise en route. */
  const doneByHref: Record<string, boolean | undefined> = {
    "/parametres/whatsapp": setup?.steps.find((s) => s.id === "whatsapp")?.done,
    "/parametres/prix": setup?.steps.find((s) => s.id === "prices")?.done,
    "/parametres/livraison": setup?.steps.find((s) => s.id === "delivery")?.done,
    "/parametres/reponses": setup?.steps.find((s) => s.id === "replies")?.done,
  };

  return (
    <>
      <DashboardHeader />
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
        <div className="space-y-6 p-4 md:p-8">
          <TaskPageHeader
            href="/parametres"
          />

          <ul className="grid gap-3 sm:grid-cols-2">
            {settingsItems().map((item) => {
              const Icon = item.icon;
              const done = doneByHref[item.href];

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex h-full min-h-24 items-start gap-4 rounded-xl border border-border bg-surface p-4",
                      "transition-colors hover:border-primary/40 hover:bg-muted/50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{item.label}</span>
                        {done === true && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Check className="size-3" />
                            Configuré
                          </span>
                        )}
                        {done === false && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            À configurer
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <ArrowRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </>
  );
}
