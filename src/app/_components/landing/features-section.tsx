import { Tag, Lock, TimerOff, LayoutDashboard } from "lucide-react";

import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

const features = [
  {
    icon: Tag,
    title: "Codes & Grille de prix",
    description:
      "Générez des codes uniques pour chaque produit. Vos clients n'ont qu'à taper le code en DM pour initier l'achat.",
  },
  {
    icon: Lock,
    title: "Réservation atomique",
    description:
      "Premier arrivé, premier servi. Les stocks sont verrouillés instantanément dès qu'un client réserve son article.",
  },
  {
    icon: TimerOff,
    title: "Anti-fantômes (TTL)",
    description:
      "Définissez un temps limite pour le paiement. Si le client ne paie pas à temps, le stock est remis en vente automatiquement.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard prêt à livrer",
    description:
      "Gérez vos expéditions, suivez les paiements et imprimez vos étiquettes en un clic depuis votre interface dédiée.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="bg-muted/50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <AnimateOnScroll className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
            Tout ce dont vous avez besoin pour exploser vos ventes
          </h2>
          <p className="text-lg text-muted-foreground">
            SnapSell gère la complexité logistique de vos ventes en direct pour
            que vous n&apos;ayez plus à gérer de fichiers Excel manuels.
          </p>
        </AnimateOnScroll>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <AnimateOnScroll
              key={feature.title}
              animation="fade-up"
              delay={i * 120}
            >
              <div className="group rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
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
