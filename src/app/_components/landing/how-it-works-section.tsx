import { MessageCircle, CheckCircle2, Send } from "lucide-react";

import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

const steps = [
  {
    number: 1,
    title: "Créez votre catalogue",
    description:
      "Ajoutez vos articles avec codes et prix. Le stock est suivi automatiquement, que les articles soient ajoutés manuellement ou en live.",
  },
  {
    number: 2,
    title: "Lancez votre live",
    description:
      "Connectez WhatsApp, diffusez vos produits. SnapSell gère les réservations et la file d'attente en DM automatiquement.",
  },
  {
    number: 3,
    title: "Gérez vos commandes",
    description:
      "Validez les preuves de paiement, suivez les livraisons et exportez vos données — tout depuis votre tableau de bord.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-16 lg:flex-row">
          {/* Left — Steps */}
          <div className="lg:w-1/2">
            <AnimateOnScroll animation="fade-up">
              <h2 className="mb-8 text-3xl font-extrabold lg:text-5xl">
                Opérationnel en 5 minutes
              </h2>
            </AnimateOnScroll>

            <div className="space-y-12">
              {steps.map((step) => (
                <AnimateOnScroll
                  key={step.number}
                  animation="slide-right"
                  delay={step.number * 150}
                >
                  <div className="flex gap-6">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30">
                      {step.number}
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-bold">{step.title}</h3>
                      <p className="text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>

          {/* Right — WhatsApp Chat Mock */}
          <AnimateOnScroll animation="slide-left" className="relative lg:w-1/2">
            <div className="overflow-hidden rounded-3xl border border-border shadow-2xl">
              {/* Phone frame */}
              <div className="bg-card">
                {/* WhatsApp header */}
                <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-4 py-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    S
                  </div>
                  <div>
                    <p className="text-sm font-bold">SnapSell Bot</p>
                    <p className="text-xs text-muted-foreground">en ligne</p>
                  </div>
                </div>

                {/* Chat messages */}
                <div className="space-y-3 p-4">
                  {/* Customer message */}
                  <div className="flex justify-end">
                    <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/20 px-4 py-2.5">
                      <p className="text-sm font-medium">ABC12</p>
                      <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                        14:32
                      </p>
                    </div>
                  </div>

                  {/* Bot confirmation */}
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-muted px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-sm">
                        <CheckCircle2 className="size-4 text-green-500" />
                        <span className="font-bold text-green-500">
                          Réservé !
                        </span>
                      </div>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">Robe fleurie S</span> —
                        15 000 FCFA
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Paiement dans les 30 min pour confirmer.
                      </p>
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        14:32
                      </p>
                    </div>
                  </div>

                  {/* Customer 2 */}
                  <div className="flex justify-end">
                    <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/20 px-4 py-2.5">
                      <p className="text-sm font-medium">XYZ98</p>
                      <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                        14:33
                      </p>
                    </div>
                  </div>

                  {/* Bot queue */}
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-muted px-4 py-2.5">
                      <div className="flex items-center gap-1.5 text-sm">
                        <MessageCircle className="size-4 text-primary" />
                        <span className="font-bold text-primary">
                          File d&apos;attente
                        </span>
                      </div>
                      <p className="mt-1 text-sm">
                        <span className="font-medium">Sac bandoulière</span> —
                        rupture temporaire
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vous serez notifiée si le stock revient.
                      </p>
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        14:33
                      </p>
                    </div>
                  </div>
                </div>

                {/* Chat input */}
                <div className="flex items-center gap-2 border-t border-border p-3">
                  <div className="flex-1 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
                    Tapez un code...
                  </div>
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Send className="size-4" />
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative glow */}
            <div className="absolute -right-6 -bottom-6 size-32 rounded-full bg-primary/20 blur-3xl" />
          </AnimateOnScroll>
        </div>
      </div>
    </section>
  );
}
