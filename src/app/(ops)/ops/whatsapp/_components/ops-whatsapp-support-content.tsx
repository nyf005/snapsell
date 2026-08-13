"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  History,
  Info,
  MessageCircle,
  MessageSquareWarning,
  PauseCircle,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Unplug,
  Wrench,
} from "lucide-react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Stepper, type StepperItem } from "~/components/ui/stepper";
import { useDebounce } from "~/hooks/use-debounce";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  getGuidedDiagnosis,
  SUPPORT_ISSUES,
  type GuidanceAction,
  type GuidanceTone,
  type MetaTestState,
  type SupportIssueId,
} from "./support-guidance";

type Diagnostic = RouterOutputs["ops"]["whatsapp"]["diagnostic"];

const ISSUE_ICON = {
  connection: PlugZap,
  messages: MessageSquareWarning,
  history: History,
  interrupted: Unplug,
} satisfies Record<SupportIssueId, typeof PlugZap>;

const TONE_CLASS: Record<GuidanceTone, string> = {
  success: "border-success/35 bg-success/5",
  warning: "border-warning/40 bg-warning/5",
  danger: "border-destructive/35 bg-destructive/5",
  info: "border-info/35 bg-info/5",
};

const TONE_ICON_CLASS: Record<GuidanceTone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-foreground",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/12 text-info",
};

