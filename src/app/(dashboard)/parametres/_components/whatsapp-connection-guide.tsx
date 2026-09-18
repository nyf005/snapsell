"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Plus,
  Smartphone,
  Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
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
 * connexion : sans lui, il faut revenir en arrière pour se souvenir de ce
 * qu'on a choisi.
 */
const MODES: Record<
  MetaSignupMode,
  {
    icon: LucideIcon;
    choice: string;
    title: string;
    description: string;
    items: readonly string[];
  }
> = {
  coexistence: {
    icon: Smartphone,
    choice: "Numéro WhatsApp Business actuel",
    title: "Gardez votre numéro et votre application",
    description:
      "SnapSell se connecte à votre compte actuel. Vous continuez à utiliser WhatsApp Business comme aujourd’hui.",
    items: [
      "Gardez votre téléphone avec WhatsApp Business à jour à portée de main.",
      "Utilisez le compte Facebook qui gère votre entreprise.",
    ],
  },
  cloud_api: {
    icon: Plus,
    choice: "Nouveau numéro",
    title: "Connectez votre nouveau numéro",
    description:
      "Meta va créer la connexion WhatsApp de ce numéro pour SnapSell.",
    items: [
      "Utilisez un numéro qui n’est relié à aucun compte WhatsApp.",
      "Gardez ce téléphone près de vous pour recevoir le code par SMS ou appel.",
      "Utilisez le compte Facebook qui gère votre entreprise.",
    ],
  },
};

type Situation = MetaSignupMode | "personal" | "provider";

const SITUATIONS: { id: Situation; title: string; description: string; icon: LucideIcon }[] = [
  { id: "coexistence", title: "J’utilise WhatsApp Business", description: "Je garde mon numéro et mon application pour discuter avec ma clientèle.", icon: Smartphone },
  { id: "personal", title: "J’utilise WhatsApp personnel", description: "Je souhaite utiliser mon numéro personnel pour mon activité.", icon: MessageCircle },
  { id: "cloud_api", title: "Je souhaite connecter un nouveau numéro", description: "Ce numéro n’est encore relié à aucun compte WhatsApp.", icon: Plus },
  { id: "provider", title: "Mon numéro est connecté à un autre logiciel", description: "Je souhaite préparer son transfert vers SnapSell.", icon: Link2 },
];

