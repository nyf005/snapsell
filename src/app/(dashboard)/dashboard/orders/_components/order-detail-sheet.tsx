"use client";

import { useState } from "react";
import { MapPin, Package, Phone } from "lucide-react";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { formatDateTime, formatErrorText } from "~/lib/copy";
import { depositStatusLabel, orderStatusLabel } from "~/lib/copy/orders";
import { api } from "~/trpc/react";

import { OrderProofs } from "./order-proofs";

/**
 * Détail d'une commande.
 *
 * ── UN PANNEAU, PAS UNE ROUTE ───────────────────────────────────────────────
 * `orders.getById` existait depuis la story 5.2, avec ses tests, et **aucune
 * interface ne l'appelait** : un écran de détail était prévu, jamais construit.
 * Il l'est ici sous forme de panneau, pour trois raisons.
 *
 * Le dashboard n'a aucune route dynamique, et `TaskPageHeader` — source unique des
 * titres — exige un `href` présent dans `NAV_ITEMS` : une route `[orderId]` n'en
 * aurait pas. Ensuite, l'idiome du panneau existe déjà (`help-hint.tsx`). Enfin,
 * pendant un live on ne veut pas quitter la liste : on ouvre, on vérifie, on ferme.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La requête est `enabled` sur l'ouverture : la liste affiche des dizaines de
 * commandes, et aucune n'a à être chargée avant qu'on la demande.
 */

function Field({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Adresse recomposée à partir des champs structurés.
 *
 * Ces champs — commune, ville, zone, indications — étaient absents du `select` de
 * `ORDER_QUERY_INCLUDE` alors que `mapOrderOutput` les lisait : ils valaient donc
 * toujours `null`. Ce panneau est le premier à les afficher, et n'aurait montré
 * qu'un vide sans ce correctif.
 */
function deliveryLines(order: {
  deliveryAddress: string | null;
  deliveryAddressCommune: string | null;
  deliveryAddressCity: string | null;
  deliveryAddressZone: string | null;
  deliveryAddressDetails: string | null;
}): string[] {
  const place = [order.deliveryAddressCommune, order.deliveryAddressCity]
    .filter(Boolean)
    .join(", ");
  return [
    order.deliveryAddress,
    place || null,
    order.deliveryAddressZone ? `Zone : ${order.deliveryAddressZone}` : null,
    order.deliveryAddressDetails,
  ].filter((l): l is string => !!l);
}

export function OrderDetailSheet({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: order, isLoading } = api.orders.getById.useQuery(
    { orderId: orderId ?? "" },
    { enabled: open && !!orderId },
  );

  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const utils = api.useUtils();

  /**
   * ── DÉCIDER LÀ OÙ EST LA PIÈCE ──────────────────────────────────────────────
   * Ce panneau montrait la preuve sans permettre d'agir : on ouvrait une commande
   * en attente d'acompte, on voyait la preuve, on était convaincue — et il fallait
   * repartir sur l'écran des preuves pour la retrouver. C'était l'aller-retour de
   * départ, à l'envers.
   *
   * L'écran des preuves reste la file de travail et le seul endroit du traitement
   * en masse. Ici, c'est l'unité : une commande, sa pièce, sa décision.
   * ────────────────────────────────────────────────────────────────────────────
   *
   * L'invalidation couvre les quatre lectures concernées. `approve` et `reject`
   * écrivent aussi le `depositStatus` de la commande : sans `orders.list`, la liste
   * derrière le panneau garderait l'ancien badge. L'écran des preuves n'invalidait
   * que `proofs.listPending` et souffrait donc du même décalage.
   */
  const invalidateAll = () => {
    void utils.orders.list.invalidate();
    void utils.orders.getById.invalidate();
    void utils.proofs.listPending.invalidate();
    void utils.proofs.pendingCount.invalidate();
  };

  const approve = api.proofs.approve.useMutation({ onSuccess: invalidateAll });
  const reject = api.proofs.reject.useMutation({
    onSuccess: () => {
      setRejectTargetId(null);
      invalidateAll();
    },
  });

  const isActing = approve.isPending || reject.isPending;
  const actionError = approve.error ?? reject.error;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle className="text-xl font-bold tracking-tight text-foreground">
            {order ? `Commande ${order.orderNumber}` : "Commande"}
          </SheetTitle>
          <SheetDescription className="text-sm leading-6 text-muted-foreground">
            {order
              ? `${orderStatusLabel(order.status)} — ${depositStatusLabel(order.depositStatus)}`
              : "Chargement du détail…"}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !order ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <dl className="grid grid-cols-2 gap-4">
              <Field icon={<Package className="size-3.5" aria-hidden />} label="Article">
                {order.liveItemCode ?? "—"}
                {order.variantLabel ? (
                  <span className="text-muted-foreground"> · {order.variantLabel}</span>
                ) : null}
              </Field>
              <Field label="Quantité">{order.quantity ?? "—"}</Field>
              <Field icon={<Phone className="size-3.5" aria-hidden />} label="Cliente">
                {order.clientPhone}
              </Field>
              <Field label="Passée le">{formatDateTime(order.createdAt)}</Field>
            </dl>

            <div className="border-t border-border pt-6">
              <Field icon={<MapPin className="size-3.5" aria-hidden />} label="Livraison">
                {(() => {
                  const lines = deliveryLines(order);
                  if (lines.length === 0) {
                    return <span className="text-muted-foreground">Adresse non renseignée</span>;
                  }
                  return (
                    <span className="block space-y-0.5">
                      {lines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </span>
                  );
                })()}
              </Field>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="pb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preuves de paiement
              </h3>
              <OrderProofs
                proofs={order.proofs}
                orderNumber={order.orderNumber}
                actions={{
                  onApprove: (proofId) => approve.mutate({ proofId }),
                  onReject: (proofId) => setRejectTargetId(proofId),
                  disabled: isActing,
                }}
              />
              {actionError ? (
                <p role="alert" className="pt-3 text-sm text-destructive">
                  {formatErrorText(actionError, "proofs")}
                </p>
              ) : null}
            </div>

            {order.depositExpiresAt ? (
              <p className="border-t border-border pt-6 text-xs text-muted-foreground">
                Délai d’acompte jusqu’au {formatDateTime(order.depositExpiresAt)}.
              </p>
            ) : null}
          </div>
        )}
      </SheetContent>

      {/*
        Le refus demande confirmation, comme sur l'écran des preuves : il prévient
        la cliente et ferme une porte, là où valider ne fait qu'avancer.
      */}
      <AlertDialog
        open={rejectTargetId !== null}
        onOpenChange={(o) => !o && setRejectTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refuser cette preuve ?</AlertDialogTitle>
            <AlertDialogDescription>
              La preuve de la commande {order?.orderNumber} sera marquée comme refusée.
              Une nouvelle preuve pourra être envoyée selon le parcours actuel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reject.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={reject.isPending}
              onClick={() => rejectTargetId && reject.mutate({ proofId: rejectTargetId })}
            >
              {reject.isPending ? "Refus…" : "Refuser la preuve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
