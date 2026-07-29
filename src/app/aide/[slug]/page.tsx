import { type Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { SiteHeader } from "~/components/site-header";
import { LandingFooter } from "~/app/_components/landing/landing-footer";
import { HELP_FAMILIES, HELP_TOPICS, helpTopic } from "~/lib/copy";
import { auth } from "~/server/auth";

import { HelpBody } from "../_components/help-body";

type Params = { slug: string };

/** Les dix-huit articles sont connus à la compilation : autant les pré-rendre. */
export function generateStaticParams(): Params[] {
  return HELP_TOPICS.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = helpTopic(slug);
  if (!topic) return { title: "Aide — SnapSell" };

  return {
    title: `${topic.title} — Aide SnapSell`,
    // La question, pas le résumé : c'est elle qui ressemble à ce qu'on tape dans
    // un moteur de recherche.
    description: topic.question,
  };
}

export default async function HelpTopicPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const topic = helpTopic(slug);
  if (!topic) notFound();

  const session = await auth();
  const family = HELP_FAMILIES.find((f) => f.id === topic.family);
  const related = (topic.related ?? [])
    .map((s) => helpTopic(s))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

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
        <article className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
          <Link
            href="/aide"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Toute l’aide
          </Link>

          <header className="mt-4 border-b border-border pb-8">
            {family ? (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                {family.title}
              </p>
            ) : null}
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
              {topic.title}
            </h1>
            <p className="mt-3 text-lg leading-8 text-muted-foreground">{topic.question}</p>
          </header>

          <HelpBody blocks={topic.body} className="mt-8" />

          {related.length > 0 ? (
            <section aria-labelledby="a-lire-ensuite" className="mt-14 border-t border-border pt-8">
              <h2 id="a-lire-ensuite" className="text-lg font-bold text-foreground">
                À lire ensuite
              </h2>
              <ul className="mt-4 space-y-2">
                {related.map((next) => (
                  <li key={next.slug}>
                    <Link
                      href={`/aide/${next.slug}`}
                      className="group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
                    >
                      {next.title}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </main>

      <LandingFooter />
    </div>
  );
}
