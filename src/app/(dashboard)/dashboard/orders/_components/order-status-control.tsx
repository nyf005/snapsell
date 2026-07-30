"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { formatErrorText } from "~/lib/copy";
import { ORDER_STATUS_LABEL } from "~/lib/copy/orders";
import { getAllowedNextStatuses } from "~/lib/order-status-transitions";
import { api } from "~/trpc/react";

/**
 * Faire avancer une commande — sélecteur, mutation, confirmation.
 *
 * ── POURQUOI UN COMPOSANT PARTAGÉ ───────────────────────────────────────────
 * Le sélecteur vivait dans la colonne d'actions de la liste. Le panneau de détail
 * n'en avait pas : on ouvrait une commande pour vérifier l'adresse avant
 * d'expédier, et il fallait refermer pour retrouver la ligne et changer l'état.
 *
 * Plutôt que d'écrire le sélecteur deux fois, il vit ici. Les transitions
 * autorisées viennent déjà de `getAllowedNextStatuses`, partagé avec le serveur ;
 * ce qui se dupliquait vraiment, c'était l'état de chargement, l'erreur et la
 * confirmation.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── POURQUOI L'ANNULATION SEULE DEMANDE CONFIRMATION ────────────────────────
 * Trois transitions envoient un message WhatsApp à la cliente : `in_delivery`,
 * `delivered` et `cancelled` (`order/service.ts`). Le sélecteur ne le disait
 * nulle part — on choisissait « Annulée » dans une liste déroulante et un message
 * d'annulation partait, sans confirmation.
 *
 * Seule l'annulation en demande une : les deux autres sont la marche normale du
 * travail, et confirmer chaque colis qui part transformerait l'après-live en
 * chapelet de boîtes de dialogue. L'annulation, elle, ferme la vente et prévient
 * la cliente — c'est le même raisonnement que le refus d'une preuve.
 * ────────────────────────────────────────────────────────────────────────────
 */

type OrderStatusKey = Parameters<typeof getAllowedNextStatuses>[0];

/** Les transitions dont la cliente est prévenue par WhatsApp. */
const NOTIFYING = new Set<string>(["in_delivery", "delivered", "cancelled"]);

export function OrderStatusControl({
  orderId,
  orderNumber,
  status,
  layout = "row",
  onChanged,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  /** `panel` élargit le sélecteur et explique la notification, faute de place en ligne. */
  layout?: "row" | "panel";
  onChanged?: () => void;
}) {
  const [confirmTarget, setConfirmTarget] = useState<OrderStatusKey | null>(null);
  const utils = api.useUtils();

  const updateStatus = api.orders.updateStatus.useMutation({
    onSuccess: () => {
      setConfirmTarget(null);
      void utils.orders.list.invalidate();
      void utils.orders.getById.invalidate();
      onChanged?.();
    },
  });

  const allowed = getAllowedNextStatuses(status as OrderStatusKey);

  if (allowed.length === 0) {
    if (status === "delivered") {
      return <span className="text-sm text-muted-foreground">Déjà livrée</span>;
    }
    if (status === "cancelled") {
      return <span className="text-sm text-muted-foreground">Commande annulée</span>;
    }
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const apply = (next: OrderStatusKey) => {
    updateStatus.mutate({ orderId, status: next });
  };

  return (
    <div className={layout === "panel" ? "space-y-2" : "flex flex-col gap-1"}>
      <Select
        value=""
        onValueChange={(value) => {
          const next = value as OrderStatusKey;
          if (!allowed.includes(next)) return;
          if (next === "cancelled") {
            setConfirmTarget(next);
            return;
          }
          apply(next);
        }}
        disabled={updateStatus.isPending}
      >
        {/*
          Le nom accessible va sur le déclencheur, pas sur `Select` : la racine
          Radix ne rend aucun élément DOM, et l'`aria-label` qui y était posé était
          donc perdu. Le sélecteur n'avait aucun nom — un lecteur d'écran
          annonçait « liste déroulante », sans dire de quelle commande.
        */}
        <SelectTrigger
          aria-label={`Changer le statut de la commande ${orderNumber}`}
          className={
            layout === "panel"
              ? "h-9 w-full border-border"
              : "h-9 w-full border-border bg-muted/50 sm:w-[140px]"
          }
        >
          <SelectValue placeholder={updateStatus.isPending ? "Mise à jour…" : "Nouveau statut"} />
        </SelectTrigger>
        <SelectContent>
          {allowed.map((next) => (
            <SelectItem key={next} value={next}>
              {ORDER_STATUS_LABEL[next]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {layout === "panel" && allowed.some((s) => NOTIFYING.has(s)) ? (
        <p className="text-xs text-muted-foreground">
          Passer en livraison, marquer livrée ou annuler prévient la cliente sur
          WhatsApp. Aucun message à écrire.
        </p>
      ) : null}

      {updateStatus.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {formatErrorText(updateStatus.error, "orders")}
        </p>
      ) : null}

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette commande ?</AlertDialogTitle>
            <AlertDialogDescription>
              La commande {orderNumber} sera marquée comme annulée, et la cliente en
              sera prévenue sur WhatsApp. C’est un état définitif : la commande ne
              pourra plus avancer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateStatus.isPending}>
              Ne pas annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={updateStatus.isPending}
              onClick={() => confirmTarget && apply(confirmTarget)}
            >
              {updateStatus.isPending ? "Annulation…" : "Annuler la commande"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
