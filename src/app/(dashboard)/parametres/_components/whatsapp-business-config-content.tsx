"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, Check, Clock, Info, MessageSquare, RefreshCw, ShoppingBag } from "lucide-react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TimePickerField } from "~/components/ui/time-picker";

const TIMEZONES = [
  { value: "Africa/Abidjan", label: "Abidjan (UTC+0)" },
  { value: "Africa/Dakar",   label: "Dakar (UTC+0)" },
  { value: "Africa/Accra",   label: "Accra (UTC+0)" },
  { value: "Africa/Lagos",   label: "Lagos (UTC+1)" },
  { value: "Africa/Douala",  label: "Douala (UTC+1)" },
  { value: "Africa/Nairobi", label: "Nairobi (UTC+3)" },
  { value: "Europe/Paris",   label: "Paris (UTC+1/+2)" },
];

const fieldLabel = "mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground";

export function WhatsAppBusinessConfigContent() {
  const [hoursStart, setHoursStart]   = useState("");
  const [hoursEnd, setHoursEnd]       = useState("");
  const [timezone, setTimezone]       = useState("Africa/Abidjan");
  const [awayMessage, setAwayMessage] = useState("");
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [catalogFetchEnabled, setCatalogFetchEnabled] = useState(false);
  const [catalogSaveSuccess, setCatalogSaveSuccess]   = useState(false);
  const [catalogSaveError, setCatalogSaveError]       = useState<string | null>(null);

  const utils                  = api.useUtils();
  const { data, isLoading }    = api.settings.getBusinessConfig.useQuery();
  const { data: waConfig }     = api.settings.getWhatsAppConfig.useQuery();

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
      businessHoursStart: hoursStart || null,
      businessHoursEnd:   hoursEnd   || null,
      businessTimezone:   timezone   || null,
      awayMessage:        awayMessage.trim() || null,
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
          <h1 className="text-3xl font-black tracking-tight">WhatsApp Business</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Configurez les horaires d&apos;ouverture et le catalogue Meta Commerce.
          </p>
        </div>

        {/* Horaires + message away */}
        <Card className="rounded-xl border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Clock className="size-5 text-muted-foreground" />
              Horaires d&apos;ouverture
            </CardTitle>
            <CardDescription>
              En dehors de ces horaires, le message hors-horaires est envoyé automatiquement au premier message reçu.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Ligne horaires */}
            <div className="flex flex-wrap items-end gap-4">
              <TimePickerField
                label="Ouverture"
                value={hoursStart}
                onChange={setHoursStart}
                disabled={isLoading || saveConfig.isPending}
              />
              <TimePickerField
                label="Fermeture"
                value={hoursEnd}
                onChange={setHoursEnd}
                disabled={isLoading || saveConfig.isPending}
              />
              <div className="min-w-[200px] flex-1">
                <label className={fieldLabel}>Fuseau horaire</label>
                <Select
                  value={timezone}
                  onValueChange={setTimezone}
                  disabled={isLoading || saveConfig.isPending}
                >
                  <SelectTrigger className="h-9 w-full border-border bg-muted/50">
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Away message */}
            <div>
              <label htmlFor="away-message" className={cn(fieldLabel, "flex items-center gap-1.5")}>
                <MessageSquare className="size-3.5" />
                Message hors-horaires
              </label>
              <Textarea
                id="away-message"
                value={awayMessage}
                onChange={(e) => setAwayMessage(e.target.value)}
                placeholder="Bonjour ! Nous sommes actuellement fermés. Nos horaires sont 8h–20h. Nous vous répondrons dès notre réouverture."
                rows={4}
                maxLength={2000}
                disabled={isLoading || saveConfig.isPending}
                className="mt-1.5 resize-none border-border bg-muted/50"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">{awayMessage.length}/2000</p>
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
        <Card className="rounded-xl border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShoppingBag className="size-5 text-muted-foreground" />
              Catalogue Meta Commerce
            </CardTitle>
            <CardDescription>
              Associez un catalogue Meta pour synchroniser vos articles et permettre les commandes WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <Info className="size-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                <strong>SnapSell est la source de vérité.</strong> Toute modification effectuée directement dans Meta Commerce Manager sera écrasée lors de la prochaine synchronisation. Gérez vos articles depuis l&apos;onglet Catalogue.
              </AlertDescription>
            </Alert>

            {data?.metaCatalogId && (
              <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Catalogue actif</p>
                <p className="font-mono text-sm text-foreground">{data.metaCatalogId}</p>
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
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[240px] flex-1">
                    <label className={fieldLabel}>Catalogue</label>
                    <Select
                      value={selectedCatalogId}
                      onValueChange={setSelectedCatalogId}
                      disabled={catalogs.length === 0}
                    >
                      <SelectTrigger className="h-9 w-full border-border bg-muted/50">
                        <SelectValue placeholder={catalogs.length === 0 ? "Récupérez d'abord les catalogues" : "— Choisir un catalogue —"} />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogs.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} <span className="text-muted-foreground">({c.id})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 gap-2"
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
                    {catalogsLoading ? "Chargement…" : "Récupérer"}
                  </Button>

                  <Button
                    type="button"
                    disabled={!selectedCatalogId || selectCatalog.isPending}
                    className="h-9 font-semibold shadow-lg shadow-primary/20"
                    onClick={() => {
                      const found = catalogs.find((c) => c.id === selectedCatalogId);
                      selectCatalog.mutate({ catalogId: selectedCatalogId, catalogName: found?.name });
                    }}
                  >
                    {selectCatalog.isPending ? "Enregistrement…" : "Utiliser ce catalogue"}
                  </Button>
                </div>

                {catalogSaveSuccess && (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <Check className="size-4" /> Catalogue enregistré
                  </span>
                )}
                {catalogSaveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{catalogSaveError}</AlertDescription>
                  </Alert>
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
