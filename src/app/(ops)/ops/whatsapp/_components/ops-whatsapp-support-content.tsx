"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  MessageCircle,
  Search,
  ShieldCheck,
  Store,
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
import { Spinner } from "~/components/ui/spinner";
import { useDebounce } from "~/hooks/use-debounce";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type Diagnostic = RouterOutputs["ops"]["whatsapp"]["diagnostic"];

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
  return eventType === "ops.whatsapp_connection_tested"
    ? "Connexion Meta testée"
    : "Configuration WhatsApp modifiée";
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
          tone === "warning" && "text-warning-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SupportConfiguration({ diagnostic }: { diagnostic: Diagnostic }) {
  const utils = api.useUtils();
  const [phoneNumberId, setPhoneNumberId] = useState(diagnostic.phoneNumberId ?? "");
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
      <div className="space-y-2">
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
        <p className="text-xs leading-5 text-muted-foreground">
          Le token n’est jamais relu dans cette console. Une nouvelle valeur remplace
          le secret chiffré existant.
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
          <AlertDescription className="text-foreground">{success}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={
          updateConfig.isPending || !phoneNumberId.trim() || !wabaId.trim()
        }
        className="min-h-11 w-full sm:w-auto"
      >
        {updateConfig.isPending ? "Validation en cours…" : "Enregistrer la configuration"}
      </Button>
    </form>
  );
}

function DiagnosticPanel({ diagnostic }: { diagnostic: Diagnostic }) {
  const utils = api.useUtils();
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const testConnection = api.ops.whatsapp.testConnection.useMutation({
    onSuccess: () => setTestMessage("La connexion Meta fonctionne."),
    onError: (error) => setTestMessage(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{diagnostic.name}</h2>
            <Badge variant={diagnostic.connected ? "success" : "destructive"}>
              {diagnostic.connected ? "Connectée" : "Incomplète"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {diagnostic.ownerEmail ?? "Propriétaire non identifié"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!diagnostic.connected || testConnection.isPending}
          onClick={() => {
            setTestMessage(null);
            testConnection.mutate({ tenantId: diagnostic.id });
          }}
        >
          {testConnection.isPending ? "Test en cours…" : "Tester la connexion"}
        </Button>
      </div>

      {testMessage && (
        <Alert>
          <AlertDescription>{testMessage}</AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="diagnostic-heading">
        <h3 id="diagnostic-heading" className="font-semibold text-foreground">
          Diagnostic
        </h3>
        <dl className="mt-2 border-y border-border">
          <StatusRow label="Abonnement" value={diagnostic.subscriptionPlan} />
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

      <details className="rounded-xl border border-border">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <KeyRound className="size-4 text-primary" aria-hidden="true" />
          Modifier les identifiants Meta
        </summary>
        <div className="border-t border-border p-4 sm:p-5">
          <Alert className="mb-5 bg-warning/10">
            <ShieldCheck className="text-warning-foreground" aria-hidden="true" />
            <AlertDescription>
              Intervention sensible. Meta valide les identifiants avant l’écriture et
              SnapSell journalise les champs modifiés.
            </AlertDescription>
          </Alert>
          <SupportConfiguration diagnostic={diagnostic} />
        </div>
      </details>

      <section aria-labelledby="interventions-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="interventions-heading" className="font-semibold text-foreground">
            Interventions récentes
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              void utils.ops.whatsapp.diagnostic.invalidate({ tenantId: diagnostic.id })
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
              <li key={event.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {interventionLabel(event.eventType)}
                  </p>
                  <p className="text-xs text-muted-foreground">Action OPS auditée</p>
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
              Support WhatsApp
            </h1>
          </div>
          <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground sm:text-base">
            Sélectionnez une boutique, vérifiez sa connexion puis intervenez sans
            ouvrir sa session.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.5fr)]">
          <Card className="h-fit gap-0 py-0">
            <CardHeader className="border-b border-border py-5">
              <CardTitle className="text-base">Boutiques</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Rechercher une boutique"
                  placeholder="Nom, email ou Phone Number ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-h-11 pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[36rem] overflow-y-auto p-0">
              {tenants.isLoading ? (
                <div className="flex min-h-32 items-center justify-center">
                  <Spinner />
                </div>
              ) : tenants.error ? (
                <p className="p-5 text-sm text-destructive">{tenants.error.message}</p>
              ) : tenants.data?.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  Aucune boutique trouvée.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {tenants.data?.map((tenant) => (
                    <li key={tenant.id}>
                      <button
                        type="button"
                        onClick={() => setTenantId(tenant.id)}
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          tenantId === tenant.id && "bg-primary/5",
                        )}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
                            "size-2 shrink-0 rounded-full",
                            tenant.connected ? "bg-success" : "bg-destructive",
                          )}
                          aria-label={tenant.connected ? "Connectée" : "Incomplète"}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[28rem]">
            <CardContent className="px-5 sm:px-6">
              {!tenantId ? (
                <Empty className="min-h-[24rem] border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Store />
                    </EmptyMedia>
                    <EmptyTitle>Sélectionnez une boutique</EmptyTitle>
                    <EmptyDescription>
                      Son diagnostic WhatsApp et les interventions disponibles
                      apparaîtront ici.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : diagnostic.isLoading ? (
                <div className="flex min-h-[24rem] items-center justify-center">
                  <Spinner />
                </div>
              ) : diagnostic.error ? (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>{diagnostic.error.message}</AlertDescription>
                </Alert>
              ) : diagnostic.data ? (
                <DiagnosticPanel diagnostic={diagnostic.data} />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
