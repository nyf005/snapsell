"use client";

import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatErrorText } from "~/lib/copy";
import { isValidE164 } from "~/lib/validations/phone";
import { api } from "~/trpc/react";

/**
 * Envoyer la fiche produit WhatsApp d'un article à une cliente.
 *
 * ── POURQUOI CET ÉCRAN MANQUAIT ─────────────────────────────────────────────
 * `live.sendProductCard` existait sans appelant. Il envoie la fiche officielle du
 * catalogue Meta, celle depuis laquelle la cliente peut commander dans WhatsApp
 * sans qu'on lui décrive l'article à la main.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── POURQUOI ICI, ET PAS SUR L'ÉCRAN LIVE ───────────────────────────────────
 * La procédure exige le numéro réel de la cliente. L'écran live n'expose que des
 * numéros masqués (`clientPhoneMasked`), il ne pouvait donc pas l'appeler. Le
 * catalogue, lui, est l'endroit où l'on répond à « vous avez ceci ? » : on saisit
 * le numéro qui vient de poser la question.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function SendProductCardDialog({
  item,
  onOpenChange,
  onSent,
}: {
  /** `null` = fermé. Porte le code pour l'afficher sans le refaire deviner. */
  item: { id: string; code: string } | null;
  onOpenChange: (open: boolean) => void;
  onSent: (message: string) => void;
}) {
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  useEffect(() => { setConsentConfirmed(false); }, [item]);
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const send = api.live.sendProductCard.useMutation({
    onSuccess: () => {
      onSent(`Fiche de ${item?.code} mise en attente d’envoi.`);
      setPhone("");
      onOpenChange(false);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    const value = phone.trim();
    // Validé ici avec le même prédicat que le serveur, pour ne pas faire un
    // aller-retour réseau pour une faute de frappe.
    if (!isValidE164(value)) {
      setLocalError("Numéro au format international attendu, par exemple +2250701020304.");
      return;
    }
    if (!item) return;
    if (!consentConfirmed) return;
    send.mutate({ catalogueItemId: item.id, clientPhone: value, consentConfirmed: true });
  };

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Envoyer la fiche de {item?.code}</DialogTitle>
          <DialogDescription>
            La cliente reçoit la fiche officielle du catalogue et peut commander
            directement depuis WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-card-phone">Numéro de la cliente</Label>
            <Input
              id="product-card-phone"
              type="tel"
              inputMode="tel"
              placeholder="+2250701020304"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setConsentConfirmed(false);
                if (localError) setLocalError(null);
              }}
              disabled={send.isPending}
              aria-invalid={!!localError}
              aria-describedby={localError ? "product-card-phone-error" : undefined}
            />
            {localError ? (
              <p id="product-card-phone-error" role="alert" className="text-xs text-destructive">
                {localError}
              </p>
            ) : null}
          </div>

          <label htmlFor="product-card-consent" className="flex min-h-11 items-start gap-3 text-sm"><input id="product-card-consent" type="checkbox" className="mt-1 size-5 shrink-0" checked={consentConfirmed} onChange={e => setConsentConfirmed(e.target.checked)} disabled={send.isPending} required /><span>Le client a demandé cette fiche et accepte de la recevoir sur WhatsApp. Il m’a écrit au cours des dernières 24 heures.</span></label>
          {send.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {formatErrorText(send.error, "catalogue")}
            </p>
          ) : null}

          <DialogFooter className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={send.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" className="flex-1 font-bold" disabled={send.isPending || !consentConfirmed}>
              {send.isPending ? "Envoi…" : "Envoyer la fiche"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
