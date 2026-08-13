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

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { MetaSignupMode } from "./meta-embedded-signup-sdk";

type WhatsAppConnectionGuideProps = {
  isConnected: boolean;
  busy: boolean;
  actionLabel: (mode: MetaSignupMode) => string;
  onConnect: (mode: MetaSignupMode) => void;
};

const PREPARATION: Record<
  MetaSignupMode,
  { title: string; description: string; items: readonly string[] }
> = {
  coexistence: {
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
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Étape 1 sur 2
        </p>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          Ce numéro est-il déjà utilisé dans WhatsApp Business ?
        </h3>
        <p className="mt-1 max-w-[60ch] text-sm leading-6 text-muted-foreground">
          Choisissez votre situation. Rien ne sera modifié avant votre confirmation
          dans la fenêtre Meta.
        </p>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={() => setSelectedMode("coexistence")}
            className="group flex min-h-20 w-full items-center gap-4 rounded-lg border border-primary/40 bg-background p-4 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">
                  Oui, je garde mon numéro actuel
                </span>
                <Badge variant="secondary" className="text-xs">
                  Recommandé
                </Badge>
              </span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                L’application, les contacts et les conversations restent disponibles.
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={() => setSelectedMode("cloud_api")}
            className="group flex min-h-20 w-full items-center gap-4 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-foreground">
                Non, j’utilise un nouveau numéro
              </span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                Ce numéro ne doit être relié à aucun compte WhatsApp.
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>
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

  const preparation = PREPARATION[selectedMode];

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Étape 2 sur 2
        </p>
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

      <h3 className="mt-1 text-base font-semibold text-foreground">
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
