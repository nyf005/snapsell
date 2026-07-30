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

/**
 * État de l'acompte d'une commande.
 *
 * `StatusBadge` traduisait ces valeurs à la main, et comparait à
 * « deposit_received » et « pending » — deux clés qui n'existent pas dans l'enum
 * Prisma (`no_deposit`, `deposit_pending`, `deposit_approved`, `deposit_rejected`).
 * Le libellé retombait donc sur la valeur brute, et `deposit_pending` s'affichait
 * tel quel : exactement ce que ce module a pour mission d'empêcher.
 */
const DEPOSIT_STATUS_LABEL: Record<string, string> = {
  no_deposit: "aucun acompte",
  deposit_pending: "acompte à vérifier",
  deposit_approved: "acompte validé",
  deposit_rejected: "acompte refusé",
};

export function depositStatusLabel(status: string | null | undefined): string {
  if (!status) return "aucun acompte";
  return DEPOSIT_STATUS_LABEL[status] ?? "acompte";
}

/** Le statut décrit-il un acompte dont il y a quelque chose à dire ? */
export function hasDeposit(status: string | null | undefined): boolean {
  return !!status && status !== "no_deposit";
}

/**
 * État d'une preuve de paiement.
 *
 * L'écran des preuves affichait « En attente » en dur, parce qu'il ne listait que
 * la file d'attente. Depuis qu'on peut consulter les preuves traitées, le libellé
 * doit suivre le statut réel.
 */
const PROOF_STATUS_LABEL: Record<string, string> = {
  pending: "À vérifier",
  approved: "Validée",
  rejected: "Refusée",
};

export function proofStatusLabel(status: string): string {
  return PROOF_STATUS_LABEL[status] ?? "Preuve";
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
