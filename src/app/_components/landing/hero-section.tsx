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
          isLoggedIn ? "contents" : "flex flex-1 flex-col gap-8 max-lg:items-center max-lg:text-center text-left lg:max-w-2xl"
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
                  Titre plus long que le précédent : à 4.5rem il partait en
                  trois lignes et repoussait les boutons sous la ligne de
                  flottaison. 3rem est la plus grande taille qui le tient en
                  deux lignes dans les 672px de la colonne — au-delà il faut
                  élargir la colonne, ce qui fait déborder la page.
                */}
                <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-[var(--hero-fg)] sm:text-5xl lg:text-5xl">
                  Votre boutique répond.{" "}
                  <br className="hidden lg:block" />
                  Vendez pendant qu’
                  <span className="hero-gradient-text">elle</span> le fait.
                </h1>
              </AnimateEntrance>

              <AnimateEntrance delay={650}>
                <p className="max-w-xl text-lg text-[var(--hero-fg-muted)] lg:text-[1.35rem] leading-relaxed">
                  Un code envoyé sur WhatsApp, et l’article est réservé,
                  l’adresse collectée, la preuve de paiement enregistrée.
                  Pendant un live comme au fil de la journée.
                </p>
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
