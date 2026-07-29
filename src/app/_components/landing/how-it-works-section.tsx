import { Check, Clock, Package, Phone, ShieldCheck } from "lucide-react";

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
    title: "Connectez WhatsApp",
    description:
      "Votre numéro actuel reçoit les codes. L’assistant réserve, répond et tient la file d’attente — pendant un live comme au fil de la journée.",
  },
  {
    number: 3,
    title: "Gérez vos commandes",
    description:
      "Validez les preuves de paiement, suivez les livraisons et exportez vos données — tout depuis votre tableau de bord.",
  },
] as const;

/**
 * L'écran de la boutique, pas celui du client.
 *
 * Ici vivait un téléphone WhatsApp qui rejouait mot pour mot la réservation
 * déjà montrée par le bloc 02 des fonctionnalités — et le hero en affiche une
 * troisième. Trois conversations sur la même page : au troisième passage, on
 * ne regarde plus.
 *
 * Le doublon avait une seconde faute. Cette section parle de la MISE EN ROUTE
 * de la boutique, et son visuel montrait un achat côté client : il illustrait
 * la section voisine. La maquette suit maintenant les trois étapes de gauche —
 * catalogue rempli, numéro connecté, commandes qui arrivent — et se termine sur
 * le seul geste qui reste à faire à la main, valider une preuve.
 */
const setupRows = [
  {
    icon: Package,
    label: "Catalogue",
    detail: "12 articles · codes générés",
    done: true,
  },
  {
    icon: Phone,
    label: "Numéro WhatsApp",
    detail: "+225 07 01 02 03 04",
    done: true,
  },
  {
    icon: ShieldCheck,
    label: "Commandes",
    detail: "2 preuves à valider",
    done: false,
  },
] as const;

function ShopSetupVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            A
          </div>
          <div>
            <p className="text-sm font-bold">Boutique Awa</p>
            <p className="text-xs text-muted-foreground">Tableau de bord</p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          En ligne
        </span>
      </div>

      <ul className="divide-y divide-border" role="list">
        {setupRows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.label} className="flex items-center gap-3 px-5 py-5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{row.label}</p>
                <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
              </div>
              {row.done ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15">
                  <Check className="size-3.5 text-success" aria-hidden="true" />
                </span>
              ) : (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Clock className="size-3.5 text-primary" aria-hidden="true" />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Le seul geste qui reste manuel — et il tient en un clic. */}
      <div className="border-t border-border bg-muted/40 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Preuve à valider
        </p>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
          {/* Miniature de capture de virement, sans image à charger. */}
          <div
            className="h-[62px] w-[82px] shrink-0 overflow-hidden rounded-lg border border-border bg-background"
            aria-hidden="true"
          >
            <div className="flex items-center gap-1 bg-foreground/80 px-2 py-1.5">
              <div className="size-2 rounded-full bg-primary/60" />
              <div className="h-1 w-8 rounded-full bg-background/40" />
            </div>
            <div className="flex flex-col gap-1 px-2 py-1.5">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="h-2.5 w-12 rounded bg-muted-foreground/20" />
              <div className="h-1 w-14 rounded-full bg-muted-foreground/20" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Mariam</p>
            <p className="text-xs text-muted-foreground">
              Sandales dorées — 8 000 FCFA
            </p>
            <div className="mt-2 flex gap-2">
              <span className="rounded-lg bg-success px-3 py-1 text-[11px] font-bold text-success-foreground">
                Valider
              </span>
              <span className="rounded-lg border border-border px-3 py-1 text-[11px] font-bold text-muted-foreground">
                Refuser
              </span>
            </div>
          </div>
        </div>

        {/*
          La chute de la maquette, et de la section : après la mise en route, le
          seul geste qui reste est celui-ci. Elle donne aussi au visuel la
          hauteur qui lui manquait face à la colonne des trois étapes.
        */}
        <p className="mt-4 text-xs text-muted-foreground">
          Réserver, répondre, relancer, tenir la file d’attente : rien de tout
          cela n’attend un clic de votre part.
        </p>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section className="overflow-hidden bg-muted/40 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-16 lg:flex-row lg:gap-20">
          {/* Left — Steps */}
          <div className="lg:w-1/2">
            <AnimateOnScroll animation="fade-up">
              {/*
                Ce titre annonçait « Opérationnel en 5 minutes » alors que
                `marketing.promise.setup` — affiché dans le hero et sur Tarifs —
                promet autre chose. Deux délais concurrents sur la même page :
                on garde la promesse canonique comme seule source.
              */}
              <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
                Trois étapes, et c’est en route
              </h2>
              {/*
                Une ligne de cadrage, absente jusqu'ici : la section précédente
                vient de raconter le parcours du client, celle-ci change de
                point de vue. Sans le dire, elle se lisait comme une redite.
              */}
              <p className="mb-12 text-lg text-muted-foreground">
                Côté boutique, cette fois. Ce que vous faites une seule fois,
                au départ.
              </p>
            </AnimateOnScroll>

            <div className="space-y-14">
              {steps.map((step) => (
                <AnimateOnScroll
                  key={step.number}
                  animation="slide-right"
                  delay={step.number * 100}
                >
                  <div className="relative flex gap-6">
                    {/* Giant background number */}
                    <span
                      className="step-bg-number absolute -top-4 -left-2"
                      aria-hidden="true"
                    >
                      {step.number}
                    </span>
                    {/* Step indicator */}
                    <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30">
                      {step.number}
                    </div>
                    <div className="relative z-10">
                      <h3 className="mb-2 text-xl font-bold">{step.title}</h3>
                      <p className="text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>

          {/* Right — Shop dashboard mock */}
          <AnimateOnScroll animation="slide-left" className="relative lg:w-1/2">
            <ShopSetupVisual />

            {/* Decorative glow */}
            <div className="absolute -right-6 -bottom-6 size-32 rounded-full bg-primary/20 blur-3xl" />
          </AnimateOnScroll>
        </div>
      </div>
    </section>
  );
}
