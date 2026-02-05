"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bell, Info, Phone, Plus, Trash2, Zap } from "lucide-react";

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

const PLACEHOLDER = "+33612345678";

export function WhatsAppConfigContent() {
  const [phone, setPhone] = useState("");
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

  const currentNumber = data?.whatsappPhoneNumber ?? null;
  const isConnected = currentNumber != null && currentNumber !== "";
  const hasInitialSync = useRef(false);

  const hydrateFromServer = useCallback(() => {
    if (currentNumber != null) setPhone(currentNumber);
    else setPhone("");
  }, [currentNumber]);

  useEffect(() => {
    if (data === undefined || hasInitialSync.current) return;
    hasInitialSync.current = true;
    setPhone(currentNumber != null ? currentNumber : "");
  }, [data, currentNumber]);

  const handleSave = useCallback(() => {
    const value = phone.trim();
    setConfig.mutate({
      whatsappPhoneNumber: value === "" ? null : value,
    });
  }, [phone, setConfig]);

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
      <div className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
        {/* Titre + statut */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Paramètres de connexion WhatsApp
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Configurez l’intégration WhatsApp de votre boutique.
            </p>
          </div>
          <Badge
            variant={isConnected ? "success" : "destructive"}
            className="py-1.5 text-sm"
          >
            {isConnected ? (
              <>
                <span className="size-2 rounded-full bg-green-500" />
                Connecté
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                Déconnecté
              </>
            )}
          </Badge>
        </div>

        <Card className="overflow-hidden border-border shadow-sm">
          <CardHeader className="border-b border-border pb-6">
            <CardTitle className="text-xl">
              Configuration WhatsApp
            </CardTitle>
            <CardDescription className="text-sm">
              Saisissez le numéro WhatsApp professionnel pour activer les
              notifications.
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
                    <p className="text-sm font-semibold">Saisir le numéro WhatsApp</p>
                    <p className="text-xs text-muted-foreground">
                      Format international E.164 (ex. +33…)
                    </p>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground">
                      2
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Enregistrer la configuration</p>
                    <p className="text-xs text-muted-foreground">
                      Vérifier et enregistrer pour activer la connexion
                    </p>
                  </div>
                </div>
              </div>

              {/* Formulaire (droite) */}
              <div className="flex flex-col gap-6 md:col-span-8">
                <div className="space-y-2">
                  <Label
                    htmlFor="whatsapp-phone"
                    className="text-sm font-semibold text-foreground"
                  >
                    Numéro WhatsApp professionnel
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="whatsapp-phone"
                      type="text"
                      placeholder={PLACEHOLDER}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-10"
                      disabled={isLoading}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Utilisez le format international (ex. +33612345678)
                  </p>
                </div>

                <Alert className="border-dashed bg-muted/50">
                  <Info className="size-4 text-primary" />
                  <AlertDescription className="text-xs leading-relaxed">
                    Côté plateforme, les identifiants techniques sont gérés
                    automatiquement. Vous devez uniquement renseigner le
                    numéro WhatsApp professionnel associé à votre compte.
                  </AlertDescription>
                </Alert>

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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Numéros vendeur */}
        <Card className="overflow-hidden border-border shadow-sm">
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
          <Alert className="border-green-500/50 bg-green-500/10 text-green-700 dark:bg-green-900/30 dark:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400">
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
