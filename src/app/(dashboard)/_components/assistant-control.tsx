"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, CheckCircle2, CircleAlert, PauseCircle } from "lucide-react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

const BLOCKER_COPY = {
  whatsapp: {
    text: "Connectez WhatsApp",
    href: "/parametres/whatsapp",
  },
  catalogue: {
    text: "Ajoutez un article disponible avec un prix",
    href: "/dashboard/catalogue",
  },
} as const;

const WARNING_COPY = {
  delivery: "Frais de livraison non définis",
  replies: "Réponses courantes non préparées",
  hours: "Horaires d’ouverture non définis",
} as const;

export function AssistantControl({
  canManage = true,
  compact = false,
}: {
  canManage?: boolean;
  compact?: boolean;
}) {
  const utils = api.useUtils();
  const { data: status, isLoading } = api.assistant.getStatus.useQuery();
  const [showActivation, setShowActivation] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status?.enabled) setShowActivation(false);
  }, [status?.enabled]);

  const mutation = api.assistant.setEnabled.useMutation({
    onSuccess: async (next) => {
      setError(null);
      setFeedback(
        next.enabled
          ? "L’assistant répond maintenant aux nouveaux messages."
          : "L’assistant est en pause. Les nouveaux messages continuent d’être reçus sans réponse automatique.",
      );
      setShowActivation(false);
      await Promise.all([
        utils.assistant.getStatus.invalidate(),
        utils.onboarding.getStatus.invalidate(),
      ]);
    },
    onError: (mutationError) => {
      setFeedback(null);
      setError(mutationError.message);
    },
  });

  if (isLoading || !status) {
    return <Skeleton className={cn("h-24 rounded-xl", compact && "h-20")} />;
  }

  const isActive = status.state === "active";
  const isUnavailable = status.state === "unavailable";
  const title = isActive
    ? "Assistant actif"
    : isUnavailable
      ? "Assistant indisponible"
      : "Assistant en pause";
  const detail = isActive
    ? "SnapSell répond aux nouveaux messages concernant les articles enregistrés."
    : isUnavailable
      ? "Reconnectez WhatsApp pour que l’assistant puisse répondre."
      : "SnapSell reçoit les messages, mais ne répond pas automatiquement à votre clientèle.";
  const Icon = isActive ? CheckCircle2 : isUnavailable ? CircleAlert : PauseCircle;

  const requestToggle = (checked: boolean) => {
    setFeedback(null);
    setError(null);
    if (!checked) {
      mutation.mutate({ enabled: false });
      return;
    }
    setShowActivation(true);
  };

  return (
    <section
      id="assistant-control"
      aria-labelledby="assistant-control-title"
      className={cn(
        "scroll-mt-24 rounded-xl border bg-surface",
        isUnavailable ? "border-warning/45" : "border-border",
        compact ? "p-4" : "p-4 sm:p-5",
      )}
    >
      <div className="flex items-start gap-3 sm:items-center">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            isActive
              ? "bg-success/10 text-success"
              : isUnavailable
                ? "bg-warning/10 text-foreground"
                : "bg-muted text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="assistant-control-title" className="text-sm font-bold text-foreground">
              Assistant WhatsApp
            </h2>
            <Badge
              variant={isActive ? "success" : "outline"}
              className={cn(isUnavailable && "border-warning/40 bg-warning/10")}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {title.replace("Assistant ", "")}
            </Badge>
          </div>
          <p className="mt-1 max-w-[65ch] text-sm leading-5 text-muted-foreground">
            {detail}
          </p>
        </div>
        <Switch
          checked={status.enabled}
          onCheckedChange={requestToggle}
          disabled={!canManage || mutation.isPending}
          aria-label={status.enabled ? "Mettre l’assistant en pause" : "Activer l’assistant"}
        />
      </div>

      {!canManage && (
        <p className="mt-3 text-xs text-muted-foreground">
          Seuls les rôles Propriétaire et Manager peuvent modifier cet état.
        </p>
      )}

      {showActivation && !status.enabled && (
        <div className="mt-4 border-t border-border pt-4">
          {status.blockers.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">
                Terminez ces étapes avant l’activation
              </p>
              <ul className="space-y-2 text-sm">
                {status.blockers.map((blocker) => (
                  <li key={blocker}>
                    <Link
                      href={BLOCKER_COPY[blocker].href}
                      className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
                    >
                      {BLOCKER_COPY[blocker].text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Répondre uniquement pour les articles enregistrés
                </p>
                <p className="mt-1 max-w-[65ch] text-sm leading-5 text-muted-foreground">
                  Un article inconnu ne sera jamais annoncé comme disponible ou épuisé. La conversation vous sera transmise.
                </p>
              </div>
              {status.warnings.length > 0 && (
                <div className="rounded-lg border border-warning/35 bg-warning/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">
                    À compléter ensuite
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {status.warnings.map((warning) => (
                      <li key={warning}>• {WARNING_COPY[warning]}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => mutation.mutate({ enabled: true })}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Activation…" : "Activer l’assistant"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setShowActivation(false)}
                >
                  Continuer en pause
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {feedback && (
        <Alert className="mt-4 border-success/35 bg-success/5">
          <CheckCircle2 className="text-success" aria-hidden="true" />
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
