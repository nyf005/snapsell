import { Check, Clock, Image as ImageIcon, X } from "lucide-react";

import { marketing } from "~/lib/copy/marketing";
import { AnimateOnScroll } from "~/app/_components/landing/animate-on-scroll";

/**
 * Le désordre et l'ordre, montrés côte à côte.
 *
 * Cette section en faisait cinq : trois piliers, le trajet d'un message, le fil
 * encombré, le comparatif avant/après et une phrase de clôture. Deux blocs en
 * sont sortis :
 *
 * - les trois piliers (« Conversations prises en charge », « Commandes
 *   organisées », « Paiements vérifiables ») étaient la version abstraite de ce
 *   que la section suivante montre concrètement, maquettes à l'appui ;
 * - le trajet d'un message est devenu la frise d'ouverture de
 *   `FeaturesSection`, où il sert de sommaire aux quatre blocs qui suivent.
 *
 * Reste le comparatif — et il était à sens unique. La douleur avait une
 * maquette de 412px PLUS une liste ; la solution n'avait que sa liste de 236px.
 * Mesuré : le « avant » pesait près de trois fois le « après » en surface, dans
 * la section dont c'est justement le retournement qui est le sujet. Et la
 * maquette du fil encombré, centrée au-dessus des deux colonnes, n'illustrait
 * que celle de gauche sans lui appartenir — trois largeurs empilées, 672 puis
 * 768 puis 1232.
 *
 * Désormais une seule grille, deux colonnes symétriques : titre, maquette,
 * liste. La maquette de droite montre le MÊME mardi que celle de gauche — mêmes
 * personnes, mêmes articles — mais rangé. C'est le retournement, montré et non
 * plus seulement affirmé.
 */

/**
 * Les deux maquettes sont construites en HTML, sans image : le contenu est
 * localisé (FCFA, prénoms), il se charge instantanément sur une connexion
 * faible, et il montre le produit réel plutôt qu'une métaphore.
 */
type ThreadMessage = {
  from: string;
  text: string;
  time: string;
  /** Message dont le contenu est une capture d'écran — le cas le plus courant. */
  isCapture?: boolean;
};

const messyThread: ThreadMessage[] = [
  { from: "Aïcha", text: "Bonjour, le sac bleu est encore dispo ?", time: "14:02" },
  { from: "Mariam", text: "c’est combien celui-là ?", time: "14:05", isCapture: true },
  { from: "Fatou", text: "Je prends la robe taille M", time: "14:06" },
  { from: "Aïcha", text: "Allô ?", time: "14:31" },
  { from: "Mariam", text: "j’ai payé", time: "15:12", isCapture: true },
];

function MessyThreadVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
      {/*
        `flex-wrap` et non un simple `justify-between` : à 375px, l'intitulé en
        majuscules espacées et sa pastille additionnaient 372px de largeur
        minimale pour 327 disponibles. La grille prenait cette largeur pour
        consigne et la section, en `overflow-hidden`, rognait 21px des deux
        maquettes. Ici l'intitulé passe à la ligne plutôt que d'imposer sa
        largeur.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Votre WhatsApp, mardi
        </p>
        <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-bold text-destructive">
          5 non lus
        </span>
      </div>
      <ul className="divide-y divide-border" role="list">
        {messyThread.map((m, i) => (
          <li key={i} className="flex items-start gap-3 px-5 py-3.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
              {m.from.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{m.from}</p>
              <p className="truncate text-sm text-muted-foreground">
                {m.isCapture && (
                  <ImageIcon
                    className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground/70"
                    aria-hidden="true"
                  />
                )}
                {m.text}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground/70">{m.time}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-border bg-muted/40 px-5 py-3.5 text-xs text-muted-foreground">
        Qui a payé ? Qui attend encore ? La réponse est quelque part dans le fil.
      </p>
    </div>
  );
}

/**
 * Le même mardi, rangé — la maquette du « après ».
 *
 * Chaque ligne répond à un message du fil de gauche, prénom pour prénom : la
 * question d'Aïcha sur le sac est devenue une réservation qui court, la capture
 * de Mariam une preuve de paiement à valider, la commande de Fatou une
 * expédition à préparer. Trois statuts distincts pour montrer que le tableau ne
 * range pas seulement — il dit ce qu'il reste à faire.
 */
type TidyOrder = {
  customer: string;
  item: string;
  amount: string;
  /** Référence et heure, reprises telles quelles du fil de gauche. */
  reference: string;
  time: string;
  status: string;
  detail: string;
  /** Trois tons, trois natures d'attente — rien à faire, à faire, fait. */
  tone: "pending" | "todo" | "done";
};

const tidyOrders: TidyOrder[] = [
  {
    customer: "Aïcha",
    item: "Sac bandoulière",
    amount: "22 000 FCFA",
    reference: "SS-1042",
    time: "14:02",
    status: "Réservé",
    detail: "expire dans 22 min",
    tone: "pending",
  },
  {
    customer: "Mariam",
    item: "Sandales dorées",
    amount: "8 000 FCFA",
    reference: "SS-1043",
    time: "14:05",
    status: "Preuve reçue",
    detail: "à 15:12",
    tone: "todo",
  },
  {
    customer: "Fatou",
    item: "Robe fleurie M",
    amount: "15 000 FCFA",
    reference: "SS-1044",
    time: "14:06",
    status: "Payé",
    detail: "à expédier",
    tone: "done",
  },
];

/**
 * Le compte du jour, en trois cases — l'argent, réparti par ce qu'il reste à
 * faire pour l'obtenir.
 *
 * C'est la seule chose que le fil de gauche ne pourra jamais donner : cinq
 * messages ne s'additionnent pas. Ces trois nombres sont la somme exacte des
 * trois commandes au-dessus, chacun dans le ton de son statut.
 */
const dayTotals = [
  { label: "Encaissé", value: "15 000 FCFA", tone: "text-success" },
  { label: "À valider", value: "8 000 FCFA", tone: "text-primary" },
  { label: "Réservé", value: "22 000 FCFA", tone: "text-muted-foreground" },
] as const;

const toneClasses: Record<TidyOrder["tone"], string> = {
  pending: "bg-muted text-muted-foreground",
  todo: "bg-primary/15 text-primary",
  done: "bg-success/15 text-success",
};

function TidyOrdersVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-lg shadow-primary/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-5 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Vos commandes, le même mardi
        </p>
        <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">
          3 commandes
        </span>
      </div>
      {/*
        Chaque ligne porte sa référence et son heure — reprises telles quelles du
        fil de gauche : 14:02 pour Aïcha, 14:05 puis 15:12 pour Mariam, 14:06
        pour Fatou. Rien n'a été ajouté à la journée, tout a été rangé. C'est
        aussi la démonstration littérale de « Preuves de paiement horodatées »,
        annoncé dans la liste juste en dessous.
      */}
      <ul className="divide-y divide-border" role="list">
        {tidyOrders.map((o) => (
          <li key={o.customer} className="flex items-start gap-3 px-5 py-3.5">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {o.customer.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{o.customer}</p>
              <p className="truncate text-sm text-muted-foreground">{o.item}</p>
              <p className="font-mono text-[11px] text-muted-foreground/70">
                {o.reference} · {o.time}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-bold">{o.amount}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${toneClasses[o.tone]}`}
              >
                {o.status}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                {o.tone === "pending" && (
                  <Clock className="size-3" aria-hidden="true" />
                )}
                {o.detail}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/*
        Trois colonnes seulement à partir de `sm`. À 375px chaque case ne fait
        que 108px pour 83 de texte disponible, et « 15 000 FCFA » passait à deux
        lignes pendant que « 22 000 FCFA » occupait 84px pour 84 — au pixel près.
        Sous `sm`, chaque total devient donc une ligne pleine largeur, intitulé à
        gauche et montant à droite, et les séparateurs basculent de la verticale
        à l'horizontale.
      */}
      <div className="grid divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {dayTotals.map((t) => (
          <div
            key={t.label}
            className="flex items-center justify-between gap-2 px-5 py-2.5 sm:flex-col sm:items-start sm:gap-1 sm:px-4"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t.label}
            </span>
            <span className={`text-sm font-extrabold tabular-nums ${t.tone}`}>
              {t.value}
            </span>
          </div>
        ))}
      </div>

      <p className="border-t border-primary/20 bg-primary/5 px-5 py-3.5 text-xs font-medium text-primary">
        Qui a payé, qui attend, quoi expédier : c’est écrit.
      </p>
    </div>
  );
}

export function CoreSection() {
  return (
    <section id="fonctionnement" className="overflow-hidden bg-muted/40 py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6">
        {/* En-tête */}
        <AnimateOnScroll className="mx-auto mb-14 max-w-3xl text-center lg:mb-20">
          <span className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            Au cœur de SnapSell
          </span>
          <h2 className="mb-6 text-3xl font-extrabold lg:text-5xl">
            Tout ce que la vente WhatsApp éparpille,{" "}
            <span className="text-primary">enfin réuni.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Voici le même mardi, dans votre téléphone puis dans SnapSell. Mêmes
            personnes, mêmes articles.
          </p>
        </AnimateOnScroll>

        {/*
          Aucun élément de cette grille ne s'étire, et c'est délibéré.
          Les deux maquettes n'ont pas le même nombre de lignes — cinq messages
          donnent trois commandes, c'est justement ce qu'on veut faire voir.
          Deux tentatives de rattrapage ont été essayées et abandonnées :
            • `items-start` laissait 135px de décalage au bas des colonnes ;
            • un `flex-1` sur les listes égalisait bien les colonnes, mais en
              creusant le vide DANS une carte — 330px d'abord, puis 19 après
              enrichissement du panneau de droite. Étirer ne supprime pas le
              vide, ça le déplace.
          Les deux maquettes sont donc réglées à la même hauteur à la source
          (436px, mesuré : en-tête 45 + corps + pied 45), et les deux listes
          gardent leur hauteur naturelle. Rien ne s'étire, donc aucun vide ne
          peut apparaître.
        */}
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          <AnimateOnScroll animation="slide-right" className="flex min-w-0 flex-col gap-6">
            <h3 className="text-xl font-bold text-muted-foreground">
              {marketing.contrast.beforeTitle}
            </h3>
            <MessyThreadVisual />
            <ul
              className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-7"
              role="list"
            >
              {marketing.contrast.before.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                    <X className="size-3 text-destructive" aria-hidden="true" />
                  </span>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </AnimateOnScroll>

          <AnimateOnScroll animation="slide-left" className="flex min-w-0 flex-col gap-6">
            <h3 className="text-xl font-bold text-primary">
              {marketing.contrast.afterTitle}
            </h3>
            <TidyOrdersVisual />
            <ul
              className="flex flex-col gap-3.5 rounded-2xl border border-primary/30 bg-primary/5 p-7"
              role="list"
            >
              {marketing.contrast.after.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15">
                    <Check className="size-3 text-success" aria-hidden="true" />
                  </span>
                  <span className="font-medium">{item}</span>
                </li>
              ))}
            </ul>
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