function formatDate(value: Date | null) {
  if (!value) return "Non disponible";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function syncLabel(value: string | null) {
  switch (value) {
    case "requested":
      return "Demandée";
    case "in_progress":
      return "En cours";
    case "completed":
      return "Terminée";
    case "declined":
      return "Refusée";
    case "failed":
      return "Échouée";
    default:
      return "Non lancée";
  }
}

function interventionLabel(eventType: string) {
  if (eventType === "assistant.paused") return "Assistant mis en pause";
  if (eventType === "assistant.activated") return "Assistant activé par la boutique";
  if (eventType === "assistant.message_suppressed") return "Réponse automatique bloquée";
  if (eventType === "ops.whatsapp_connection_tested") {
    return "Connexion Meta testée";
  }
  if (eventType === "ops.whatsapp_sync_retried") {
    return "Reprise de l’historique relancée";
  }
  return "Configuration WhatsApp modifiée";
}

function StatusRow({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right text-sm font-semibold text-foreground",
          tone === "success" && "text-success",
          tone === "warning" && "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SupportConfiguration({ diagnostic }: { diagnostic: Diagnostic }) {
  const utils = api.useUtils();
  const [phoneNumberId, setPhoneNumberId] = useState(
    diagnostic.phoneNumberId ?? "",
  );
  const [wabaId, setWabaId] = useState(diagnostic.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhoneNumberId(diagnostic.phoneNumberId ?? "");
    setWabaId(diagnostic.wabaId ?? "");
    setAccessToken("");
    setSuccess(null);
    setError(null);
  }, [diagnostic.id, diagnostic.phoneNumberId, diagnostic.wabaId]);

  const updateConfig = api.ops.whatsapp.updateConfig.useMutation({
    onSuccess: async () => {
      setError(null);
      setSuccess("Configuration validée par Meta et enregistrée.");
      setAccessToken("");
      await Promise.all([
        utils.ops.whatsapp.diagnostic.invalidate({ tenantId: diagnostic.id }),
        utils.ops.whatsapp.list.invalidate(),
      ]);
    },
    onError: (mutationError) => {
      setSuccess(null);
      setError(mutationError.message);
    },
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        updateConfig.mutate({
          tenantId: diagnostic.id,
          phoneNumberId,
          wabaId,
          ...(accessToken ? { accessToken } : {}),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ops-phone-number-id">Phone Number ID</Label>
          <Input
            id="ops-phone-number-id"
            value={phoneNumberId}
            onChange={(event) => setPhoneNumberId(event.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ops-waba-id">WABA ID</Label>
          <Input
            id="ops-waba-id"
            value={wabaId}
            onChange={(event) => setWabaId(event.target.value)}
            autoComplete="off"
            required
          />
        </div>
      </div>
      <div className="max-w-xl space-y-2">
        <Label htmlFor="ops-access-token">Access Token</Label>
        <Input
          id="ops-access-token"
          type="password"
          value={accessToken}
          onChange={(event) => setAccessToken(event.target.value)}
          autoComplete="off"
          placeholder={
            diagnostic.hasAccessToken
              ? "Laisser vide pour conserver le token actuel"
              : "Requis pour la première configuration"
          }
        />
        <p className="text-sm leading-5 text-muted-foreground">
          Le token n’est jamais affiché. Une nouvelle valeur remplace le secret
          chiffré existant.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-success/40 bg-success/10">
          <CheckCircle2 className="text-success" aria-hidden="true" />
          <AlertDescription className="text-foreground">
            {success}
          </AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={
          updateConfig.isPending || !phoneNumberId.trim() || !wabaId.trim()
        }
        className="min-h-11 w-full sm:w-auto"
      >
        {updateConfig.isPending
          ? "Validation en cours…"
          : "Enregistrer la configuration"}
      </Button>
    </form>
  );
}

function TechnicalDetails({
  diagnostic,
  open,
  onOpenChange,
}: {
  diagnostic: Diagnostic;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = api.useUtils();

  return (
    <details
      id="technical-details"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
      className="rounded-xl border border-border bg-background"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Wrench className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">Détails techniques</span>
        <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
          Identifiants Meta et interventions
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-8 border-t border-border p-4 sm:p-6">
        <section aria-labelledby="technical-status-heading">
          <h3
            id="technical-status-heading"
            className="text-base font-semibold text-foreground"
          >
            État enregistré
          </h3>
          <dl className="mt-2 border-y border-border">
            <StatusRow label="Abonnement" value={diagnostic.subscriptionPlan} />
            <StatusRow
              label="Assistant"
              value={
                diagnostic.assistant.state === "active"
                  ? "Actif"
                  : diagnostic.assistant.state === "unavailable"
                    ? "Indisponible"
                    : "En pause"
              }
              tone={diagnostic.assistant.state === "active" ? "success" : "warning"}
            />
            <StatusRow
              label="Phone Number ID"
              value={diagnostic.phoneNumberId ?? "Absent"}
              tone={diagnostic.phoneNumberId ? "success" : "warning"}
            />
            <StatusRow
              label="WABA ID"
              value={diagnostic.wabaId ?? "Absent"}
              tone={diagnostic.wabaId ? "success" : "warning"}
            />
            <StatusRow
              label="Access Token"
              value={diagnostic.hasAccessToken ? "Présent et chiffré" : "Absent"}
              tone={diagnostic.hasAccessToken ? "success" : "warning"}
            />
            <StatusRow
              label="Coexistence"
              value={
                diagnostic.coexistence === true
                  ? "Active"
                  : diagnostic.coexistence === false
                    ? "Inactive"
                    : "Indéterminée"
              }
            />
            <StatusRow
              label="Historique"
              value={syncLabel(diagnostic.historySyncStatus)}
            />
            <StatusRow
              label="Contacts"
              value={syncLabel(diagnostic.contactsSyncStatus)}
            />
            <StatusRow
              label="Début de la reprise"
              value={formatDate(diagnostic.historySyncAt)}
            />
            <StatusRow
              label="Dernière modification"
              value={formatDate(diagnostic.updatedAt)}
            />
          </dl>
        </section>

        <section aria-labelledby="credentials-heading" className="space-y-4">
          <div>
            <h3
              id="credentials-heading"
              className="text-base font-semibold text-foreground"
            >
              Corriger les identifiants Meta
            </h3>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">
              Réservé aux interventions techniques. Meta valide les valeurs avant
              l’enregistrement et SnapSell journalise les champs modifiés.
            </p>
          </div>
          <Alert className="border-warning/40 bg-warning/10">
            <ShieldCheck aria-hidden="true" />
            <AlertDescription className="text-foreground">
              Ne remplacez un identifiant que si sa nouvelle valeur a été confirmée
              dans Meta Business.
            </AlertDescription>
          </Alert>
          <SupportConfiguration diagnostic={diagnostic} />
        </section>

        <section aria-labelledby="interventions-heading">
          <div className="flex items-center justify-between gap-3">
            <h3
              id="interventions-heading"
              className="text-base font-semibold text-foreground"
            >
              Interventions récentes
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                void utils.ops.whatsapp.diagnostic.invalidate({
                  tenantId: diagnostic.id,
                })
              }
            >
              Actualiser
            </Button>
          </div>
          {diagnostic.recentInterventions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune intervention manuelle enregistrée.
            </p>
          ) : (
            <ol className="mt-3 divide-y divide-border border-y border-border">
              {diagnostic.recentInterventions.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {interventionLabel(event.eventType)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Action du support enregistrée
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(event.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </details>
  );
}

function DiagnosisIcon({ tone }: { tone: GuidanceTone }) {
  if (tone === "success") return <CheckCircle2 aria-hidden="true" />;
  if (tone === "danger") return <CircleAlert aria-hidden="true" />;
  if (tone === "warning") return <Clock3 aria-hidden="true" />;
  return <Info aria-hidden="true" />;
}

function GuidedDiagnostic({ diagnostic }: { diagnostic: Diagnostic }) {
  const utils = api.useUtils();
  const [issue, setIssue] = useState<SupportIssueId | null>(null);
  const [diagnosisStarted, setDiagnosisStarted] = useState(false);
  const [metaTest, setMetaTest] = useState<MetaTestState>({ status: "idle" });
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setIssue(null);
    setDiagnosisStarted(false);
    setMetaTest({ status: "idle" });
    setTechnicalOpen(false);
    setCopied(false);
    setActionMessage(null);
  }, [diagnostic.id]);

  const testConnection = api.ops.whatsapp.testConnection.useMutation({
    onSuccess: async () => {
      setMetaTest({ status: "success" });
      setDiagnosisStarted(true);
      setActionMessage(null);
      await utils.ops.whatsapp.diagnostic.invalidate({ tenantId: diagnostic.id });
    },
    onError: (error) => {
      setMetaTest({ status: "error", message: error.message });
      setDiagnosisStarted(true);
      setActionMessage(null);
    },
  });

  const retrySync = api.ops.whatsapp.retryHistorySync.useMutation({
    onSuccess: async () => {
      setActionMessage(
        "La reprise a été relancée. Les premiers résultats peuvent prendre quelques minutes.",
      );
      await utils.ops.whatsapp.diagnostic.invalidate({ tenantId: diagnostic.id });
    },
    onError: (error) => setActionMessage(error.message),
  });
  const pauseAssistant = api.ops.whatsapp.pauseAssistant.useMutation({
    onSuccess: async () => {
      setActionMessage("L’assistant a été mis en pause. La boutique devra le réactiver elle-même.");
      await utils.ops.whatsapp.diagnostic.invalidate({ tenantId: diagnostic.id });
    },
    onError: (error) => setActionMessage(error.message),
  });

  const diagnosis = useMemo(
    () =>
      issue
        ? getGuidedDiagnosis({ issue, diagnostic, metaTest })
        : null,
    [diagnostic, issue, metaTest],
  );

  const stepperItems: StepperItem[] = [
    {
      id: "problem",
      label: "Problème",
      state: issue ? "done" : "current",
    },
    {
      id: "diagnostic",
      label: "Diagnostic",
      state: !issue ? "upcoming" : diagnosisStarted ? "done" : "current",
    },
    {
      id: "solution",
      label: "Solution",
      state: diagnosisStarted ? "current" : "upcoming",
    },
  ];

  const selectIssue = (nextIssue: SupportIssueId) => {
    setIssue(nextIssue);
    setDiagnosisStarted(false);
    setMetaTest({ status: "idle" });
    setCopied(false);
    setActionMessage(null);
  };

  const startDiagnosis = () => {
    if (!issue) return;
    setActionMessage(null);
    if (issue !== "history" && diagnostic.connected) {
      testConnection.mutate({ tenantId: diagnostic.id });
      return;
    }
    setDiagnosisStarted(true);
  };

  const copySellerMessage = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setActionMessage("Message copié. Vous pouvez maintenant l’envoyer à la boutique.");
    } catch {
      setCopied(false);
      setActionMessage(
        "La copie automatique a échoué. Sélectionnez le message puis copiez-le manuellement.",
      );
    }
  };

  const runAction = async (action: GuidanceAction) => {
    if (!diagnosis) return;
    setActionMessage(null);
    if (action === "test_meta") {
      testConnection.mutate({ tenantId: diagnostic.id });
      return;
    }
    if (action === "copy_message" && diagnosis.sellerMessage) {
      await copySellerMessage(diagnosis.sellerMessage);
      return;
    }
    if (action === "retry_sync") {
      retrySync.mutate({ tenantId: diagnostic.id });
      return;
    }
    if (action === "refresh") {
      await utils.ops.whatsapp.diagnostic.invalidate({ tenantId: diagnostic.id });
      setActionMessage("Le diagnostic a été actualisé.");
      return;
    }
    setTechnicalOpen(true);
    window.requestAnimationFrame(() => {
      document
        .getElementById("technical-details")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const isBusy = testConnection.isPending || retrySync.isPending || pauseAssistant.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">
              {diagnostic.name}
            </h2>
            <Badge variant={diagnostic.connected ? "success" : "destructive"}>
              {diagnostic.connected ? "Connectée" : "Connexion incomplète"}
            </Badge>
            <Badge variant={diagnostic.assistant.state === "active" ? "success" : "outline"}>
              Assistant {diagnostic.assistant.state === "active" ? "actif" : "en pause"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {diagnostic.ownerEmail ?? "Propriétaire non identifié"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
        {diagnostic.assistant.enabled && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => pauseAssistant.mutate({ tenantId: diagnostic.id })}
            disabled={pauseAssistant.isPending}
          >
            <PauseCircle className="size-4" aria-hidden="true" />
            {pauseAssistant.isPending ? "Mise en pause…" : "Mettre en pause"}
          </Button>
        )}
        {issue && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 justify-start sm:justify-center"
            onClick={() => {
              setIssue(null);
              setDiagnosisStarted(false);
              setActionMessage(null);
            }}
          >
            Changer de problème
          </Button>
        )}
        </div>
      </div>

      <div className="space-y-2 sm:hidden">
        <Stepper
          label="Parcours de résolution"
          items={stepperItems}
          className="w-full"
        />
        <p className="text-sm font-medium text-foreground">
          {stepperItems.find((item) => item.state === "current")?.label}
          <span className="font-normal text-muted-foreground">
            {` · Étape ${stepperItems.findIndex((item) => item.state === "current") + 1} sur 3`}
          </span>
        </p>
      </div>
      <Stepper
        label="Parcours de résolution"
        items={stepperItems}
        showLabels
        className="hidden w-full justify-between sm:flex"
      />

      {!issue ? (
        <fieldset>
          <legend className="text-lg font-semibold text-foreground">
            Quel problème rencontre la boutique ?
          </legend>
          <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">
            Choisissez la situation la plus proche. Le diagnostic n’effectue aucune
            modification sans votre accord.
          </p>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {SUPPORT_ISSUES.map((item) => {
              const Icon = ISSUE_ICON[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectIssue(item.id)}
                  className="group flex min-h-20 w-full items-center gap-4 px-1 py-4 text-left transition-colors duration-200 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:px-3"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-sm leading-5 text-muted-foreground">
                      {item.description}
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
        </fieldset>
      ) : !diagnosisStarted ? (
        <section aria-labelledby="ready-diagnostic-heading" className="space-y-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Problème sélectionné
            </p>
            <h3
              id="ready-diagnostic-heading"
              className="mt-2 text-lg font-semibold text-foreground"
            >
              {SUPPORT_ISSUES.find((item) => item.id === issue)?.title}
            </h3>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 text-muted-foreground">
              {diagnosis?.summary}
            </p>
          </div>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={testConnection.isPending}
            onClick={startDiagnosis}
          >
            {testConnection.isPending ? (
              <>
                <RefreshCw className="animate-spin" aria-hidden="true" />
                Vérification auprès de Meta…
              </>
            ) : (
              <>
                <ShieldCheck aria-hidden="true" />
                Lancer le diagnostic
              </>
            )}
          </Button>
        </section>
      ) : diagnosis ? (
        <section aria-labelledby="diagnosis-result-heading" className="space-y-6">
          <div
            className={cn(
              "rounded-xl border p-4 sm:p-5",
              TONE_CLASS[diagnosis.tone],
            )}
          >
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full [&>svg]:size-5",
                  TONE_ICON_CLASS[diagnosis.tone],
                )}
              >
                <DiagnosisIcon tone={diagnosis.tone} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Résultat du diagnostic
                </p>
                <h3
                  id="diagnosis-result-heading"
                  className="mt-1 text-xl font-bold text-foreground"
                >
                  {diagnosis.title}
                </h3>
                <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground sm:text-base">
                  {diagnosis.summary}
                </p>
              </div>
            </div>

            <ul className="mt-5 divide-y divide-border/70 border-y border-border/70">
              {diagnosis.checks.map((check) => (
                <li
                  key={check.label}
                  className="flex min-h-12 items-start gap-3 py-3 sm:items-center"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full",
                      TONE_ICON_CLASS[check.tone],
                    )}
                  >
                    {check.tone === "success" ? (
                      <Check className="size-3" aria-hidden="true" />
                    ) : check.tone === "danger" ? (
                      <CircleAlert className="size-3" aria-hidden="true" />
                    ) : (
                      <Info className="size-3" aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <span className="block text-sm font-medium text-foreground">
                      {check.label}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground sm:mt-0 sm:text-right">
                      {check.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {metaTest.status === "error" && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>
                Meta a répondu : {metaTest.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Prochaine action
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Une seule action est recommandée pour éviter les manipulations
                inutiles.
              </p>
            </div>
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={isBusy}
              onClick={() => void runAction(diagnosis.action)}
            >
              {isBusy ? (
                <>
                  <RefreshCw className="animate-spin" aria-hidden="true" />
                  Traitement en cours…
                </>
              ) : diagnosis.action === "copy_message" ? (
                copied ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )
              ) : diagnosis.action === "retry_sync" ||
                diagnosis.action === "refresh" ||
                diagnosis.action === "test_meta" ? (
                <RefreshCw aria-hidden="true" />
              ) : (
                <Wrench aria-hidden="true" />
              )}
              {copied && diagnosis.action === "copy_message"
                ? "Message copié"
                : diagnosis.actionLabel}
            </Button>
          </div>

          {diagnosis.sellerMessage && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Message à envoyer à la boutique
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  onClick={() => void copySellerMessage(diagnosis.sellerMessage!)}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? "Copié" : "Copier"}
                </Button>
              </div>
              <p className="rounded-xl border border-border bg-muted/35 p-4 text-sm leading-6 text-foreground">
                {diagnosis.sellerMessage}
              </p>
            </div>
          )}

          <div aria-live="polite">
            {actionMessage && (
              <Alert
                className={cn(
                  actionMessage.includes("échoué") ||
                    actionMessage.includes("n’a pas")
                    ? "border-destructive/40"
                    : "border-success/40 bg-success/5",
                )}
              >
                <AlertDescription className="text-foreground">
                  {actionMessage}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </section>
      ) : null}

      <TechnicalDetails
        diagnostic={diagnostic}
        open={technicalOpen}
        onOpenChange={setTechnicalOpen}
      />
    </div>
  );
}

function DiagnosticSkeleton() {
  return (
    <div className="space-y-6" aria-label="Chargement du diagnostic">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-6 w-44" variant="text" />
        <Skeleton className="h-4 w-56" variant="text" />
      </div>
      <div className="flex gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-7 flex-1" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" variant="card" />
    </div>
  );
}

export function OpsWhatsAppSupportContent() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const tenants = api.ops.whatsapp.list.useQuery({ query: debouncedQuery });
  const diagnostic = api.ops.whatsapp.diagnostic.useQuery(
    { tenantId: tenantId ?? "" },
    { enabled: tenantId !== null },
  );

  return (
    <main className="min-h-0 flex-1 overflow-auto bg-background text-foreground">
      <div className="space-y-8 p-4 sm:p-6 md:p-8">
        <header className="border-b border-border pb-6">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Assistance WhatsApp
            </h1>
          </div>
          <p className="mt-2 max-w-[65ch] text-base leading-6 text-muted-foreground">
            Sélectionnez une boutique, décrivez son problème et suivez la prochaine
            action recommandée.
          </p>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(17rem,0.7fr)_minmax(0,1.55fr)]">
          <Card className="h-fit gap-0 overflow-hidden py-0">
            <CardHeader className="border-b border-border py-5">
              <CardTitle className="text-base">Boutiques</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Rechercher une boutique"
                  placeholder="Nom, email ou numéro"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-h-11 pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[36rem] overflow-y-auto p-0">
              {tenants.isLoading ? (
                <div className="space-y-1 p-3" aria-label="Chargement des boutiques">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : tenants.error ? (
                <Alert variant="destructive" className="m-4 w-auto">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>
                    Les boutiques n’ont pas pu être chargées. Actualisez la page pour
                    réessayer.
                  </AlertDescription>
                </Alert>
              ) : tenants.data?.length === 0 ? (
                <Empty className="min-h-44 border-0 p-5">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Store />
                    </EmptyMedia>
                    <EmptyTitle>Aucune boutique trouvée</EmptyTitle>
                    <EmptyDescription>
                      Modifiez la recherche ou attendez la création d’une boutique.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul className="divide-y divide-border">
                  {tenants.data?.map((tenant) => (
                    <li key={tenant.id}>
                      <button
                        type="button"
                        aria-pressed={tenantId === tenant.id}
                        onClick={() => setTenantId(tenant.id)}
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                          tenantId === tenant.id && "bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            tenantId === tenant.id
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Store className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {tenant.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {tenant.ownerEmail ?? "Email indisponible"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full",
                            tenant.connected
                              ? "bg-success/10 text-success"
                              : "bg-destructive/10 text-destructive",
                          )}
                          aria-label={
                            tenant.connected
                              ? "WhatsApp connecté"
                              : "Connexion WhatsApp incomplète"
                          }
                        >
                          {tenant.connected ? (
                            <Check className="size-3.5" aria-hidden="true" />
                          ) : (
                            <CircleAlert className="size-3.5" aria-hidden="true" />
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[30rem]">
            <CardContent className="px-4 sm:px-6">
              {!tenantId ? (
                <Empty className="min-h-[26rem] border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Store />
                    </EmptyMedia>
                    <EmptyTitle>Sélectionnez une boutique</EmptyTitle>
                    <EmptyDescription>
                      Son assistant de diagnostic apparaîtra ici. Aucune action ne sera
                      lancée automatiquement.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : diagnostic.isLoading ? (
                <DiagnosticSkeleton />
              ) : diagnostic.error ? (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>
                    Le diagnostic n’a pas pu être chargé. Sélectionnez à nouveau la
                    boutique ou actualisez la page.
                  </AlertDescription>
                </Alert>
              ) : diagnostic.data ? (
                <GuidedDiagnostic diagnostic={diagnostic.data} />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
