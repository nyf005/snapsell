"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

import { HELP_FAMILIES, type HelpFamily } from "~/lib/copy";
import { cn } from "~/lib/utils";

/**
 * Index de l'aide, avec filtre.
 *
 * Le filtre porte sur le titre, la question **et** le résumé : on cherche l'aide avec
 * les mots du problème (« code pas reconnu »), pas avec le titre de l'article qu'on ne
 * connaît pas encore. C'est précisément pour cela que chaque article porte une
 * `question` en langue parlée.
 *
 * Pas d'index externe ni de recherche floue : dix-huit articles se filtrent en clair,
 * et une dépendance de plus se paierait au chargement sur une connexion modeste.
 */
export type HelpCard = {
  slug: string;
  family: HelpFamily;
  title: string;
  question: string;
  summary: string;
  /**
   * Vrai quand l'article décrit un écran que le rôle de la personne connectée ne
   * peut pas ouvrir. On l'annonce au lieu de masquer l'article : le lire reste utile
   * pour comprendre la boutique, et une aide qui cache des pages laisse croire
   * qu'elles n'existent pas.
   */
  restricted?: boolean;
};

/** Retire les accents pour que « depanner » trouve « dépanner ». */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function HelpSearch({ cards }: { cards: readonly HelpCard[] }) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = fold(query.trim());
    if (needle.length === 0) return cards;
    const words = needle.split(/\s+/);
    return cards.filter((card) => {
      const haystack = fold(`${card.title} ${card.question} ${card.summary}`);
      return words.every((word) => haystack.includes(word));
    });
  }, [cards, query]);

  const groups = HELP_FAMILIES.map((family) => ({
    family,
    cards: matches.filter((c) => c.family === family.id),
  })).filter((g) => g.cards.length > 0);

  return (
    <div className="space-y-10">
      <div className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher : code, acompte, livraison…"
          aria-label="Chercher dans l’aide"
          className="h-14 w-full rounded-lg border border-border bg-card pl-12 pr-4 text-base text-foreground transition-colors placeholder:text-placeholder focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Le compte parle au lecteur de clavier autant qu'à l'œil. */}
      <p aria-live="polite" className="sr-only">
        {matches.length === 0
          ? "Aucun article ne correspond."
          : `${matches.length} article${matches.length > 1 ? "s" : ""} trouvé${matches.length > 1 ? "s" : ""}.`}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle p-8 text-center">
          <p className="font-semibold text-foreground">Aucun article ne correspond.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Essayez un mot plus simple — « code », « acompte », « livraison ».
          </p>
        </div>
      ) : (
        groups.map(({ family, cards: familyCards }) => (
          <section key={family.id} aria-labelledby={`famille-${family.id}`}>
            <h2
              id={`famille-${family.id}`}
              className="text-xl font-bold tracking-tight text-foreground"
            >
              {family.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{family.subtitle}</p>

            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {familyCards.map((card) => (
                <li key={card.slug}>
                  <Link
                    href={`/aide/${card.slug}`}
                    className={cn(
                      "group flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-5",
                      "transition-colors hover:border-primary/40 hover:bg-muted/40",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-foreground">{card.title}</span>
                      <ArrowRight
                        className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-sm leading-6 text-muted-foreground">
                      {card.question}
                    </span>
                    {card.restricted && (
                      <span className="mt-auto pt-2 text-xs font-medium text-muted-foreground">
                        Écran réservé aux rôles Propriétaire et Manager
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
