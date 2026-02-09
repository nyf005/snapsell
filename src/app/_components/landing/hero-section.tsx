import Link from "next/link";
import { ArrowRight, BadgeCheck, MessageCircle } from "lucide-react";

import { Button } from "~/components/ui/button";
import { AnimateEntrance } from "~/app/_components/landing/animate-on-scroll";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 lg:pt-32 lg:pb-24">
      {/* Glow background */}
      <div
        aria-hidden="true"
        className="hero-glow pointer-events-none absolute inset-0 -z-10"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
        {/* Left — Copy */}
        <div className="flex flex-col gap-8">
          <AnimateEntrance delay={200}>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <BadgeCheck className="size-4" />
              Nouveau : Automatisation WhatsApp
            </div>
          </AnimateEntrance>

          <AnimateEntrance delay={450}>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-7xl">
              Transformez vos lives en{" "}
              <span className="text-primary">commandes structurées</span> via
              WhatsApp
            </h1>
          </AnimateEntrance>

          <AnimateEntrance delay={750}>
            <p className="max-w-xl text-lg text-muted-foreground lg:text-xl">
              Plus de chaos en DM. Codes, réservations, file d&apos;attente et
              acompte — tout est automatisé pour que vous puissiez vous
              concentrer sur la vente.
            </p>
          </AnimateEntrance>

          <AnimateEntrance delay={1050}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-xl px-8 text-base font-bold shadow-xl shadow-primary/25 transition-transform hover:scale-[1.03] active:scale-[0.98]"
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
                className="h-12 rounded-xl px-8 text-base font-bold transition-transform hover:scale-[1.03] active:scale-[0.98]"
              >
                <Link href="#fonctionnalites">
                  Découvrir les fonctionnalités
                </Link>
              </Button>
            </div>
          </AnimateEntrance>

          <AnimateEntrance delay={1300}>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {/* Avatars */}
              <div className="flex -space-x-2" aria-hidden="true">
                <div className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary/30 text-xs font-bold text-primary">
                  S
                </div>
                <div className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary/20 text-xs font-bold text-primary">
                  A
                </div>
                <div className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-primary/40 text-xs font-bold text-primary">
                  M
                </div>
              </div>
              <span>Inscription en 2 min — gratuit pour démarrer</span>
            </div>
          </AnimateEntrance>
        </div>

        {/* Right — Dashboard Mock */}
        <AnimateEntrance delay={800} animation="scale-in">
          <div className="relative" aria-hidden="true">
            <div className="rounded-3xl bg-gradient-to-tr from-primary/30 to-primary/5 p-4 lg:p-8">
              <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                {/* Browser chrome */}
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="flex gap-2">
                    <div className="size-3 rounded-full bg-red-500/50" />
                    <div className="size-3 rounded-full bg-yellow-500/50" />
                    <div className="size-3 rounded-full bg-green-500/50" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    snapsell.app/dashboard
                  </span>
                </div>

                {/* Dashboard content */}
                <div className="flex flex-col gap-4 p-6">
                  <div className="h-8 w-1/3 rounded bg-muted" />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex h-24 flex-col justify-end rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <span className="text-xs text-muted-foreground">
                        Ventes Live
                      </span>
                      <span className="text-xl font-bold">1 240 000 FCFA</span>
                    </div>
                    <div className="flex h-24 flex-col justify-end rounded-xl bg-muted p-4">
                      <span className="text-xs text-muted-foreground">
                        Commandes
                      </span>
                      <span className="text-xl font-bold">42</span>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between rounded-lg bg-muted p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded bg-green-500/20 text-green-500">
                          <MessageCircle className="size-4" />
                        </div>
                        <span className="text-sm font-medium">
                          Réserve #ABC-12
                        </span>
                      </div>
                      <span className="text-xs font-bold text-primary">
                        Confirmé
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-muted p-3 opacity-50">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 items-center justify-center rounded bg-muted-foreground/20">
                          <MessageCircle className="size-4" />
                        </div>
                        <span className="text-sm font-medium">
                          Réserve #XYZ-98
                        </span>
                      </div>
                      <span className="text-xs font-bold">En attente</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative glow */}
            <div className="absolute -right-6 -bottom-6 size-32 rounded-full bg-primary/20 blur-3xl" />
          </div>
        </AnimateEntrance>
      </div>
    </section>
  );
}
