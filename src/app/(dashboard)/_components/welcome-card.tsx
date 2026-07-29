import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

import { helpTopic, roleLabel } from "~/lib/copy";

/**
 * Accueil d'une personne qui vient de rejoindre une boutique.
 *
 * Une personne invitée en rôle Vente ou Agent atterrissait sur « Aujourd'hui » sans
 * un mot, face à une liste de mise en route qu'elle n'a pas le droit de remplir — les
 * réglages sont réservés aux rôles Propriétaire et Manager. Elle voyait donc, comme
 * premier écran, un travail impossible.
 *
 * ── POURQUOI CETTE CARTE S'EFFACE TOUTE SEULE ───────────────────────────────
 * Elle s'affiche pendant les sept premiers jours du compte, puis disparaît. Aucune
 * colonne « accueil vu », aucune migration : la même règle que
 * `src/server/api/routers/onboarding.ts`, où rien n'est stocké et tout est dérivé.
 *
 * Le compromis est assumé : quelqu'un qui revient après un mois ne la revoit pas.
 * L'aide reste à un clic dans la barre latérale, et sur chaque écran.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const WELCOME_WINDOW_DAYS = 7;

/** Le rôle qui arrive par invitation, et ne configure rien. */
const INVITED_ROLE = "AGENT";

/**
 * Trois articles : ce que la personne va faire, dans l'ordre.
 *
 * La liste était dédoublée, VENDEUR recevant le live et le catalogue, AGENT les
 * preuves. VENDEUR a été retiré de l'enum Role — aucun contrôle de permission ne
 * le distinguait d'AGENT — et l'Agent unique fait les deux. D'où un article par
 * moment du travail plutôt que par ancien rôle : comprendre, tenir le live,
 * valider une preuve. `creer-un-article-par-whatsapp` et
 * `une-cliente-dit-avoir-paye` restent atteignables depuis « related ».
 */
const FIRST_READS: readonly string[] = [
  "comment-ca-marche",
  "tenir-un-live",
  "valider-une-preuve",
];

export function shouldShowWelcome(
  role: string | null | undefined,
  createdAt: Date | null | undefined,
): boolean {
  if (role?.toUpperCase() !== INVITED_ROLE) return false;
  if (!createdAt) return false;
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs < WELCOME_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function WelcomeCard({ role }: { role: string }) {
  if (role.toUpperCase() !== INVITED_ROLE) return null;
  const topics = FIRST_READS.map((s) => helpTopic(s)).filter(
    (t): t is NonNullable<typeof t> => !!t,
  );

  if (topics.length === 0) return null;

  return (
    <section
      aria-labelledby="bienvenue-heading"
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Première fois ici
        </p>
        <h2 id="bienvenue-heading" className="mt-1 flex items-center gap-2 text-lg font-bold text-foreground">
          <Compass className="size-5 text-primary" aria-hidden="true" />
          Bienvenue dans l’équipe
        </h2>
        <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">
          Votre rôle est « {roleLabel(role)} ». Trois articles suffisent pour savoir quoi
          faire, et pourquoi.
        </p>
      </div>

      <ol className="divide-y divide-border">
        {topics.map((topic, i) => (
          <li key={topic.slug}>
            <Link
              href={`/aide/${topic.slug}`}
              className="group flex min-h-14 items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 sm:px-6"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{topic.title}</span>
                <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                  {topic.question}
                </span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
