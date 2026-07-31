import { MessageCircle } from "lucide-react";

import { buildSupportHref, isDirectSupport } from "~/lib/support";
import { env } from "~/env";

/**
 * La sortie du centre d'aide.
 *
 * 21 articles répondent à beaucoup de choses, jamais à tout. Sans ce bloc, une
 * vendeuse qui ne trouve pas sa réponse est dans une impasse — et c'est le cas
 * le plus fréquent, bien avant l'erreur technique. Elle referme l'application,
 * et personne n'apprend jamais ce qui lui manquait.
 *
 * Rien à afficher tant qu'aucun numéro n'est configuré : promettre un contact
 * qui n'aboutit pas est pire que ne rien promettre.
 */
export function ContactSupport({ shopName }: { shopName?: string | null }) {
  const supportNumber = env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER;
  if (!isDirectSupport(supportNumber)) return null;

  return (
    <aside className="mt-14 rounded-xl border border-border bg-muted/40 p-5">
      <h2 className="text-base font-semibold text-foreground">
        Vous ne trouvez pas votre réponse ?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Écrivez-nous sur WhatsApp. Dites ce que vous faisiez et ce qui s&apos;est
        passé — c&apos;est le plus utile pour vous répondre vite.
      </p>
      <a
        href={buildSupportHref(supportNumber, { shopName, screen: "/aide" })}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        Nous écrire sur WhatsApp
      </a>
    </aside>
  );
}
