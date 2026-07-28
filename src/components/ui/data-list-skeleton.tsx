"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/**
 * Squelette de chargement aligné sur `DataList`.
 *
 * Les squelettes dessinaient un tableau alors que le contenu réel s'affiche en
 * cartes sous `md` : sur téléphone, l'écran passait d'une grille à une pile de
 * cartes au moment où les données arrivaient. Ici les deux compositions suivent
 * exactement celles de `DataList`.
 */
export function DataListSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn(className)} aria-hidden="true">
      {/* Desktop — grille de tableau. */}
      <div className="hidden md:block">
        <div className="border-b border-border bg-muted/60 px-6 py-4">
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-24" variant="text" />
            ))}
          </div>
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="border-b border-border px-6 py-4 last:border-0">
            <div
              className="grid items-center gap-4"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }).map((_, c) => (
                <Skeleton key={c} className="h-5 w-full max-w-32" variant="text" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile — cartes empilées, comme le rendu réel. */}
      <div className="divide-y divide-border md:hidden">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-28" variant="text" />
              <Skeleton className="h-5 w-20" variant="text" />
            </div>
            <Skeleton className="h-4 w-40" variant="text" />
            <Skeleton className="h-4 w-32" variant="text" />
          </div>
        ))}
      </div>
    </div>
  );
}
