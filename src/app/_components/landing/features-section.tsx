import { PackageOpen, Lock, TimerOff, LayoutDashboard } from "lucide-react";

import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

const features = [
  {
    icon: PackageOpen,
    title: "Catalogue produit",
    description:
      "Créez et gérez votre catalogue d'articles avec codes et prix. Ajoutez des produits manuellement ou depuis vos sessions live, avec suivi des stocks en temps réel.",
  },
  {
    icon: Lock,
    title: "Réservation automatique",
    description:
      "Vos clients envoient un code par WhatsApp, le stock est verrouillé instantanément. Premier arrivé, premier servi.",
  },
  {
    icon: TimerOff,
    title: "Anti-fantômes (TTL)",
    description:
      "Définissez un temps limite pour le paiement. Si le client ne paie pas à temps, le stock est remis en vente automatiquement.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard tout-en-un",
    description:
      "Commandes, preuves de paiement, expéditions — tout est centralisé dans votre tableau de bord pour gérer votre activité sereinement.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="bg-muted/50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <AnimateOnScroll className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
            Tout ce dont vous avez besoin pour gérer vos ventes
          </h2>
          <p className="text-lg text-muted-foreground">
            Du catalogue à la livraison, SnapSell centralise toute votre
            activité pour que vous n&apos;ayez plus à jongler entre fichiers
            Excel et messages WhatsApp.
          </p>
        </AnimateOnScroll>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <AnimateOnScroll
              key={feature.title}
              animation="fade-up"
              delay={i * 120}
              className="h-full"
            >
              <div className="group h-full rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
                  <feature.icon className="size-6" />
                </div>
                <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
