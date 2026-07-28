import type { ReactNode } from "react";

import { NAV_ITEMS } from "~/lib/navigation";
import { cn } from "~/lib/utils";

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
 */
type TaskPageHeaderProps = {
  /** Route de l'écran. Détermine section, titre et explication. */
  href: string;
  /** Remplace l'explication du menu, pour les écrans à texte variable. */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function TaskPageHeader({
  href,
  description,
  actions,
  className,
}: TaskPageHeaderProps) {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item) {
    throw new Error(
      `TaskPageHeader : « ${href} » n'est pas déclarée dans NAV_ITEMS.`,
    );
  }

  const text = description ?? item.description;

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
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
