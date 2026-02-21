import Link from "next/link";
import { ArrowRight, BadgeCheck, ChevronDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import { AnimateEntrance } from "~/app/_components/landing/animate-on-scroll";

type HeroSectionProps = {
  user?: { name?: string | null } | null;
};

export function HeroSection({ user }: HeroSectionProps) {
  const isLoggedIn = !!user;

  return (
    <section className="landing-hero relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-16">
      {/* Aurora layers */}
      <div aria-hidden="true" className="aurora-1 pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="aurora-2 pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden="true" className="aurora-3 pointer-events-none absolute inset-0 -z-10" />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-8 text-center">
        {isLoggedIn ? (
          <>
            <AnimateEntrance delay={200}>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                <BadgeCheck className="size-4" />
                Vous êtes connecté
              </div>
            </AnimateEntrance>

            <AnimateEntrance delay={400}>
              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-8xl">
                Bon retour
                {user.name ? (
                  <span className="hero-gradient-text">, {user.name}</span>
                ) : null}
              </h1>
            </AnimateEntrance>

            <AnimateEntrance delay={650}>
              <p className="max-w-2xl text-lg text-white/60 lg:text-xl">
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
                Nouveau : Catalogue produit intégré
              </div>
            </AnimateEntrance>

            <AnimateEntrance delay={400}>
              <h1 className="text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-8xl">
                Vos ventes en live,{" "}
                <br className="hidden sm:block" />
                <span className="hero-gradient-text">entièrement automatisées</span>
              </h1>
            </AnimateEntrance>

            <AnimateEntrance delay={650}>
              <p className="max-w-2xl text-lg text-white/60 lg:text-xl">
                Catalogue produit, réservations WhatsApp, file d&apos;attente
                et suivi de commandes — une seule plateforme pour tout gérer.
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
                    Créer mon compte vendeur
                    <ArrowRight className="size-5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-xl border-white/15 bg-white/5 px-10 text-base font-bold text-white backdrop-blur-sm transition-all hover:scale-[1.03] hover:bg-white/10 active:scale-[0.98]"
                >
                  <Link href="#fonctionnalites">
                    Découvrir les fonctionnalités
                  </Link>
                </Button>
              </div>
            </AnimateEntrance>

            <AnimateEntrance delay={1150}>
              <div className="flex items-center gap-4 text-sm text-white/40">
                <div className="flex -space-x-2" aria-hidden="true">
                  <div className="flex size-8 items-center justify-center rounded-full border-2 border-[#050507] bg-primary/50 text-xs font-bold text-white">
                    S
                  </div>
                  <div className="flex size-8 items-center justify-center rounded-full border-2 border-[#050507] bg-primary/35 text-xs font-bold text-white">
                    A
                  </div>
                  <div className="flex size-8 items-center justify-center rounded-full border-2 border-[#050507] bg-primary/60 text-xs font-bold text-white">
                    M
                  </div>
                </div>
                <span>Inscription en 2 min — gratuit pour démarrer</span>
              </div>
            </AnimateEntrance>
          </>
        )}
      </div>

      {/* Scroll indicator */}
      <div className="scroll-indicator absolute bottom-10 left-1/2 -translate-x-1/2" aria-hidden="true">
        <ChevronDown className="size-6 text-white/30" />
      </div>
    </section>
  );
}
