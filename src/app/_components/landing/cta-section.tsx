import Link from "next/link";
import { Check } from "lucide-react";
import { marketing } from "~/lib/copy/marketing";

import { Button } from "~/components/ui/button";
import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

export function CtaSection() {
  return (
    <section className="px-6 py-24 lg:py-32">
      <AnimateOnScroll animation="scale-in">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-primary p-12 text-center shadow-2xl shadow-primary/20 lg:p-20">
          {/* Decorative gradient overlay */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.2)_0%,_transparent_60%)]"
          />

          <h2 className="relative z-10 mb-8 text-3xl font-extrabold text-primary-foreground lg:text-5xl">
            Votre prochaine commande, notée toute seule
          </h2>
          <p className="relative z-10 mx-auto mb-12 max-w-2xl text-lg text-primary-foreground/80">
            Créez votre boutique, connectez votre numéro WhatsApp actuel.{" "}
            {marketing.promise.setup}.
          </p>

          <div className="relative z-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-xl bg-primary-foreground px-8 text-base font-bold text-primary transition-transform hover:scale-[1.03] hover:bg-primary-foreground/90 active:scale-[0.98]"
            >
              <Link href="/login?tab=signup">
                {marketing.cta.signup}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border border-primary-foreground/30 bg-primary-foreground/10 px-8 text-base font-bold text-primary-foreground backdrop-blur-md transition-transform hover:scale-[1.03] hover:bg-primary-foreground/20 hover:text-primary-foreground active:scale-[0.98]"
            >
              <Link href="/login">Se connecter</Link>
            </Button>
          </div>

          {/*
            Les objections arrivent ici, et pas dans le hero.

            Elles y étaient auparavant, juste sous les boutons du premier écran.
            À cette hauteur, le visiteur n'a pas encore décidé : il se demande
            pourquoi utiliser le produit, pas ce qui pourrait le bloquer.
            Répondre à la seconde question avant la première dépensait trois
            lignes de renfort de promesse pour rassurer sur un doute que
            personne n'avait encore.

            En bas de page, l'ordre est le bon : la démonstration a convaincu,
            le bouton est là, et c'est maintenant que « faut-il une carte
            bancaire ? » se pose vraiment. Voir `marketing.objections`.
          */}
          <ul className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-primary-foreground/70">
            {marketing.objections.map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <Check className="size-4 shrink-0" aria-hidden="true" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </AnimateOnScroll>
    </section>
  );
}
