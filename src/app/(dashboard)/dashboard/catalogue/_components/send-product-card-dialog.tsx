"use client";

import { useState } from "react";

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
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const send = api.live.sendProductCard.useMutation({
    onSuccess: () => {
      onSent(`Fiche de ${item?.code} envoyée.`);
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
    send.mutate({ catalogueItemId: item.id, clientPhone: value });
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
            <Button type="submit" className="flex-1 font-bold" disabled={send.isPending}>
              {send.isPending ? "Envoi…" : "Envoyer la fiche"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
