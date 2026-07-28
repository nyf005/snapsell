"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Info, MessageSquare, RefreshCw, ShoppingBag } from "lucide-react";
import { api } from "~/trpc/react";
import { ErrorAlert } from "~/components/ui/error-alert";
import {
  formatError,
  templateCategoryLabel,
  templateStatusLabel,
  type UserError,
} from "~/lib/copy";
import { cn } from "~/lib/utils";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

const fieldLabel = "mb-1.5 ml-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground";

/**
 * Fonctions avancées de WhatsApp : catalogue Meta Commerce et modèles de message.
 *
 * Vivait sur sa propre page « Profil WhatsApp Business », nommée d'après un produit
 * Meta. Ces deux réglages ne concernent qu'une minorité de vendeuses : ils sont
 * désormais repliés dans la page Connexion WhatsApp.
 */
export function WhatsAppAdvancedSections() {

  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [catalogFetchEnabled, setCatalogFetchEnabled] = useState(false);
  const [catalogSaveSuccess, setCatalogSaveSuccess]   = useState(false);
  const [catalogSaveError, setCatalogSaveError]       = useState<UserError | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<UserError | null>(null);

  const utils                  = api.useUtils();
  const { data }               = api.settings.getBusinessConfig.useQuery();
  const { data: waConfig }     = api.settings.getWhatsAppConfig.useQuery();

  const { data: catalogs = [], isLoading: catalogsLoading, refetch: refetchCatalogs } =
    api.settings.fetchMetaCatalogs.useQuery(undefined, { enabled: catalogFetchEnabled });
  const isConnected = !!(
    waConfig?.metaPhoneNumberId &&
    waConfig.metaWabaId &&
    waConfig.hasAccessToken
  );
  const templatesQuery = api.settings.fetchWhatsAppTemplates.useQuery(undefined, {
    enabled: isConnected,
  });

  const selectCatalog = api.settings.selectMetaCatalog.useMutation({
    onSuccess: () => {
      setCatalogSaveError(null);
      setCatalogSaveSuccess(true);
      void utils.settings.getBusinessConfig.invalidate();
      setTimeout(() => setCatalogSaveSuccess(false), 3000);
    },
    onError: (e) => setCatalogSaveError(formatError(e, "whatsapp")),
  });
  const selectTemplate = api.settings.selectWhatsAppTemplate.useMutation({
    onSuccess: () => {
      setTemplateError(null);
      setTemplateNotice("Template WhatsApp sélectionné.");
      void utils.settings.fetchWhatsAppTemplates.invalidate();
      setTimeout(() => setTemplateNotice(null), 3000);
    },
    onError: (e) => setTemplateError(formatError(e, "whatsapp")),
  });

  useEffect(() => {
    const selected = templatesQuery.data?.selectedTemplate;
    if (!selected) return;
    setSelectedTemplateKey(`${selected.name}::${selected.language}`);
  }, [templatesQuery.data?.selectedTemplate]);

  const templates = templatesQuery.data?.templates ?? [];
  const approvedTemplates = templates.filter((template) => template.status === "APPROVED");
  const selectedTemplate = templates.find(
    (template) => `${template.name}::${template.language}` === selectedTemplateKey,
  );
  const whatsappManagerTemplatesUrl = waConfig?.metaWabaId
    ? `https://business.facebook.com/latest/whatsapp_manager/message_templates?asset_id=${encodeURIComponent(waConfig.metaWabaId)}`
    : "https://business.facebook.com/wa/manage/message-templates/";

  const handleSelectTemplate = useCallback(() => {
    if (!selectedTemplate) return;
    setTemplateError(null);
    selectTemplate.mutate({
      name: selectedTemplate.name,
      language: selectedTemplate.language,
      category: selectedTemplate.category,
    });
  }, [selectTemplate, selectedTemplate]);

  return (
    <div className="space-y-6">

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
                            {c.name}
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
                {catalogSaveError && <ErrorAlert error={catalogSaveError} />}

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

        {/* Modèles de message */}
        <Card className="rounded-xl border border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <MessageSquare className="size-5 text-muted-foreground" />
                  Modèles de message
                </CardTitle>
                <CardDescription>
                  Choisissez le modèle de message que SnapSell utilisera pour écrire sur WhatsApp. Seuls les modèles approuvés par WhatsApp apparaissent ici.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 sm:self-start"
                asChild
              >
                <a href={whatsappManagerTemplatesUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  WhatsApp Manager
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {!isConnected ? (
              <Alert className="border-dashed bg-muted/50">
                <Info className="size-4 text-primary" />
                <AlertDescription className="text-sm">
                  Connectez d&apos;abord WhatsApp pour voir vos modèles de message.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className={fieldLabel}>Template approuvé</label>
                    <Select
                      value={selectedTemplateKey}
                      onValueChange={setSelectedTemplateKey}
                      disabled={templatesQuery.isLoading || approvedTemplates.length === 0}
                    >
                      <SelectTrigger className="h-9 w-full border-border bg-muted/50">
                        <SelectValue
                          placeholder={
                            templatesQuery.isLoading
                              ? "Chargement des templates..."
                              : "Choisir un template approuvé"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedTemplates.map((template) => (
                          <SelectItem
                            key={`${template.name}:${template.language}`}
                            value={`${template.name}::${template.language}`}
                          >
                            {template.name} · {template.language}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2"
                      disabled={templatesQuery.isFetching}
                      onClick={() => void templatesQuery.refetch()}
                    >
                      <RefreshCw className={cn("size-4", templatesQuery.isFetching && "animate-spin")} />
                      Actualiser
                    </Button>
                    <Button
                      type="button"
                      className="h-9 gap-2 font-semibold shadow-lg shadow-primary/20"
                      disabled={!selectedTemplate || selectTemplate.isPending}
                      onClick={handleSelectTemplate}
                    >
                      <Check className="size-4" />
                      {selectTemplate.isPending ? "Sélection..." : "Sélectionner"}
                    </Button>
                  </div>
                </div>

                {templatesQuery.isError && (
                  <ErrorAlert error={templatesQuery.error} context="whatsapp" />
                )}

                {templatesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Chargement des templates WhatsApp...</p>
                ) : templates.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4">
                    <p className="text-sm font-medium text-foreground">
                      Aucun modèle de message disponible.
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Créez un template Utility dans WhatsApp Manager, puis revenez l&apos;actualiser ici.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      <span>Template</span>
                      <span>Catégorie</span>
                      <span>Statut</span>
                    </div>
                    <div className="divide-y divide-border">
                      {templates.slice(0, 8).map((template) => (
                        <div
                          key={`${template.name}:${template.language}:${template.status}`}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{template.name}</p>
                            <p className="text-xs text-muted-foreground">{template.language}</p>
                          </div>
                          <Badge variant="secondary">{templateCategoryLabel(template.category)}</Badge>
                          <Badge variant={template.status === "APPROVED" ? "success" : "outline"}>
                            {templateStatusLabel(template.status)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {templateError && <ErrorAlert error={templateError} />}
                {templateNotice && (
                  <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
                    <AlertDescription>{templateNotice}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

    </div>
  );
}
