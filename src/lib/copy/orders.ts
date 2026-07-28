/**
 * Libellés des états de commande — **une seule table**, deux vues dérivées.
 *
 * Il en existait trois, déclarées à la main côte à côte, et elles se contredisaient
 * sur le même écran : l'onglet « À préparer » affichait des lignes marquées
 * « Confirmée », « À confirmer » affichait « En attente acompte », et `preparing`
 * s'appelait « Prépa » en badge mais « Préparation » en onglet. La personne qui vend
 * devait tenir une table de traduction en tête, pendant un live.
 *
 * ── LA RÈGLE ────────────────────────────────────────────────────────────────
 * Un état porte le même mot partout : badge, filtre, onglet, message WhatsApp.
 * Les onglets reprennent donc les libellés des badges, verbatim.
 *
 * Une seule exception, assumée : l'onglet « À traiter », qui couvre **deux** états
 * à la fois. Il n'a aucun équivalent en badge et se place en tête — il ne peut donc
 * pas être confondu avec un état. C'est toute l'affordance de file de travail.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { OrderStatusKey } from "~/lib/order-status-transitions";

/** Le mot de chaque état. Source unique — voir DESIGN.md § Terminologie. */
export const ORDER_STATUS_LABEL: Record<OrderStatusKey, string> = {
  confirmed_pending_deposit: "En attente d’acompte",
  confirmed: "Confirmée",
  preparing: "En préparation",
  in_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

/** Ordre du flux, pour l'affichage des filtres et des onglets. */
export const ORDER_STATUS_FLOW: readonly OrderStatusKey[] = [
  "confirmed_pending_deposit",
  "confirmed",
  "preparing",
  "in_delivery",
  "delivered",
  "cancelled",
];

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status as OrderStatusKey] ?? status;
}

/** Options du menu de filtrage — dérivées, jamais réécrites à la main. */
export const orderFilterOptions: readonly { value: "" | OrderStatusKey; label: string }[] =
  [
    { value: "", label: "Tous les statuts" },
    ...ORDER_STATUS_FLOW.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] })),
  ];

/**
 * Identifiant de la vue de travail : soit un état, soit `""` (toutes),
 * soit la seule vue transversale.
 */
export type OrderWorkView = "" | "to_process" | OrderStatusKey;

/** Les états que couvre une vue. Vide = aucun filtre. */
export const ORDER_WORK_VIEW_STATUSES: Record<OrderWorkView, readonly OrderStatusKey[]> = {
  "": [],
  // La file de travail : ce qui attend une action.
  to_process: ["confirmed_pending_deposit", "confirmed"],
  confirmed_pending_deposit: ["confirmed_pending_deposit"],
  confirmed: ["confirmed"],
  preparing: ["preparing"],
  in_delivery: ["in_delivery"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

/** Onglets, dans l'ordre : la file de travail d'abord, puis le flux. */
export const orderWorkViews: readonly { value: OrderWorkView; label: string }[] = [
  { value: "to_process", label: "À traiter" },
  { value: "", label: "Toutes" },
  ...ORDER_STATUS_FLOW.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] })),
];

/**
 * Les états à demander au serveur pour une vue.
 * `undefined` = aucun filtre (vue « Toutes »).
 */
export function statusesForView(view: OrderWorkView): OrderStatusKey[] | undefined {
  const statuses = ORDER_WORK_VIEW_STATUSES[view];
  // Copie mutable : le schéma zod du routeur attend un tableau modifiable.
  return statuses.length > 0 ? [...statuses] : undefined;
}
