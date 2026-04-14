"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronDown, Clock, MessageSquare, RefreshCw, ShoppingBag } from "lucide-react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

const TIMEZONES = [
  { value: "Africa/Abidjan", label: "Abidjan (UTC+0)" },
  { value: "Africa/Dakar", label: "Dakar (UTC+0)" },
  { value: "Africa/Accra", label: "Accra (UTC+0)" },
  { value: "Africa/Lagos", label: "Lagos (UTC+1)" },
  { value: "Africa/Douala", label: "Douala (UTC+1)" },
  { value: "Africa/Nairobi", label: "Nairobi (UTC+3)" },
  { value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
];

export function WhatsAppBusinessConfigContent() {
  const [hoursStart, setHoursStart] = useState("");
  const [hoursEnd, setHoursEnd] = useState("");
  const [timezone, setTimezone] = useState("Africa/Abidjan");
  const [awayMessage, setAwayMessage] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [catalogFetchEnabled, setCatalogFetchEnabled] = useState(false);
  const [catalogSaveSuccess, setCatalogSaveSuccess] = useState(false);
  const [catalogSaveError, setCatalogSaveError] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data, isLoading } = api.settings.getBusinessConfig.useQuery();
  const { data: waConfig } = api.settings.getWhatsAppConfig.useQuery();

  const { data: catalogs = [], isLoading: catalogsLoading, refetch: refetchCatalogs } =
    api.settings.fetchMetaCatalogs.useQuery(undefined, { enabled: catalogFetchEnabled });

  const hasInitialSync = useRef(false);

  useEffect(() => {
    if (!data || hasInitialSync.current) return;
    hasInitialSync.current = true;
    setHoursStart(data.businessHoursStart ?? "");
    setHoursEnd(data.businessHoursEnd ?? "");
    setTimezone(data.businessTimezone ?? "Africa/Abidjan");
    setAwayMessage(data.awayMessage ?? "");
  }, [data]);

  const saveConfig = api.settings.setBusinessConfig.useMutation({
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(true);
      void utils.settings.getBusinessConfig.invalidate();
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e) => setSaveError(e.message),
  });

  const selectCatalog = api.settings.selectMetaCatalog.useMutation({
    onSuccess: () => {
      setCatalogSaveError(null);
      setCatalogSaveSuccess(true);
      void utils.settings.getBusinessConfig.invalidate();
      setTimeout(() => setCatalogSaveSuccess(false), 3000);
    },
    onError: (e) => setCatalogSaveError(e.message),
  });

  const handleSave = useCallback(() => {
    setSaveError(null);
    saveConfig.mutate({
      businessHoursStart: hoursStart.trim() || null,
      businessHoursEnd: hoursEnd.trim() || null,
      businessTimezone: timezone || null,
      awayMessage: awayMessage.trim() || null,
    });
  }, [hoursStart, hoursEnd, timezone, awayMessage, saveConfig]);

  const isConnected = !!(waConfig?.metaPhoneNumberId && waConfig.hasAccessToken);

  return (
    <>
      <DashboardHeader
        right={
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
            <Bell className="size-5" />
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-6 md:p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">WhatsApp Business</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Configurez les horaires, le message hors-horaires et le catalogue Meta.
          </p>
        </div>

        {/* Heures d'ouverture */}
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Clock className="size-5 text-muted-foreground" />
              Horaires d&apos;ouverture
            </CardTitle>
            <CardDescription className="text-sm">
              En dehors de ces horaires, le message hors-horaires sera envoyé automatiquement.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="hours-start" className="text-sm font-semibold">Heure d&apos;ouverture</Label>
                <Input
                  id="hours-start"
                  type="time"
                  value={hoursStart}
                  onChange={(e) => setHoursStart(e.target.value)}
                  disabled={isLoading || saveConfig.isPending}
                  placeholder="08:00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hours-end" className="text-sm font-semibold">Heure de fermeture</Label>
                <Input
                  id="hours-end"
                  type="time"
                  value={hoursEnd}
                  onChange={(e) => setHoursEnd(e.target.value)}
                  disabled={isLoading || saveConfig.isPending}
                  placeholder="20:00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone-select" className="text-sm font-semibold">Fuseau horaire</Label>
                <div className="relative">
                  <select
                    id="timezone-select"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={isLoading || saveConfig.isPending}
                    className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
            </div>

            {/* Away message */}
            <div className="space-y-1.5">
              <Label htmlFor="away-message" className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="size-4 text-muted-foreground" />
                Message hors-horaires
              </Label>
              <Textarea
                id="away-message"
                value={awayMessage}
                onChange={(e) => setAwayMessage(e.target.value)}
                placeholder="Bonjour ! Nous sommes actuellement fermés. Nos horaires sont 8h–20h. Nous vous répondrons dès notre réouverture."
                rows={4}
                maxLength={2000}
                disabled={isLoading || saveConfig.isPending}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{awayMessage.length}/2000</p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveConfig.isPending || isLoading}
                className="font-semibold shadow-lg shadow-primary/20"
              >
                {saveConfig.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
              {saveSuccess && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <Check className="size-4" /> Enregistré
                </span>
              )}
            </div>
            {saveError && (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Catalogue Meta */}
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShoppingBag className="size-5 text-muted-foreground" />
              Catalogue Meta Commerce
            </CardTitle>
            <CardDescription className="text-sm">
              Associez un catalogue Meta pour synchroniser vos articles et permettre les commandes WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {data?.metaCatalogId && (
              <div className="rounded-md border border-success/30 bg-success/5 p-3">
                <p className="text-sm font-semibold text-foreground">Catalogue actif</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{data.metaCatalogId}</p>
              </div>
            )}

            {!isConnected ? (
              <Alert className="border-dashed bg-muted/50">
                <AlertDescription className="text-xs">
                  Connectez d&apos;abord votre compte WhatsApp Business (onglet Connexion WhatsApp) pour accéder aux catalogues.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2"
                    disabled={catalogsLoading}
                    onClick={() => {
                      if (!catalogFetchEnabled) {
                        setCatalogFetchEnabled(true);
                      } else {
                        void refetchCatalogs();
                      }
                    }}
                  >
                    <RefreshCw className={cn("size-4", catalogsLoading && "animate-spin")} />
                    {catalogsLoading ? "Chargement…" : "Récupérer mes catalogues"}
                  </Button>
                </div>

                {catalogs.length > 0 && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-select" className="text-sm font-semibold">
                        Sélectionner un catalogue
                      </Label>
                      <div className="relative">
                        <select
                          id="catalog-select"
                          value={selectedCatalogId}
                          onChange={(e) => setSelectedCatalogId(e.target.value)}
                          className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">— Choisir un catalogue —</option>
                          {catalogs.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        disabled={!selectedCatalogId || selectCatalog.isPending}
                        onClick={() => {
                          const found = catalogs.find((c) => c.id === selectedCatalogId);
                          selectCatalog.mutate({ catalogId: selectedCatalogId, catalogName: found?.name });
                        }}
                        className="font-semibold shadow-lg shadow-primary/20"
                      >
                        {selectCatalog.isPending ? "Enregistrement…" : "Utiliser ce catalogue"}
                      </Button>
                      {catalogSaveSuccess && (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Check className="size-3.5" /> Catalogue enregistré
                        </span>
                      )}
                    </div>
                    {catalogSaveError && (
                      <Alert variant="destructive">
                        <AlertDescription>{catalogSaveError}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {catalogFetchEnabled && !catalogsLoading && catalogs.length === 0 && (
                  <Alert className="border-dashed bg-muted/50">
                    <AlertDescription className="text-xs">
                      Aucun catalogue trouvé. Créez d&apos;abord un catalogue dans Meta Commerce Manager.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="pb-12" />
      </div>
    </>
  );
}
