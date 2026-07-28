"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

import { formatXof } from "~/lib/copy";
import { resolveCategoryFromCategories } from "~/lib/pricing/resolve-category";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

type CodePricePreviewProps = {
  /** Code en cours de saisie. */
  code: string;
  /** Masque l'aperçu quand la vendeuse a saisi un prix manuel. */
  disabled?: boolean;
  className?: string;
};

/**
 * Montre, pendant la frappe, quel prix sera annoncé pour ce code.
 *
 * La règle code→prix est le mécanisme central du produit et n'était expliquée
 * nulle part — pire, l'interface affirmait « la première lettre du code », alors
 * que la résolution se fait sur le **plus long préfixe** (voir
 * src/lib/pricing/resolve-category.ts). Montrer la résolution vaut mieux que la décrire.
 */
export function CodePricePreview({ code, disabled, className }: CodePricePreviewProps) {
  // `catalogue.getCategoryLabels` et non `settings.getCategoryPrices` : cette
  // dernière est réservée aux managers, alors qu'un VENDEUR peut créer un article.
  const { data: categories, isLoading } = api.catalogue.getCategoryLabels.useQuery(undefined, {
    staleTime: 60_000,
  });

  const trimmed = code.trim();
  if (disabled || trimmed.length === 0 || isLoading || !categories) return null;

  const base = "mt-1.5 flex items-start gap-2 text-xs leading-5";

  if (categories.length === 0) {
    return (
      <p className={cn(base, "text-muted-foreground", className)}>
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Vous n’avez pas encore de catégorie de prix.{" "}
          <Link href="/parametres" className="font-semibold text-primary hover:underline">
            En créer une
          </Link>
        </span>
      </p>
    );
  }

  const matched = resolveCategoryFromCategories(
    categories.map((c) => c.categoryLetter),
    trimmed,
  );

  if (!matched) {
    return (
      <p className={cn(base, "text-muted-foreground", className)}>
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>
          Aucune catégorie ne correspond au début de «&nbsp;{trimmed}&nbsp;». Vos catégories :{" "}
          <span className="font-semibold text-foreground">
            {categories.map((c) => c.categoryLetter).join(", ")}
          </span>
          .{" "}
          <Link href="/parametres" className="font-semibold text-primary hover:underline">
            Ajouter une catégorie
            <ArrowRight className="ml-0.5 inline size-3" />
          </Link>
        </span>
      </p>
    );
  }

  const category = categories.find((c) => c.categoryLetter === matched);

  return (
    <p className={cn(base, "text-muted-foreground", className)}>
      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span>
        <span className="font-semibold text-foreground">{trimmed.toUpperCase()}</span>
        {" → catégorie "}
        <span className="font-semibold text-foreground">{matched}</span>
        {" → "}
        <span className="font-semibold text-foreground">{formatXof(category?.amount ?? null)}</span>
        {category?.description ? ` (${category.description})` : null}
      </span>
    </p>
  );
}
