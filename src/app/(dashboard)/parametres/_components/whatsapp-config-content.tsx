"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bell, Eye, EyeOff, Info, KeyRound, Phone, Plus, Trash2, Zap } from "lucide-react";

import { DashboardHeader } from "~/app/(dashboard)/_components/dashboard-header";
import {
  Alert,
  AlertDescription,
} from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";

export function WhatsAppConfigContent() {
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newSellerPhone, setNewSellerPhone] = useState("");
  const [sellerPhoneError, setSellerPhoneError] = useState<string | null>(null);

  const utils = api.useUtils();
  const { data, isLoading } = api.settings.getWhatsAppConfig.useQuery();
  const { data: sellerPhones = [], isLoading: sellerPhonesLoading } =
    api.sellerPhones.list.useQuery();
  const addSellerPhone = api.sellerPhones.add.useMutation({
    onSuccess: () => {
      setSellerPhoneError(null);
      setNewSellerPhone("");
      void utils.sellerPhones.list.invalidate();
    },
    onError: (e) => setSellerPhoneError(e.message),
  });
  const removeSellerPhone = api.sellerPhones.remove.useMutation({
    onSuccess: () => void utils.sellerPhones.list.invalidate(),
  });

  const setConfig = api.settings.setWhatsAppConfig.useMutation({
    onSuccess: () => {
      setSaveError(null);
      setSaveSuccess(true);
      void utils.settings.getWhatsAppConfig.invalidate();
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (e) => setSaveError(e.message),
  });

  const serverPhoneNumberId = data?.metaPhoneNumberId ?? null;
  const serverWabaId = data?.metaWabaId ?? null;
  const serverHasToken = data?.hasAccessToken ?? false;

  const isConnected =
    serverPhoneNumberId != null && serverPhoneNumberId !== "" &&
    serverWabaId != null && serverWabaId !== "" &&
    serverHasToken;

  const hasInitialSync = useRef(false);

  const hydrateFromServer = useCallback(() => {
    setMetaPhoneNumberId(serverPhoneNumberId ?? "");
    setMetaWabaId(serverWabaId ?? "");
    setMetaAccessToken("");
  }, [serverPhoneNumberId, serverWabaId]);

  useEffect(() => {
    if (data === undefined || hasInitialSync.current) return;
    hasInitialSync.current = true;
    hydrateFromServer();
  }, [data, hydrateFromServer]);

  const handleSave = useCallback(() => {
    const phoneId = metaPhoneNumberId.trim();
    const wabaId = metaWabaId.trim();
    const token = metaAccessToken.trim();
    setConfig.mutate({
      metaPhoneNumberId: phoneId === "" ? null : phoneId,
      metaWabaId: wabaId === "" ? null : wabaId,
      // null = pas de changement côté backend (le token existant est conservé)
      metaAccessToken: token === "" ? null : token,
    });
  }, [metaPhoneNumberId, metaWabaId, metaAccessToken, setConfig]);

  const handleCancel = useCallback(() => {
    hydrateFromServer();
    setSaveError(null);
  }, [hydrateFromServer]);

  const handleAddSellerPhone = useCallback(() => {
    const value = newSellerPhone.trim();
    if (!value) return;
    setSellerPhoneError(null);
    addSellerPhone.mutate({ phoneNumber: value });
  }, [newSellerPhone, addSellerPhone]);

  const PLACEHOLDER = "+33612345678";

  return (
    <>
      <DashboardHeader
        right={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col space-y-8 overflow-y-auto p-6 md:p-8">
        {/* Titre + statut */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Connexion WhatsApp
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Configurez votre connexion WhatsApp Business via l&apos;API Meta.
            </p>
          </div>
          <Badge
            variant={isConnected ? "success" : "destructive"}
            className="py-1.5 text-sm"
          >
            {isConnected ? (
              <>
                <span className="size-2 rounded-full bg-success" />
                Connecté
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-destructive animate-pulse" />
                Déconnecté
              </>
            )}
          </Badge>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="text-xl">
              Identifiants Meta WhatsApp Business
            </CardTitle>
            <CardDescription className="text-sm">
              Saisissez vos identifiants de l&apos;API WhatsApp Business Meta pour activer
              l&apos;envoi et la réception de messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-8 md:grid-cols-12">
              {/* Étapes (gauche) */}
              <div className="flex flex-col md:col-span-4">
                <div className="grid grid-cols-[32px_1fr] gap-x-4">
                  <div className="flex flex-col items-center">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      1
                    </div>
                    <div className="w-px flex-1 bg-border" style={{ minHeight: 48 }} />
                  </div>
                  <div className="pb-6">
                    <p className="text-sm font-semibold">Saisir les identifiants Meta</p>
                    <p className="text-xs text-muted-foreground">
                      Phone Number ID, WABA ID et Access Token depuis votre compte Meta Business
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground">
                      2
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Enregistrer</p>
                    <p className="text-xs text-muted-foreground">
                      Vérifier et enregistrer pour activer la connexion
                    </p>
                  </div>
                </div>
              </div>

              {/* Formulaire (droite) */}
              <div className="flex flex-col gap-6 md:col-span-8">
                {/* Phone Number ID */}
                <div className="space-y-2">
                  <Label
                    htmlFor="meta-phone-number-id"
                    className="text-sm font-semibold text-foreground"
                  >
                    Phone Number ID
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="meta-phone-number-id"
                      type="text"
                      placeholder="123456789012345"
                      value={metaPhoneNumberId}
                      onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Identifiant numérique du numéro de téléphone Meta (pas le numéro E.164)
                  </p>
                </div>

                {/* WABA ID */}
                <div className="space-y-2">
                  <Label
                    htmlFor="meta-waba-id"
                    className="text-sm font-semibold text-foreground"
                  >
                    WABA ID (WhatsApp Business Account)
                  </Label>
                  <Input
                    id="meta-waba-id"
                    type="text"
                    placeholder="109876543210"
                    value={metaWabaId}
                    onChange={(e) => setMetaWabaId(e.target.value)}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Identifiant de votre compte WhatsApp Business
                  </p>
                </div>

                {/* Access Token */}
                <div className="space-y-2">
                  <Label
                    htmlFor="meta-access-token"
                    className="text-sm font-semibold text-foreground"
                  >
                    Access Token
                  </Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="meta-access-token"
                      type={showToken ? "text" : "password"}
                      placeholder={serverHasToken ? "Token configuré — laisser vide pour conserver" : "EAAxxxxxxx..."}
                      value={metaAccessToken}
                      onChange={(e) => setMetaAccessToken(e.target.value)}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 p-0"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? "Masquer le token" : "Afficher le token"}
                    >
                      {showToken ? (
                        <EyeOff className="size-4 text-muted-foreground" />
                      ) : (
                        <Eye className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Token d&apos;accès permanent de votre application Meta.
                    {serverHasToken && " Un token est déjà configuré. Laissez vide pour le conserver."}
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2"
                    disabled
                    title="Disponible dans une prochaine version"
                  >
                    <Zap className="size-4" />
                    Tester la connexion
                  </Button>
                </div>

                <Alert className="border-dashed bg-muted/50">
                  <Info className="size-4 text-primary" />
                  <AlertDescription className="text-xs leading-relaxed">
                    Retrouvez ces identifiants dans votre{" "}
                    <strong>Meta Business Suite → WhatsApp → Configuration API</strong>.
                    Le Phone Number ID et le WABA ID se trouvent dans les paramètres
                    de votre numéro WhatsApp Business. L&apos;Access Token se génère
                    depuis les paramètres de votre application Meta.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Numéros vendeur */}
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="text-xl">Numéros vendeur</CardTitle>
            <CardDescription className="text-sm">
              Les numéros listés ici sont considérés comme vendeurs pour votre
              tenant. Les messages entrants depuis ces numéros sont traités comme
              messages vendeur (et non client).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="seller-phone"
                    className="text-sm font-semibold text-foreground"
                  >
                    Ajouter un numéro
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="seller-phone"
                      type="text"
                      placeholder={PLACEHOLDER}
                      value={newSellerPhone}
                      onChange={(e) => setNewSellerPhone(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && (e.preventDefault(), handleAddSellerPhone())
                      }
                      className="pl-10"
                      disabled={sellerPhonesLoading || addSellerPhone.isPending}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="default"
                  className="gap-2 sm:self-end"
                  onClick={handleAddSellerPhone}
                  disabled={
                    !newSellerPhone.trim() ||
                    sellerPhonesLoading ||
                    addSellerPhone.isPending
                  }
                >
                  <Plus className="size-4" />
                  Ajouter
                </Button>
              </div>
              {sellerPhoneError && (
                <Alert variant="destructive">
                  <AlertDescription>{sellerPhoneError}</AlertDescription>
                </Alert>
              )}
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Numéros enregistrés ({sellerPhones.length})
                </p>
                {sellerPhonesLoading ? (
                  <p className="text-sm text-muted-foreground">Chargement…</p>
                ) : sellerPhones.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun numéro vendeur. Ajoutez un numéro au format E.164
                    (ex. +33612345678).
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {sellerPhones.map((sp) => (
                      <li
                        key={sp.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-foreground">
                          {sp.phoneNumber}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeSellerPhone.mutate({ id: sp.id })}
                          disabled={removeSellerPhone.isPending}
                        >
                          <Trash2 className="size-4" />
                          Supprimer
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages + actions */}
        {saveError && (
          <Alert variant="destructive" className="flex flex-row flex-wrap items-center justify-between gap-2">
            <AlertDescription className="flex flex-1 items-center justify-between gap-2">
              <span>{saveError}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-1"
                onClick={() => setSaveError(null)}
              >
                Fermer
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {saveSuccess && (
          <Alert className="border-success/50 bg-success/10 text-success [&>svg]:text-success">
            <AlertDescription>
              Configuration enregistrée.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-3 pb-12">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="font-semibold"
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={setConfig.isPending || isLoading}
            className="font-semibold shadow-lg shadow-primary/20"
          >
            {setConfig.isPending ? "Enregistrement…" : "Enregistrer la configuration"}
          </Button>
        </div>
      </div>
    </>
  );
}
