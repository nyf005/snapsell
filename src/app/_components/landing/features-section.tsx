import React from "react";
import { CheckCircle2, Clock, Users } from "lucide-react";

import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";
import { JourneyStrip } from "~/app/_components/landing/journey-strip";

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
                className={`text-xs font-bold ${item.stock <= 2 ? "text-destructive" : "text-success"}`}
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

/**
 * Deux personnes, le même code, à quelques secondes d'écart.
 *
 * Cette maquette ne montrait qu'une seule réservation — exactement le même
 * échange que le téléphone de `HowItWorksSection`, aux mêmes mots. Elle ne
 * montrait donc pas ce que son titre annonce : le conflit entre deux demandes.
 * Le cas à deux personnes, qui vivait dans la mauvaise section, revient ici où
 * il est le sujet.
 *
 * Les deux fils sont posés côte à côte plutôt qu'à la suite : c'est la
 * simultanéité qui fait l'argument, pas la chronologie.
 */
function ReservationVisual() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Même article, même minute
        </p>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
          <Users className="size-3" aria-hidden="true" />2 demandes
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Arrivée la première : elle emporte l'article. */}
        <div className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/5 p-3">
          <p className="text-[11px] font-bold text-muted-foreground">Aïcha · 14:32:04</p>
          <div className="self-end rounded-xl rounded-br-sm bg-primary/20 px-3 py-1.5">
            <p className="text-sm font-bold">ABC12</p>
          </div>
          <div className="rounded-xl rounded-bl-sm border border-border bg-muted px-3 py-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              <span className="text-sm font-bold text-success">Réservé</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paiement sous 30 min pour confirmer.
            </p>
          </div>
        </div>

        {/* Arrivée deux secondes plus tard : elle passe en file d'attente. */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-[11px] font-bold text-muted-foreground">Mariam · 14:32:06</p>
          <div className="self-end rounded-xl rounded-br-sm bg-primary/20 px-3 py-1.5">
            <p className="text-sm font-bold">ABC12</p>
          </div>
          <div className="rounded-xl rounded-bl-sm border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Clock className="size-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-bold text-primary">File d’attente</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Je te préviens si l’article se libère.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Les deux ont une réponse. Vous n’avez rien tranché.
      </p>
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
          <span className="text-xs text-success">+8 aujourd'hui</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
          <span className="text-xs text-muted-foreground">En attente</span>
          <span className="text-xl font-extrabold">6</span>
          <span className="text-xs text-muted-foreground">preuves paiement</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
          <span className="text-xs text-muted-foreground">Expédiées</span>
          <span className="text-xl font-extrabold">28</span>
          <span className="text-xs text-success">cette semaine</span>
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

/*
 * Espacements resserrés : la section pesait 2 085px dont 800 de vide, soit 38 %
 * — 288px de padding, 128 de marge sous le titre et trois écarts de 128 entre
 * les blocs. Les blocs eux-mêmes (255 à 301px) n'étaient pas en cause.
 *
 * Titre changé aussi : « Ce que vous arrêtez de faire » rejouait le mouvement
 * avant/après déjà servi par le hero ET par la section du désordre. Troisième
 * fois que le lecteur croisait la même figure. Le nouveau titre annonce ce que
 * la section fait vraiment — détailler, preuves à l'appui.
 */
export function FeaturesSection() {
  return (
    <section id="fonctionnalites" className="overflow-hidden py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <AnimateOnScroll className="mx-auto mb-10 max-w-3xl text-center lg:mb-12">
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
            Quatre choses qui se font{" "}
            <br className="hidden lg:block" />
            <span className="text-primary">sans vous</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Du catalogue à la livraison, SnapSell tient le carnet à votre place.
            Vous gardez la vente, la relation et la décision.
          </p>
        </AnimateOnScroll>

        {/*
          La frise du parcours ouvre la section : elle donne le trajet complet —
          message, réponse, commande, paiement — avant que les quatre blocs ne le
          découpent. Le lecteur sait donc où il est à chaque bloc.
        */}
        <AnimateOnScroll animation="fade-up" className="mx-auto mb-16 max-w-5xl lg:mb-24">
          <JourneyStrip />
        </AnimateOnScroll>

        <div className="flex flex-col gap-16 lg:gap-20">
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
                {/*
                  50/50 et non 60/40. La section annonce des preuves ; la
                  maquette recevait 493px contre 659 au texte, soit la portion
                  réduite pour l'élément qui porte la démonstration. Les
                  descriptions font deux à trois lignes, elles n'avaient pas
                  besoin de cette largeur.
                */}
                <div className="flex flex-col gap-5 lg:w-1/2">
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

                {/*
                  Visual — pas de `shrink-0` ici. Les deux moitiés font 616px
                  pour 1232px de rangée moins 80 de gouttière : avec `shrink-0`
                  d'un seul côté, tout le rattrapage tombait sur le texte et le
                  partage devenait 536/616. Les deux se rétractent donc à parts
                  égales, ce qui donne le 576/576 attendu.
                */}
                <div className="w-full lg:w-1/2">
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
