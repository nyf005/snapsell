"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MessageCircle,
  Plus,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Stepper } from "~/components/ui/stepper";
import type { StepperItem } from "~/components/ui/stepper";
import { cn } from "~/lib/utils";
import type { MetaSignupMode } from "./meta-embedded-signup-sdk";

type WhatsAppConnectionGuideProps = {
  isConnected: boolean;
  busy: boolean;
  actionLabel: (mode: MetaSignupMode) => string;
  onConnect: (mode: MetaSignupMode) => void;
};

/**
 * Les deux portes du parcours. `choice` est le rappel court affiché à l'étape de
 * préparation : sans lui, il faut revenir en arrière pour se souvenir de ce
 * qu'on a choisi.
 */
const MODES: Record<
  MetaSignupMode,
  {
    icon: LucideIcon;
    choice: string;
    recommended: boolean;
    title: string;
    description: string;
    items: readonly string[];
  }
> = {
  coexistence: {
    icon: Smartphone,
    choice: "Numéro WhatsApp Business actuel",
    recommended: true,
    title: "Gardez votre numéro et votre application",
    description:
      "SnapSell se connecte à votre compte actuel. Vous continuez à utiliser WhatsApp Business comme aujourd’hui.",
    items: [
      "Mettez l’application WhatsApp Business à jour sur votre téléphone.",
      "Gardez votre téléphone et l’application ouverts pendant la connexion.",
      "Utilisez le compte Facebook qui gère votre entreprise.",
      "Dans WhatsApp Business, acceptez la connexion et choisissez si vous partagez votre historique.",
    ],
  },
  cloud_api: {
    icon: Plus,
    choice: "Nouveau numéro",
    recommended: false,
    title: "Préparez votre nouveau numéro",
    description:
      "Meta va créer la connexion WhatsApp de ce numéro pour SnapSell.",
    items: [
      "Utilisez un numéro qui n’est relié à aucun compte WhatsApp.",
      "Gardez ce téléphone près de vous pour recevoir le code de vérification.",
      "Utilisez le compte Facebook qui gère votre entreprise.",
    ],
  },
};

function guideSteps(step: 1 | 2): StepperItem[] {
  return [
    {
      id: "situation",
      label: "Votre situation",
      state: step === 1 ? "current" : "done",
    },
    {
      id: "preparation",
      label: "Préparation",
      state: step === 1 ? "upcoming" : "current",
    },
  ];
}

/**
 * Petit parcours guidé avant la fenêtre Meta. Il explique uniquement ce que la
 * boutique doit choisir et préparer ; Meta reste responsable de l'autorisation.
 */
export function WhatsAppConnectionGuide({
  isConnected,
  busy,
  actionLabel,
  onConnect,
}: WhatsAppConnectionGuideProps) {
  const [selectedMode, setSelectedMode] = useState<MetaSignupMode | null>(null);
  const [isChangingConnection, setIsChangingConnection] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setSelectedMode(null);
      setIsChangingConnection(false);
    }
  }, [isConnected]);

  if (isConnected && !isChangingConnection) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsChangingConnection(true)}
          className="min-h-11"
        >
          Modifier la connexion
        </Button>
      </div>
    );
  }

  if (selectedMode === null) {
    return (
      <div className="mt-5 border-t border-border pt-5">
        <Stepper
          items={guideSteps(1)}
          label="Connexion WhatsApp"
          showLabels
          className="mb-4"
        />
        <h3 className="text-base font-semibold text-foreground">
          Ce numéro est-il déjà utilisé dans WhatsApp Business ?
        </h3>
        <p className="mt-1 max-w-[60ch] text-sm leading-6 text-muted-foreground">
          Choisissez votre situation. Rien ne sera modifié avant votre confirmation
          dans la fenêtre Meta.
        </p>

        <div className="mt-4 space-y-3">
          {(["coexistence", "cloud_api"] as const).map((mode) => {
            const meta = MODES[mode];
            const Icon = meta.icon;

            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSelectedMode(mode)}
                className={cn(
                  "group flex min-h-20 w-full items-center gap-4 rounded-lg border bg-background p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  meta.recommended
                    ? "border-primary/40 shadow-sm hover:border-primary hover:bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    meta.recommended
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {mode === "coexistence"
                        ? "Oui, je garde mon numéro actuel"
                        : "Non, j’utilise un nouveau numéro"}
                    </span>
                    {meta.recommended && (
                      <Badge variant="secondary" className="text-xs">
                        Recommandé
                      </Badge>
                    )}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                    {mode === "coexistence"
                      ? "L’application, les contacts et les conversations restent disponibles."
                      : "Ce numéro ne doit être relié à aucun compte WhatsApp."}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        {isConnected && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsChangingConnection(false)}
            className="mt-3 min-h-11"
          >
            Annuler
          </Button>
        )}
      </div>
    );
  }

  const preparation = MODES[selectedMode];
  const ChoiceIcon = preparation.icon;

  return (
    <div className="mt-5 border-t border-border pt-5">
      {/* Sur mobile, le rail garde sa ligne : partagée avec le retour, les deux
          libellés se réduisaient à une initiale. */}
      <div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <Stepper items={guideSteps(2)} label="Connexion WhatsApp" showLabels />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSelectedMode(null)}
          disabled={busy}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Changer de choix
        </Button>
      </div>

      {/* Le choix reste sous les yeux : plus besoin de revenir en arrière pour en douter. */}
      <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-muted/50 py-1 pl-2 pr-3 text-xs font-medium text-foreground">
        <ChoiceIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          {preparation.choice}
          {preparation.recommended && (
            <span className="hidden text-muted-foreground sm:inline">
              {" "}
              — recommandé
            </span>
          )}
        </span>
      </p>

      <h3 className="mt-3 text-base font-semibold text-foreground">
        {preparation.title}
      </h3>
      <p className="mt-1 max-w-[60ch] text-sm leading-6 text-muted-foreground">
        {preparation.description}
      </p>

      <ul className="mt-4 space-y-3">
        {preparation.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-5 text-foreground">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="size-3" aria-hidden="true" />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={() => onConnect(selectedMode)}
          disabled={busy}
          className="min-h-11 w-full font-semibold sm:w-auto"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {actionLabel(selectedMode)}
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          Une fenêtre Meta sécurisée va s’ouvrir par-dessus SnapSell.
        </p>
      </div>
    </div>
  );
}
