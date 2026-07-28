import {
  ArrowRight,
  Check,
  MessageCircle,
  Reply,
  ShieldCheck,
  ShoppingBag,
  X,
} from "lucide-react";

import { marketing } from "~/lib/copy/marketing";
import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

/**
 * « Au cœur de SnapSell » — la section qui manquait.
 *
 * La page décrivait quatre fonctionnalités sans jamais nommer la corvée
 * qu'elles enlèvent. Trois blocs y répondent, dans cet ordre : ce que le
 * produit prend en charge, le trajet d'un message jusqu'au paiement, et le
 * vis-à-vis avant / après.
 */

const pillars = [
  {
    icon: MessageCircle,
    title: "Conversations prises en charge",
    description:
      "Chaque message a une suite. L’assistant répond, réserve et relance sans que vous ayez à surveiller le téléphone.",
  },
  {
    icon: ShoppingBag,
    title: "Commandes organisées",
    description:
      "Tout est centralisé, clair et à jour. Fini le carnet, les captures d’écran et les commandes retrouvées trop tard.",
  },
  {
    icon: ShieldCheck,
    title: "Paiements vérifiables",
    description:
      "Les preuves de paiement arrivent horodatées, rattachées à la bonne commande. Moins de doutes, moins de litiges.",
  },
] as const;

const flow = [
  { icon: MessageCircle, label: "Message", detail: "Le client écrit" },
  { icon: Reply, label: "Réponse", detail: "L’assistant répond" },
  { icon: ShoppingBag, label: "Commande", detail: "Tout est enregistré" },
  { icon: ShieldCheck, label: "Paiement", detail: "Preuve vérifiée" },
] as const;

export function CoreSection() {
  return (
    <section id="fonctionnement" className="overflow-hidden bg-muted/40 py-24 lg:py-36">
      <div className="mx-auto max-w-7xl px-6">
        {/* En-tête */}
        <AnimateOnScroll className="mx-auto mb-16 max-w-3xl text-center lg:mb-24">
          <span className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            Au cœur de SnapSell
          </span>
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
            Tout ce que la vente WhatsApp éparpille,{" "}
            <span className="text-primary">enfin réuni.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            De la première discussion au paiement confirmé. Plus rien ne se
            perd, tout avance.
          </p>
        </AnimateOnScroll>

        {/* Trois piliers */}
        <div className="mb-20 grid gap-8 md:grid-cols-3 lg:mb-28">
          {pillars.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <AnimateOnScroll key={pillar.title} animation="fade-up" delay={i * 100}>
                <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-7 shadow-sm">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold">{pillar.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                </div>
              </AnimateOnScroll>
            );
          })}
        </div>

        {/* Le trajet d'un message */}
        <AnimateOnScroll animation="fade-up" className="mb-20 lg:mb-28">
          <ol className="flex flex-col items-stretch gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-2">
            {flow.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.label}
                  className="flex flex-1 items-center gap-3 sm:justify-center"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight">{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                  {i < flow.length - 1 && (
                    <ArrowRight
                      className="ml-auto size-4 shrink-0 rotate-90 text-muted-foreground/40 sm:ml-2 sm:rotate-0"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </AnimateOnScroll>

        {/* Avant / après */}
        <div className="grid gap-6 lg:grid-cols-2">
          <AnimateOnScroll animation="slide-right">
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-border bg-card p-7">
              <h3 className="text-xl font-bold text-muted-foreground">
                {marketing.contrast.beforeTitle}
              </h3>
              <ul className="flex flex-col gap-3.5" role="list">
                {marketing.contrast.before.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                      <X className="size-3 text-destructive" aria-hidden="true" />
                    </span>
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll animation="slide-left">
            <div className="flex h-full flex-col gap-5 rounded-2xl border border-primary/30 bg-primary/5 p-7 shadow-lg shadow-primary/5">
              <h3 className="text-xl font-bold text-primary">
                {marketing.contrast.afterTitle}
              </h3>
              <ul className="flex flex-col gap-3.5" role="list">
                {marketing.contrast.after.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15">
                      <Check className="size-3 text-success" aria-hidden="true" />
                    </span>
                    <span className="font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AnimateOnScroll>
        </div>

        <AnimateOnScroll animation="fade-up">
          <p className="mt-14 text-center text-2xl font-extrabold lg:text-3xl">
            {marketing.contrast.closing}
          </p>
        </AnimateOnScroll>
      </div>
    </section>
  );
}
