import { type Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteHeader } from "~/components/site-header";
import { LandingFooter } from "~/app/_components/landing/landing-footer";
import { HELP_TOPICS } from "~/lib/copy";
import { auth } from "~/server/auth";

import { HelpSearch, type HelpCard } from "./_components/help-search";

export const metadata: Metadata = {
  title: "Aide — SnapSell",
  description:
    "Comprendre et utiliser SnapSell : les codes, les réservations, les acomptes, les commandes, et quoi faire quand ça ne va pas.",
};

/**
 * Le centre d'aide.
 *
 * ── POURQUOI CETTE PAGE EST PUBLIQUE ────────────────────────────────────────
 * Elle est lisible sans compte, et c'est délibéré :
 *   • un lien d'aide s'envoie sur WhatsApp à une nouvelle recrue, qui n'a pas
 *     encore de mot de passe ;
 *   • « personne ne reçoit mes messages » et « je n'arrive pas à me connecter »
 *     se lisent justement quand on est dehors ;
 *   • les articles décrivent des écrans, ils n'y donnent aucun accès.
 *
 * Le rôle de la personne connectée ne filtre donc rien : il ajoute seulement une
 * mention sur les articles dont l'écran lui est fermé.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default async function AidePage() {
  const session = await auth();
  const role = session?.user?.role as string | undefined;

  const cards: HelpCard[] = HELP_TOPICS.map((topic) => ({
    slug: topic.slug,
    family: topic.family,
    title: topic.title,
    question: topic.question,
    summary: topic.summary,
    ...(role &&
    topic.roles &&
    !(topic.roles as readonly string[]).includes(role.toUpperCase())
      ? { restricted: true }
      : {}),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader
        user={
          session?.user?.email
            ? { name: session.user.name, email: session.user.email }
            : null
        }
      />

      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
          <header className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Aide
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
              Comprendre et utiliser SnapSell
            </h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Ce qui se passe entre votre live et votre commande, les gestes du
              quotidien, et la cause des pannes les plus courantes.
            </p>
          </header>

          <div className="mt-10">
            <HelpSearch cards={cards} />
          </div>

          {session?.user ? (
            <Link
              href="/dashboard"
              className="mt-14 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              Retourner au tableau de bord
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
