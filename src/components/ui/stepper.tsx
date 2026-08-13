import { Check } from "lucide-react";

import { cn } from "~/lib/utils";

/**
 * Repère visuel de progression — pastilles, connecteurs et états, rien de plus.
 *
 * Volontairement pauvre : les descriptions, boutons, liens et cartes restent
 * dans les composants métier. Les deux parcours qui l'utilisent n'ont rien en
 * commun côté données (six étapes dérivées du serveur d'un côté, deux écrans
 * pilotés par un état local de l'autre) ; seul le langage visuel est partagé.
 */

export type StepperItemState = "done" | "current" | "upcoming";

export type StepperItem = {
  id: string;
  label: string;
  state: StepperItemState;
};

/** L'état n'est jamais porté par la seule couleur : il est aussi dit. */
const STATE_LABEL: Record<StepperItemState, string> = {
  done: "terminée",
  current: "étape en cours",
  upcoming: "à venir",
};

const BULLET_STATE_CLASS: Record<StepperItemState, string> = {
  done: "bg-success text-success-foreground",
  current: "bg-primary text-primary-foreground",
  upcoming: "border border-border bg-background text-muted-foreground",
};

type StepperBulletProps = {
  state: StepperItemState;
  /** Rang affiché, à partir de 1. */
  index: number;
  /**
   * Sur les rails de six étapes, un simple point suffit sur mobile : la pastille
   * numérotée n'apparaît qu'à partir de `sm`, où elle tient sans écraser l'écran.
   */
  responsive?: boolean;
  className?: string;
};

export function StepperBullet({
  state,
  index,
  responsive = false,
  className,
}: StepperBulletProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors duration-200 motion-reduce:transition-none",
        responsive ? "size-2.5 sm:size-7" : "size-7",
        BULLET_STATE_CLASS[state],
        className,
      )}
    >
      <span className={cn("items-center", responsive ? "hidden sm:flex" : "flex")}>
        {state === "done" ? <Check className="size-3.5" /> : index}
      </span>
    </span>
  );
}

type StepperProps = {
  items: StepperItem[];
  /** Nom du parcours, lu à la place des pastilles. */
  label: string;
  /** Affiche le libellé sous la pastille. À réserver aux parcours très courts. */
  showLabels?: boolean;
  /** Réduit les pastilles à des points sur mobile. */
  responsive?: boolean;
  className?: string;
};

export function Stepper({
  items,
  label,
  showLabels = false,
  responsive = false,
  className,
}: StepperProps) {
  return (
    <ol
      aria-label={label}
      className={cn(
        "flex items-center",
        // Un parcours nommé se lit en bloc, à gauche ; un rail muet occupe la
        // largeur pour que la position saute aux yeux.
        showLabels ? "gap-3" : "gap-2 sm:gap-1",
        className,
      )}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          aria-current={item.state === "current" ? "step" : undefined}
          className={cn(
            "flex min-w-0 items-center",
            showLabels && "gap-2",
            index < items.length - 1 &&
              !showLabels &&
              (responsive ? "sm:flex-1" : "flex-1"),
          )}
        >
          <StepperBullet
            state={item.state}
            index={index + 1}
            responsive={responsive}
          />
          <span
            className={cn(
              "truncate text-sm",
              showLabels
                ? item.state === "upcoming"
                  ? "text-muted-foreground"
                  : "font-medium text-foreground"
                : "sr-only",
            )}
          >
            {item.label}
          </span>
          <span className="sr-only">{STATE_LABEL[item.state]}</span>
          {index < items.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                "h-px",
                showLabels
                  ? "ml-1 w-6 sm:w-10"
                  : "mx-2 min-w-4 flex-1 sm:mx-1.5",
                responsive && "hidden sm:block",
                item.state === "done" ? "bg-success/40" : "bg-border",
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
