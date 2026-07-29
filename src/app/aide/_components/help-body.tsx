import Link from "next/link";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";

import type { HelpBlock } from "~/lib/copy";
import { cn } from "~/lib/utils";

/**
 * Rendu d'un article d'aide.
 *
 * Un seul rendu pour les deux surfaces : la page publique `/aide` et le panneau
 * contextuel ouvert depuis un écran de tâche (`help-hint.tsx`). Ce composant n'a
 * volontairement aucune dépendance serveur, pour pouvoir vivre dans les deux.
 *
 * ── LES TABLEAUX NE SONT PAS DES `<table>` ──────────────────────────────────
 * Un tableau de deux colonnes dans un article se lit à 375 px de large. Une
 * `<table>` y impose un défilement horizontal, ce que DESIGN.md § Tables interdit
 * pour le contenu essentiel. On rend donc une `<dl>` : empilée sur mobile — le
 * terme au-dessus de son explication — et en deux colonnes dès `sm`, avec une
 * ligne d'en-tête qui n'apparaît qu'à ce moment-là. Un seul DOM, aucun
 * défilement, et la sémantique reste juste.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function HelpBody({
  blocks,
  className,
}: {
  blocks: readonly HelpBlock[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {blocks.map((block, i) => (
        <HelpBlockView key={i} block={block} />
      ))}
    </div>
  );
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case "text":
      return (
        <p className="max-w-[68ch] text-base leading-7 text-foreground">{block.text}</p>
      );

    case "steps":
      return (
        <ol className="max-w-[68ch] space-y-3">
          {block.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary"
              >
                {i + 1}
              </span>
              <span className="text-base leading-7 text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <dl className="max-w-[68ch] overflow-hidden rounded-xl border border-border">
          <div className="hidden border-b border-border bg-surface-subtle sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {block.head.map((label) => (
              <p
                key={label}
                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {label}
              </p>
            ))}
          </div>
          {block.rows.map(([term, definition], i) => (
            <div
              key={i}
              className={cn(
                "gap-x-4 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:px-0 sm:py-0",
                i > 0 && "border-t border-border",
              )}
            >
              <dt className="text-sm font-semibold text-foreground sm:px-4 sm:py-3">
                {term}
              </dt>
              <dd className="mt-1 text-sm leading-6 text-muted-foreground sm:mt-0 sm:px-4 sm:py-3">
                {definition}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "note":
      return (
        <div className="flex max-w-[68ch] gap-3 rounded-xl border border-border bg-surface-subtle p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted-foreground">
            <span className="sr-only">À noter : </span>
            {block.text}
          </p>
        </div>
      );

    case "warning":
      return (
        <div className="flex max-w-[68ch] gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <p className="text-sm leading-6 text-foreground">
            <span className="sr-only">Attention : </span>
            {block.text}
          </p>
        </div>
      );

    case "screen":
      return (
        <Link
          href={block.href}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {block.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      );

    case "chat":
      return (
        <div
          className="max-w-[68ch] space-y-3 rounded-xl border border-border bg-surface-subtle p-4"
          role="group"
          aria-label="Exemple de conversation WhatsApp"
        >
          {block.turns.map((turn, i) => {
            const fromClient = turn.from === "client";
            return (
              <div
                key={i}
                className={cn("flex flex-col gap-1", fromClient ? "items-start" : "items-end")}
              >
                {/* Le libellé, et pas seulement la position ni la couleur : DESIGN.md
                    interdit de faire porter un statut par la couleur seule. */}
                <span className="px-1 text-xs font-medium text-muted-foreground">
                  {fromClient ? "Votre clientèle" : "L’assistant"}
                </span>
                <p
                  className={cn(
                    "max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6",
                    fromClient
                      ? "rounded-tl-sm bg-background text-foreground"
                      : "rounded-tr-sm bg-primary/10 text-foreground",
                  )}
                >
                  {turn.text}
                </p>
              </div>
            );
          })}
        </div>
      );
  }
}