function ConnectionProgress({ step }: { step: 1 | 2 }) {
  return (
    <ol aria-label="Connexion WhatsApp" className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm">
      {["Votre situation", "Connexion"].map((label, index) => (
        <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={cn("flex items-center gap-3", step === index + 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {index > 0 && <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />}
          <span>{index + 1}. {label}</span>
          <span className="sr-only">{index + 1 < step ? "terminée" : index + 1 === step ? "étape en cours" : "à venir"}</span>
        </li>
      ))}
    </ol>
  );
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
  const [selectedMode, setSelectedMode] = useState<Situation | null>(null);
  const [choice, setChoice] = useState<Situation | null>(null);
  const [isChangingConnection, setIsChangingConnection] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setSelectedMode(null);
      setChoice(null);
      setIsChangingConnection(false);
    }
  }, [isConnected]);

  if (isConnected && !isChangingConnection) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-2 text-sm text-muted-foreground">Connexion terminée</p>
        <p className="mb-3 text-sm">Votre numéro est connecté. Si une récupération des anciennes discussions a été demandée, son état apparaît séparément.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setIsChangingConnection(true)}
          className="ml-auto flex min-h-11"
        >
          Modifier la connexion
        </Button>
      </div>
    );
  }

  if (selectedMode === null) {
    return (
      <div className="pt-1">
        <ConnectionProgress step={1} />
        <fieldset disabled={busy}>
          <legend className="text-base font-semibold text-foreground">Quelle est votre situation ?</legend>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Choisissez le cas qui correspond au numéro à connecter.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {SITUATIONS.map(({ id, title, description, icon: Icon }) => (
              <label key={id} className={cn(
                "relative flex items-start gap-3 rounded-lg border p-4 transition-colors motion-reduce:transition-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                choice === id ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40 hover:bg-muted/30",
                busy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              )}>
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{title}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span>
                </span>
                <input type="radio" name="whatsapp-situation" value={id} checked={choice === id} onChange={() => setChoice(id)} aria-label={title} className="mt-0.5 size-4 shrink-0 accent-primary" />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted-foreground">Rien ne sera modifié avant votre confirmation dans la fenêtre Meta.</p>
          <Button type="button" disabled={busy || choice === null} onClick={() => setSelectedMode(choice)} className="min-h-11 w-full sm:ml-auto sm:w-auto">
            Continuer <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {isConnected && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsChangingConnection(false)}
            className="mt-3 ml-auto flex min-h-11"
          >
            Annuler
          </Button>
        )}
      </div>
    );
  }

  if (selectedMode === "personal" || selectedMode === "provider") {
    const personal = selectedMode === "personal";
    return (
      <section className="mt-5 space-y-4 border-t border-border pt-5" aria-label="Préparer votre connexion">
        <ConnectionProgress step={2} />
        <Button type="button" variant="ghost" className="ml-auto flex min-h-11" disabled={busy} onClick={() => { setSelectedMode(null); }}>
          <ArrowLeft className="size-4" aria-hidden="true" /> Changer de choix
        </Button>
        <h3 className="text-base font-semibold">{personal ? "Passez d’abord à WhatsApp Business" : "Préparons le changement de logiciel"}</h3>
        {personal ? (
          <>
            <p className="text-sm leading-6">Pour garder votre numéro et discuter depuis votre téléphone, transférez votre compte vers WhatsApp Business avant de connecter SnapSell.</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
              <li>Sauvegardez vos discussions dans WhatsApp personnel.</li>
              <li>Installez l’application officielle WhatsApp Business depuis l’App Store ou Google Play.</li>
              <li>Utilisez le même numéro et suivez le transfert proposé, sans supprimer votre compte WhatsApp.</li>
              <li>Vérifiez vos discussions et complétez votre profil professionnel.</li>
            </ol>
            <p className="text-sm leading-6">Ce numéro sera utilisé dans WhatsApp Business. Pour conserver un WhatsApp personnel séparé, utilisez un autre numéro pour votre activité.</p>
            <a className="inline-block min-h-11 py-2 text-sm text-primary underline" href="https://faq.whatsapp.com/3059780464322392/" target="_blank" rel="noopener noreferrer">Lire le guide officiel WhatsApp (nouvel onglet)</a>
            <p className="text-sm text-muted-foreground">Meta vérifiera ensuite si votre compte peut être connecté. Le transfert ne garantit pas une connexion immédiate.</p>
            <div className="flex flex-col gap-2 sm:items-end">
              <Button type="button" disabled={busy} className="h-auto min-h-11 whitespace-normal py-3" onClick={() => setSelectedMode("coexistence")}>J’ai installé WhatsApp Business</Button>
              <Button type="button" variant="outline" disabled={busy} className="h-auto min-h-11 whitespace-normal py-3" onClick={() => setSelectedMode("cloud_api")}>Utiliser un nouveau numéro</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-6">Contactez l’assistance avec le nom du logiciel actuel. Nous vérifierons comment connecter votre numéro à SnapSell et ce qui peut être conservé.</p>
            <p className="text-sm leading-6">Gardez votre connexion actuelle active jusqu’à ce que les étapes du transfert soient confirmées.</p>
            <div className="flex justify-end"><Button asChild className="min-h-11 w-full sm:w-auto"><Link href="/aide">Contacter l’assistance</Link></Button></div>
          </>
        )}
      </section>
    );
  }

  const connection = MODES[selectedMode];
  const ChoiceIcon = connection.icon;

  return (
    <div className="pt-1">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <ConnectionProgress step={2} />
        <Button type="button" variant="ghost" size="sm" className="ml-auto min-h-11" onClick={() => setSelectedMode(null)} disabled={busy}>
          <ArrowLeft className="size-4" aria-hidden="true" /> Changer de choix
        </Button>
      </div>
      <p className="inline-flex max-w-full items-center gap-2 text-sm text-muted-foreground">
        <ChoiceIcon className="size-4 shrink-0" aria-hidden="true" />
        {connection.choice}
      </p>
      <h3 className="mt-3 text-base font-semibold text-foreground">{connection.title}</h3>
      <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">{connection.description}</p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6">
        {connection.items.map((item) => <li key={item}>{item}</li>)}
      </ul>

      {selectedMode === "coexistence" && (
        <div className="mt-4 max-w-[65ch] space-y-2 text-sm leading-6 text-muted-foreground">
          <p>Sur téléphone, choisissez « Utiliser plutôt un code d’accès » dans Meta, puis confirmez ce code dans le message Facebook Business de WhatsApp Business. Sur ordinateur, scannez le QR avec votre téléphone.</p>
          <p>Le partage de vos anciennes discussions est facultatif ; leur récupération peut prendre quelques minutes.</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-muted-foreground">Une fenêtre Meta va s’ouvrir. Terminez la connexion, puis revenez ici.</p>
        <Button type="button" onClick={() => onConnect(selectedMode)} disabled={busy} className="min-h-11 w-full font-semibold sm:ml-auto sm:w-auto">
          <MessageCircle className="size-4" aria-hidden="true" />
          {actionLabel(selectedMode)}
        </Button>
      </div>
    </div>
  );
}
