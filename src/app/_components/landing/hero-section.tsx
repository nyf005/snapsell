import Link from "next/link";
import { marketing } from "~/lib/copy/marketing";
import { ArrowRight, BadgeCheck, Check, ChevronDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import { AnimateEntrance } from "~/app/_components/landing/animate-on-scroll";
import { SimulatedChat } from "~/app/_components/landing/simulated-chat";
import { HeroBackground } from "~/app/_components/landing/hero-background";
import { cn } from "~/lib/utils";

type HeroSectionProps = {
  user?: { name?: string | null } | null;
};

export function HeroSection({ user }: HeroSectionProps) {
  const isLoggedIn = !!user;

  return (
    <section className="landing-hero relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-16">
      {/* Dynamic Animated Background */}
      <HeroBackground />

      <div className={cn(
        "relative z-10 mx-auto w-full",
        isLoggedIn
          ? "flex flex-col items-center gap-8 text-center max-w-4xl"
          : "flex flex-col items-center gap-12 lg:flex-row lg:justify-between lg:gap-16 max-w-6xl"
      )}>
        <div className={cn(
          // 47rem (748px) plutôt que 2xl (672px) : les tournures parlées sont
          // plus longues que les tournures écrites, et 672px les cassait en
          // trois lignes. Mesuré — la colonne visuelle garde ses 340px et la
          // page ne déborde pas, la marge venait du `justify-between`.
          isLoggedIn ? "contents" : "flex flex-1 flex-col gap-8 max-lg:items-center max-lg:text-center text-left lg:max-w-[47rem]"
        )}>
          {isLoggedIn ? (
            <>
              <AnimateEntrance delay={400}>
                <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-[var(--hero-fg)] sm:text-5xl lg:text-7xl">
                  Bon retour
                  {user.name ? (
                    <span className="hero-gradient-text">, {user.name}</span>
                  ) : null}
                </h1>
              </AnimateEntrance>

              <AnimateEntrance delay={650}>
                <p className="max-w-2xl text-lg text-[var(--hero-fg-muted)] lg:text-xl">
                  Accédez à votre tableau de bord pour gérer vos commandes, vos
                  lives et vos paramètres.
                </p>
              </AnimateEntrance>

              <AnimateEntrance delay={900}>
                <Button
                  asChild
                  size="lg"
                  className="h-12 rounded-xl px-10 text-base font-bold shadow-2xl shadow-primary/40 transition-all hover:scale-[1.03] hover:shadow-primary/60 active:scale-[0.98]"
                >
                  <Link href="/dashboard">
                    Aller au tableau de bord
                    <ArrowRight className="size-5" />
                  </Link>
                </Button>
              </AnimateEntrance>
            </>
          ) : (
            <>
              <AnimateEntrance delay={200}>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                  <BadgeCheck className="size-4" />
                  {marketing.audience}
                </div>
              </AnimateEntrance>

              <AnimateEntrance delay={400}>
                {/*
                  Niveau de langue revu après retour de vendeurs : les tournures
                  d'écrit (infinitif sans sujet, « reconstituer », « réclamer »,
                  « classer ») ont été remplacées par la langue parlée.

                  Conséquence assumée : ces formulations sont plus longues. Le
                  titre occupe trois lignes au lieu de deux — aucune taille
                  raisonnable ne le tiendrait en deux sans amputer « aux clients »
                  et « vous cherchez encore », c'est-à-dire exactement ce qui le
                  rend naturel.

                  Un titre gros et gras se lit comme une promesse, or celui-ci
                  énonce le PROBLÈME : le repère « Aujourd'hui » le date comme la
                  situation actuelle, et « Avec SnapSell » plus bas lui répond.
                  C'est le couple avant/après de `marketing.contrast`.

                  Pas de <br> forcé ni de `text-wrap: balance` : chaque phrase
                  dépasse la largeur de la colonne, et `balance` égalise les
                  longueurs au prix d'une ligne supplémentaire (mesuré : 4 lignes
                  contre 3). On laisse la coupure naturelle remplir les lignes.

                  2rem (32px) : c'est la douleur, elle accroche mais ne doit pas
                  écraser la promesse. À 44px elle occupait presque deux fois
                  plus de place visuelle que la chute — un visiteur qui ne lisait
                  que le plus gros repartait avec le problème, sans la solution.
                  Bénéfice au passage : le titre tient en deux lignes au lieu de
                  trois (mesuré : 3 lignes dès 34px).
                */}
                <h1 className="font-display text-2xl font-extrabold leading-[1.15] tracking-tight text-[var(--hero-fg)] sm:text-3xl lg:text-[2rem]">
                  <span className="mb-3 block text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--hero-fg-subtle)]">
                    Aujourd’hui
                  </span>
                  Toute la journée, vous répondez aux clients. Le soir, vous
                  cherchez encore qui a commandé quoi.
                </h1>
              </AnimateEntrance>

              <AnimateEntrance delay={650}>
                <div className="flex max-w-xl flex-col gap-4 text-lg leading-relaxed text-[var(--hero-fg-muted)] lg:text-[1.35rem]">
                  {/*
                    « Avec SnapSell » devient un repère à part entière, en écho
                    exact au « Aujourd'hui » du titre : deux étiquettes de même
                    forme, l'une pour l'avant, l'autre pour l'après.
                  */}
                  {/*
                    « Avec » reste gris, comme le repère « Aujourd'hui » auquel
                    il répond : ce sont deux mots de structure, ils s'écrivent
                    pareil. Seul le NOM DU PRODUIT prend le dégradé — le même
                    que la chute, plus bas. Nom et promesse portent ainsi le
                    même traitement, sans toucher au logo de l'en-tête.
                  */}
                  <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--hero-fg-subtle)]">
                    Avec <span className="hero-gradient-text">SnapSell</span>
                  </p>
                  <p className="font-medium">
                    Votre assistant répond aux clients, enregistre chaque
                    commande et y ajoute l’adresse du client et la capture de son
                    paiement.
                  </p>
                  {/*
                    Le dégradé porte la promesse ET le nom du produit juste
                    au-dessus : les deux se répondent. Pas de classe de couleur
                    ici — `hero-gradient-text` peint le texte lui-même, une
                    couleur explicite la recouvrirait.

                    Même taille que le titre (2rem) : à poids égal, c'est la
                    couleur qui fait gagner la promesse. Elle reste sur deux
                    lignes jusqu'à 36px, la marge est donc confortable.
                  */}
                  <p className="hero-gradient-text text-2xl font-extrabold lg:text-[2rem]">
                    Vous n’avez plus qu’à emballer les colis et les confier au
                    livreur.
                  </p>
                </div>
              </AnimateEntrance>

              <AnimateEntrance delay={900}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 rounded-xl px-10 text-base font-bold shadow-2xl shadow-primary/40 transition-all hover:scale-[1.03] hover:shadow-primary/60 active:scale-[0.98]"
                  >
                    <Link href="/login?tab=signup">
                      {marketing.cta.signup}
                      <ArrowRight className="size-5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-xl border-[var(--hero-border)] bg-[var(--hero-surface)] px-10 text-base font-bold text-[var(--hero-fg)] backdrop-blur-sm transition-all hover:scale-[1.03] hover:bg-[var(--hero-surface-hover)] hover:text-[var(--hero-fg)] active:scale-[0.98]"
                  >
                    <Link href="#fonctionnement">
                      {marketing.cta.how}
                      <ArrowRight className="size-5" />
                    </Link>
                  </Button>
                </div>
              </AnimateEntrance>

              {/*
                Les trois avatars « S A M » qui vivaient ici se lisaient comme
                une preuve sociale — trois boutiques inscrites — alors que
                `marketing.ts` interdit explicitement les avatars fictifs. Ils
                sont remplacés par trois faits vérifiables, qui répondent en
                plus aux objections réelles.
              */}
              <AnimateEntrance delay={1150}>
                <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--hero-fg-subtle)]">
                  {[
                    marketing.cta.signupHint,
                    "Plan gratuit permanent",
                    "Votre numéro WhatsApp actuel",
                  ].map((fact) => (
                    <li key={fact} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      {fact}
                    </li>
                  ))}
                </ul>
              </AnimateEntrance>
            </>
          )}
        </div>

        {!isLoggedIn && (
          <AnimateEntrance delay={600} className="hidden lg:block">
            <SimulatedChat />
          </AnimateEntrance>
        )}
      </div>

      {/* Scroll indicator */}
      <div className="scroll-indicator absolute bottom-10 left-1/2 -translate-x-1/2" aria-hidden="true">
        <ChevronDown className="size-6 text-[var(--hero-fg-subtle)]" />
      </div>
    </section>
  );
}
