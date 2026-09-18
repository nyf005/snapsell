import Link from "next/link";
import type { ReactNode } from "react";

import { helpForRoute } from "~/lib/copy";
import { NAV_ITEMS, primaryHrefFor } from "~/lib/navigation";
import { cn } from "~/lib/utils";

import { HelpHint } from "./help-hint";

/**
 * En-tête d'un écran : section, titre, explication.
 *
 * ── SOURCE UNIQUE ───────────────────────────────────────────────────────────
 * Passez `href` : la section, le titre et l'explication viennent de `NAV_ITEMS`.
 *
 * Les trois étaient réécrits à la main dans chaque page, et les trois avaient
 * divergé du menu :
 *   • le menu disait « Prix », la page « Prix et paramètres » — un reste de
 *     l'époque où cette page servait aussi d'index des réglages ;
 *   • les sections inventaient des suffixes (« Gérer · Vente », « Gérer ·
 *     Communication ») alors que DESIGN.md n'en déclare que quatre ;
 *   • les explications se contredisaient d'une surface à l'autre.
 *
 * `description` reste surchargeable pour les écrans dont l'explication dépend de
 * l'état (le live selon qu'une diffusion est en cours, le catalogue selon le
 * nombre d'articles chargés).
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── L'AIDE CONTEXTUELLE PASSE PAR ICI ───────────────────────────────────────
 * Puisque cet en-tête est la source unique et qu'il connaît déjà `href`, il demande
 * son article à `helpForRoute()`. Un écran gagne donc son « Comment ça marche ? »
 * en déclarant `route` dans `src/lib/copy/help.ts`, sans toucher à sa page.
 * ────────────────────────────────────────────────────────────────────────────
 */
type TaskPageHeaderProps = {
  /** Route de l'écran. Détermine section, titre et explication. */
  href: string;
  /** Remplace l'explication du menu, pour les écrans à texte variable. */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** `false` retire le bouton d'aide d'un écran qui n'en veut pas. */
  help?: false;
};

export function TaskPageHeader({
  href,
  description,
  actions,
  className,
  help,
}: TaskPageHeaderProps) {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item) {
    throw new Error(
      `TaskPageHeader : « ${href} » n'est pas déclarée dans NAV_ITEMS.`,
    );
  }

  const parent = NAV_ITEMS.find((entry) => entry.href === primaryHrefFor(href));
  const text = description ?? item.description;
  const topic = help === false ? undefined : helpForRoute(href);

  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {parent && parent.href !== href && <Link href={parent.href} className="mb-1 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-primary">← Retour à {parent.label}</Link>}
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {item.label}
        </h1>
        {topic && <HelpHint compact slug={topic.slug} />}
        </div>
        {text ? (
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            {text}
          </div>
        ) : null}

      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
