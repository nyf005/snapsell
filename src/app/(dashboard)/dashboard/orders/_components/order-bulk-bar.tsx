"use client";

import { useState } from "react";
import { X } from "lucide-react";

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
import { Button } from "~/components/ui/button";
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

type OrderStatusKey = Parameters<typeof getAllowedNextStatuses>[0];

/**
 * Faire avancer plusieurs commandes d'un coup.
 *
 * ── L'AIDE LE PROMETTAIT DÉJÀ ───────────────────────────────────────────────
 * `orders.bulkUpdateStatus` existait côté serveur — plafonné à 200, testé — et
 * **aucune interface ne l'appelait**. L'article « preparer-et-livrer » promettait
 * pourtant : « Plusieurs commandes peuvent changer d'état en une fois, ce qui
 * évite de répéter le même geste après un gros live. »
 *
 * L'écran des preuves avait sa sélection multiple, celui des commandes non.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── SEULS LES STATUTS VALIDES POUR TOUTE LA SÉLECTION ───────────────────────
 * Les transitions permises dépendent de l'état de départ. Proposer l'union des
 * possibilités laisserait le serveur en ignorer une partie et renvoyer un
 * « 12 mises à jour, 5 ignorées » incompréhensible. On propose donc
 * l'**intersection** : ce qui s'applique à toute la sélection, ou rien.
 * ────────────────────────────────────────────────────────────────────────────
 */
function commonNextStatuses(statuses: readonly string[]): OrderStatusKey[] {
  if (statuses.length === 0) return [];
  const sets = statuses.map(
    (s) => new Set<string>(getAllowedNextStatuses(s as OrderStatusKey)),
  );
  const [first, ...rest] = sets;
  if (!first) return [];
  return [...first].filter((s) => rest.every((r) => r.has(s))) as OrderStatusKey[];
}

export function OrderBulkBar({
  selectedIds,
  selectedStatuses,
  onClear,
  onDone,
}: {
  selectedIds: readonly string[];
  /** Statut actuel de chaque commande sélectionnée, pour calculer l'intersection. */
  selectedStatuses: readonly string[];
  onClear: () => void;
  onDone: (message: string) => void;
}) {
  const [confirmTarget, setConfirmTarget] = useState<OrderStatusKey | null>(null);
  const utils = api.useUtils();

  const bulk = api.orders.bulkUpdateStatus.useMutation({
    onSuccess: (result) => {
      setConfirmTarget(null);
      // Le compte réel, y compris ce qui n'a pas bougé : l'intersection rend le
      // cas rare, mais une commande peut avoir changé entre-temps.
      const parts = [`${result.updated} commande${result.updated > 1 ? "s" : ""} mise${result.updated > 1 ? "s" : ""} à jour`];
      if (result.skipped > 0) parts.push(`${result.skipped} ignorée${result.skipped > 1 ? "s" : ""}`);
      onDone(`${parts.join(", ")}.`);
      onClear();
      void utils.orders.list.invalidate();
      void utils.orders.getById.invalidate();
    },
  });

  if (selectedIds.length === 0) return null;

  const options = commonNextStatuses(selectedStatuses);

  const apply = (next: OrderStatusKey) => {
    bulk.mutate({ orderIds: [...selectedIds], status: next });
  };

  return (
    <div
      role="region"
      aria-label="Actions sur la sélection"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <span className="text-sm font-semibold">
        {selectedIds.length} commande{selectedIds.length > 1 ? "s" : ""} sélectionnée
        {selectedIds.length > 1 ? "s" : ""}
      </span>

      {options.length === 0 ? (
        <span className="text-sm text-muted-foreground">
          Aucun changement d’état ne s’applique à toute la sélection.
        </span>
      ) : (
        <Select
          value=""
          onValueChange={(value) => {
            const next = value as OrderStatusKey;
            if (!options.includes(next)) return;
            if (next === "cancelled") {
              setConfirmTarget(next);
              return;
            }
            apply(next);
          }}
          disabled={bulk.isPending}
        >
          <SelectTrigger
            aria-label="Nouveau statut pour la sélection"
            className="h-9 w-full border-border sm:w-[200px]"
          >
            <SelectValue placeholder={bulk.isPending ? "Mise à jour…" : "Nouveau statut"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((next) => (
              <SelectItem key={next} value={next}>
                {ORDER_STATUS_LABEL[next]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button variant="ghost" size="sm" onClick={onClear} disabled={bulk.isPending}>
        <X className="size-4" aria-hidden />
        Annuler la sélection
      </Button>

      {bulk.isError ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {formatErrorText(bulk.error, "orders")}
        </p>
      ) : null}

      {/* Même exigence qu'à l'unité : l'annulation prévient les clientes. */}
      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Annuler {selectedIds.length} commande{selectedIds.length > 1 ? "s" : ""} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Chaque cliente concernée sera prévenue sur WhatsApp. C’est un état
              définitif : ces commandes ne pourront plus avancer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulk.isPending}>Ne pas annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulk.isPending}
              onClick={() => confirmTarget && apply(confirmTarget)}
            >
              {bulk.isPending ? "Annulation…" : "Annuler les commandes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
