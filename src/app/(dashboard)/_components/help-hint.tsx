"use client";

import Link from "next/link";
import { ArrowRight, HelpCircle } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { helpTopic } from "~/lib/copy";
import { HelpBody } from "~/app/aide/_components/help-body";

/**
 * Aide contextuelle d'un écran.
 *
 * Câblée en **un seul point** : `TaskPageHeader` connaît déjà le `href` de l'écran et
 * demande son article à `helpForRoute()`. Tous les écrans de tâche ont donc gagné leur
 * aide sans qu'une seule page soit modifiée — et un nouvel écran l'obtient en déclarant
 * `route` dans `help.ts`.
 *
 * ── POURQUOI L'ARTICLE ENTIER, ET NON UN EXTRAIT ────────────────────────────
 * Le panneau affiche tout le corps de l'article, non un résumé. Couper aurait
 * demandé de choisir où, et la coupe serait tombée au milieu d'une procédure —
 * précisément ce qu'on vient chercher. Le panneau défile ; le lien vers `/aide`
 * reste là pour partager l'article ou suivre ses renvois.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function HelpHint({ slug }: { slug: string }) {
  const topic = helpTopic(slug);
  if (!topic) return null;

  return (
    <Sheet>
      <SheetTrigger className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <HelpCircle className="size-4" aria-hidden="true" />
        Comment ça marche ?
      </SheetTrigger>

      <SheetContent
        side="right"
        // Pleine largeur sur mobile : les 3/4 par défaut sont trop étroits pour
        // lire une procédure.
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
            {topic.title}
          </SheetTitle>
          <SheetDescription className="text-sm leading-6 text-muted-foreground">
            {topic.question}
          </SheetDescription>
        </SheetHeader>

        <div className="p-6">
          <HelpBody blocks={topic.body} />

          <Link
            href={`/aide/${topic.slug}`}
            className="mt-8 inline-flex min-h-11 items-center gap-2 border-t border-border pt-6 text-sm font-semibold text-primary hover:underline"
          >
            Ouvrir cet article dans l’aide
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
