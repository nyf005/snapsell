import { Package, Clock, ListOrdered } from "lucide-react";
const features = [
  { icon: Package, title: "Un stock suivi", text: "Chaque réservation bloque la quantité demandée. Vous voyez ce qui reste disponible dans le catalogue et pendant vos lives." },
  { icon: ListOrdered, title: "Une file d’attente organisée", text: "Quand un article est déjà réservé, les demandes suivantes rejoignent la file d’attente. L’assistant prévient la personne suivante si l’article se libère." },
  { icon: Clock, title: "Des réservations limitées dans le temps", text: "Les réservations expirées libèrent le stock. Les preuves reçues restent à vérifier avant de faire avancer la commande." },
];
export function FeaturesSection() {
  return <section id="fonctionnalites" className="px-5 py-16 sm:px-6 sm:py-20 lg:py-24"><div className="mx-auto max-w-6xl"><h2 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">Moins de suivi manuel pendant vos ventes</h2><div className="mt-10 grid gap-10 sm:mt-12 md:grid-cols-3 md:gap-10 lg:mt-16 lg:gap-14">{features.map(({ icon: Icon, title, text }) => <div key={title}><Icon className="mb-5 size-7 text-primary" aria-hidden="true" /><h3 className="max-w-xs text-xl font-semibold leading-snug">{title}</h3><p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground">{text}</p></div>)}</div></div></section>;
}
