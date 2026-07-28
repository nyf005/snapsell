import React from "react";
import { CheckCircle2 } from "lucide-react";

import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

type Feature = {
  number: string;
  title: string;
  description: string;
  highlight: string;
  visual: React.ReactNode;
};

function CatalogueVisual() {
  const items = [
    { code: "ABC12", label: "Robe fleurie S", price: "15 000 FCFA", stock: 4 },
    { code: "XYZ98", label: "Sac bandoulière", price: "22 000 FCFA", stock: 1 },
    { code: "DEF34", label: "Sandales dorées", price: "8 000 FCFA", stock: 7 },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-5 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Catalogue
        </p>
      </div>
      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.code} className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {item.code}
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">{item.price}</span>
              <span
                className={`text-xs font-bold ${item.stock <= 2 ? "text-destructive" : "text-green-500"}`}
              >
                ×{item.stock}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReservationVisual() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-xl">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Message WhatsApp
      </p>
      {/* Customer sends code */}
      <div className="flex justify-end">
        <div className="rounded-2xl rounded-br-sm bg-primary/20 px-4 py-2.5">
          <p className="text-sm font-bold">ABC12</p>
          <p className="mt-0.5 text-right text-[10px] text-muted-foreground">14:32</p>
        </div>
      </div>
      {/* Bot confirms instantly */}
      <div className="flex justify-start">
        <div className="rounded-2xl rounded-bl-sm border border-border bg-muted px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-green-500" />
            <span className="text-sm font-bold text-green-500">Réservé !</span>
          </div>
          <p className="mt-1 text-sm">
            <span className="font-medium">Robe fleurie S</span> — 15 000 FCFA
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paiement sous 30 min pour confirmer.
          </p>
          <p className="mt-1 text-right text-[10px] text-muted-foreground">14:32</p>
        </div>
      </div>
    </div>
  );
}

function TimerVisual() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card px-8 py-10 shadow-xl">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Temps restant pour payer
      </p>
      <p className="tabular-nums text-7xl font-black leading-none text-primary lg:text-8xl">
        29:47
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-[62%] rounded-full bg-primary/70 transition-all" />
      </div>
      <p className="text-sm text-muted-foreground">
        Expiration → stock remis en vente
      </p>
    </div>
  );
}

function DashboardVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
      <div className="border-b border-border px-5 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Tableau de bord
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 p-5">
        <div className="flex flex-col gap-1 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <span className="text-xs text-muted-foreground">Ventes live</span>
          <span className="text-xl font-extrabold">1 240 000</span>
          <span className="text-xs text-muted-foreground">FCFA ce mois</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
          <span className="text-xs text-muted-foreground">Commandes</span>
          <span className="text-xl font-extrabold">42</span>
          <span className="text-xs text-green-500">+8 aujourd'hui</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
          <span className="text-xs text-muted-foreground">En attente</span>
          <span className="text-xl font-extrabold">6</span>
          <span className="text-xs text-muted-foreground">preuves paiement</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
          <span className="text-xs text-muted-foreground">Expédiées</span>
          <span className="text-xl font-extrabold">28</span>
          <span className="text-xs text-green-500">cette semaine</span>
        </div>
      </div>
    </div>
  );
}

/*
 * Les titres nomment la corvée supprimée, pas la fonctionnalité.
 * « Catalogue » ou « Tableau de bord tout-en-un » décrivent ce que le logiciel
 * contient ; la personne qui lit veut savoir ce qu'elle arrête de faire.
 * Le bloc 03 procédait déjà ainsi — c'est le modèle des trois autres.
 */
const features: Feature[] = [
  {
    number: "01",
    title: "Votre stock ne se compte plus à la main",
    description:
      "Chaque article a un code et un prix. Le stock baisse tout seul à chaque réservation, que l’article vienne du catalogue ou d’un live.",
    highlight: "Stock à jour en temps réel",
    visual: <CatalogueVisual />,
  },
  {
    number: "02",
    title: "Deux demandes, un seul article : plus de litige",
    description:
      "Le premier code reçu emporte l’article, à la seconde près. Le suivant part en file d’attente et sait qu’il est en attente — vous n’arbitrez plus rien.",
    highlight: "Verrouillage instantané",
    visual: <ReservationVisual />,
  },
  {
    number: "03",
    title: "Fini les réservations qui ne paient jamais",
    description:
      "Vous fixez le délai de paiement. Passé ce délai, l’article repart en vente automatiquement et la personne suivante est prévenue.",
    highlight: "Zéro commande fantôme",
    visual: <TimerVisual />,
  },
  {
    number: "04",
    title: "Le lendemain, tout est déjà trié",
    description:
      "Commandes, preuves de paiement, expéditions : plus rien à recopier le soir. Vous ouvrez le tableau de bord, tout y est déjà, à jour.",
    highlight: "Tout centralisé",
    visual: <DashboardVisual />,
  },
];

export function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="overflow-hidden py-24 lg:py-36">
      <div className="mx-auto max-w-7xl px-6">
        <AnimateOnScroll className="mx-auto mb-20 max-w-3xl text-center lg:mb-32">
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
            Ce que vous arrêtez de faire{" "}
            <br className="hidden lg:block" />
            dès le premier jour
          </h2>
          <p className="text-lg text-muted-foreground">
            Du catalogue à la livraison, SnapSell tient le carnet à votre place.
            Vous gardez la vente, la relation et la décision.
          </p>
        </AnimateOnScroll>

        <div className="flex flex-col gap-24 lg:gap-32">
          {features.map((feature, i) => (
            <AnimateOnScroll
              key={feature.title}
              animation={i % 2 === 0 ? "slide-right" : "slide-left"}
              threshold={0.1}
            >
              <div
                className={`flex flex-col items-center gap-12 lg:flex-row lg:gap-20 ${
                  i % 2 !== 0 ? "lg:flex-row-reverse" : ""
                }`}
              >
                {/* Text */}
                <div className="flex flex-1 flex-col gap-5">
                  <span className="text-sm font-bold uppercase tracking-[0.2em] text-primary/60">
                    {feature.number}
                  </span>
                  <h3 className="text-2xl font-extrabold lg:text-4xl">
                    {feature.title}
                  </h3>
                  <p className="text-base leading-relaxed text-muted-foreground lg:text-lg">
                    {feature.description}
                  </p>
                  <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary">
                    {feature.highlight}
                  </div>
                </div>

                {/* Visual */}
                <div className="w-full shrink-0 lg:w-2/5">
                  {feature.visual}
                </div>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
