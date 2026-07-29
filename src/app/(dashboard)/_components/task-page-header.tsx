import type { ReactNode } from "react";

import { helpForRoute } from "~/lib/copy";
import { NAV_ITEMS } from "~/lib/navigation";
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

  const text = description ?? item.description;
  const topic = help === false ? undefined : helpForRoute(href);

  return (
    <header
      className={cn(
        "flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          {item.section}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {item.label}
        </h1>
        {text ? (
          <div className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground sm:text-base">
            {text}
          </div>
        ) : null}
        {topic ? (
          // Décalé de la largeur du padding du bouton, pour rester aligné sur le
          // titre plutôt que sur son libellé.
          <div className="-ml-2 mt-2">
            <HelpHint slug={topic.slug} />
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
