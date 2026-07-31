import Link from "next/link";
import { marketing } from "~/lib/copy/marketing";
import { ArrowDown, ArrowRight, BadgeCheck, ChevronDown, Sparkles } from "lucide-react";

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
          // La colonne de texte est passée de 47rem (748px) à 38rem (608px),
          // et le téléphone de 340px à 380px.
          //
          // 47rem se justifiait par l'ancien titre, dont les tournures parlées
          // débordaient de toute largeur plus étroite. Le nouveau titre tient
          // en deux phrases courtes et la chute est passée de 14 mots à 8 :
          // plus rien n'a besoin de cette largeur, et une ligne de 750px se lit
          // moins bien qu'une ligne de 600px.
          //
          // Le rééquilibrage est le vrai objectif. Le texte occupait 69 % de la
          // largeur utile contre 31 % au téléphone — la démonstration passait
          // pour une illustration posée à côté. À 61/39, elle redevient ce
          // qu'elle est : l'argument principal, que le texte accompagne.
          isLoggedIn ? "contents" : "flex flex-1 flex-col gap-8 max-lg:items-center max-lg:text-center text-left lg:max-w-[38rem]"
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
                  LE BLOC « AUJOURD'HUI » — la douleur.

                  L'angle a changé : ce n'est plus la fatigue de répondre, c'est
                  le TRAVAIL CACHÉ derrière chaque vente. « Une commande, ce
                  n'est jamais juste une commande » nomme un écart que la
                  personne connaît sans l'avoir formulé — elle croyait vendre,
                  elle passe sa journée à tenir un carnet.

                  Deux niveaux typographiques pour deux fonctions. La première
                  phrase est le titre : elle porte l'idée, elle est en gras et
                  en 2rem. La seconde énumère les corvées — quatre en enfilade —
                  et n'a pas besoin du même poids ; en 2rem elle occuperait
                  quatre lignes et écraserait la promesse plus bas. Elle passe
                  donc en gris, à la taille du corps de texte.

                  Le repère « Aujourd'hui » revient et retrouve son rôle : il
                  date le bloc comme la situation actuelle, et « Avec SnapSell »
                  plus bas lui répond. C'est le couple avant/après de
                  `marketing.contrast`, appliqué au premier écran.
                */}
                <div className="flex max-w-xl flex-col gap-3">
                  <h1 className="font-display text-2xl font-extrabold leading-[1.15] tracking-tight text-[var(--hero-fg)] sm:text-3xl lg:text-[2rem]">
                    <span className="mb-3 block text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--hero-fg-subtle)]">
                      Aujourd’hui
                    </span>
                    Une commande sur WhatsApp, ce n’est jamais juste une
                    commande.
                  </h1>
                  <p className="text-lg leading-relaxed text-[var(--hero-fg-muted)] lg:text-[1.2rem]">
                    Il faut suivre la discussion, retrouver l’adresse, vérifier
                    le dépôt et ne rien oublier.
                  </p>
                </div>
              </AnimateEntrance>

              <AnimateEntrance delay={650}>
                {/*
                  LE BLOC « AVEC SNAPSELL » — la réponse.

                  Il est bâti en miroir du bloc « Aujourd'hui » : même repère
                  en petites capitales, puis les deux mêmes niveaux
                  typographiques, mais dans l'ordre inverse. Là-haut, le gros
                  posait le problème et le gris détaillait la corvée ; ici le
                  gris explique le mécanisme et le gros porte la chute. Le poids
                  visuel bascule d'un bloc à l'autre, comme le propos.

                  L'explication ne nomme aucune fonctionnalité. Elle décrit ce
                  qui n'a plus lieu — « sans copier-coller ni recherche dans les
                  conversations » — et c'est le geste exact que la liste du haut
                  vient d'énumérer. Les deux blocs se répondent ligne à ligne.

                  « Avec » reste gris, comme le repère « Aujourd'hui » auquel il
                  répond : deux mots de structure, même traitement. Seul le NOM
                  DU PRODUIT prend le dégradé, celui de la chute juste en
                  dessous — nom et promesse se peignent pareil, sans toucher au
                  logo de l'en-tête.
                */}
                <div className="flex max-w-xl flex-col gap-4">
                  <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--hero-fg-subtle)]">
                    Avec <span className="hero-gradient-text">SnapSell</span>
                  </p>
                  <p className="text-lg leading-relaxed text-[var(--hero-fg-muted)] lg:text-[1.2rem]">
                    Tout est enregistré automatiquement au bon endroit, sans
                    copier-coller ni recherche dans les conversations.
                  </p>
                  {/*
                    Trois phrases de deux mots, puis une de quatre. C'est la
                    ligne que le visiteur doit pouvoir répéter le soir même :
                    deux impératifs pour ce qui vous reste, une affirmation pour
                    ce qui part ailleurs.

                    Pas de classe de couleur ici — `hero-gradient-text` peint le
                    texte lui-même, une couleur explicite la recouvrirait. Même
                    taille que le titre (2rem) : à poids égal, c'est la couleur
                    qui fait gagner la promesse.
                  */}
                  <p className="hero-gradient-text text-2xl font-extrabold leading-tight lg:text-[2rem]">
                    Emballez. Livrez. SnapSell gère le reste.
                  </p>
                </div>
              </AnimateEntrance>

              {/*
                Les deux boutons portaient la même flèche vers la droite. Deux
                actions de natures opposées se ressemblaient donc à l'œil, et
                aucune des deux flèches ne disait la vérité sur sa destination.

                Le bouton principal prend l'étincelle, la même qui marque chaque
                réponse automatique dans le téléphone à côté et chaque bandeau
                « Avec SnapSell ». Elle est devenue le signe du produit dans
                cette page : la poser sur l'inscription, c'est dire « obtenir
                ça » sans l'écrire.

                Le bouton secondaire prend une flèche vers le BAS, parce que
                c'est où il mène — `#fonctionnement` est une ancre plus bas dans
                la même page. Une flèche vers la droite promettait un départ
                ailleurs ; celle-ci annonce un défilement, ce qui est à la fois
                honnête et utile.
              */}
              <AnimateEntrance delay={900}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="h-12 rounded-xl px-10 text-base font-bold shadow-2xl shadow-primary/40 transition-all hover:scale-[1.03] hover:shadow-primary/60 active:scale-[0.98]"
                  >
                    <Link href="/login?tab=signup">
                      <Sparkles className="size-5" />
                      {marketing.cta.signup}
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
                      <ArrowDown className="size-5" />
                    </Link>
                  </Button>
                </div>
              </AnimateEntrance>

              {/*
                Plus rien sous les boutons.

                Trois choses s'y sont succédé : des avatars fictifs (interdits
                par `marketing.ts`), puis les objections — parties en bas de
                page dans `CtaSection`, où elles se posent vraiment —, puis une
                liste de trois bénéfices.

                Cette liste disait les mêmes gestes que la phrase d'explication
                plus haut, mais en fragments détachés les uns des autres. Entre
                les deux formes, celle qui se comprend est la phrase : elle
                garde le lien de cause à effet (« un client écrit : … ») que
                trois puces perdent. Une seule des deux survit, et ce n'est pas
                la liste.

                Le premier écran finit donc sur l'action, sans rien après elle.
              */}
            </>
          )}
        </div>

        {/*
          Le téléphone était `hidden lg:block` : sur mobile — l'écran de la
          quasi-totalité de la cible — le hero n'avait aucun visuel, et la
          première maquette de la page arrivait après un écran plein de texte.
          Il est désormais affiché partout, mais APRÈS le bouton dans l'ordre du
          document : le premier écran reste promesse + action, la démonstration
          récompense le premier défilement.
        */}
        {!isLoggedIn && (
          <AnimateEntrance delay={600}>
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
