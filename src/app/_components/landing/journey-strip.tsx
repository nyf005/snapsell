import {
  ArrowRight,
  MessageCircle,
  Reply,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";

/**
 * Le parcours d'un client, du premier message au paiement vérifié.
 *
 * Ce trajet vivait au milieu de « Au cœur de SnapSell », coincé entre les
 * piliers et le comparatif avant/après. Il en est sorti, puis a été une section
 * à part entière — et c'était trop pour lui : mesuré, son bloc de titre faisait
 * 152px pour une frise de 82px, dans une section de 538px dont 300 de vide. Un
 * titre de section, deux fois plus lourd que ce qu'il annonçait.
 *
 * Le contenu était bon, le format faux. La frise devient donc l'ouverture de
 * `FeaturesSection`, où elle a une vraie fonction : ses quatre étapes sont le
 * sommaire des quatre blocs détaillés juste en dessous — message et réponse
 * pour la réservation, commande pour le catalogue et le tableau de bord,
 * paiement pour le délai. Le lecteur voit le trajet complet avant qu'on le
 * découpe.
 *
 * Un bénéfice au passage : « Trois étapes, et c'est en route » n'est plus pris
 * pour une redite du parcours. Ce sont deux sujets distincts — la mise en route
 * de la boutique, et ce que vit la personne qui achète.
 */

const journey = [
  { icon: MessageCircle, label: "Message", detail: "Le client écrit" },
  { icon: Reply, label: "Réponse", detail: "L’assistant répond" },
  { icon: ShoppingBag, label: "Commande", detail: "Tout est enregistré" },
  { icon: ShieldCheck, label: "Paiement", detail: "Preuve vérifiée" },
] as const;

export function JourneyStrip() {
  return (
    <ol className="flex flex-col items-stretch gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:gap-2">
      {journey.map((step, i) => {
        const Icon = step.icon;
        return (
          <li
            key={step.label}
            className="flex flex-1 items-center gap-3 sm:justify-center"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-4 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.detail}</p>
            </div>
            {i < journey.length - 1 && (
              <ArrowRight
                className="ml-auto size-4 shrink-0 rotate-90 text-muted-foreground/40 sm:ml-2 sm:rotate-0"
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
