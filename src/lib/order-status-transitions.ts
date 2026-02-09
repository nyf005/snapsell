/**
 * Story 6.3: Source unique des transitions de statut de commande.
 * Utilisé par le router orders (serveur) et la liste commandes (client).
 * confirmed/confirmed_pending_deposit → preparing → in_delivery → delivered ;
 * cancelled autorisé depuis confirmed, confirmed_pending_deposit, preparing, in_delivery.
 */

export const ORDER_STATUS_TRANSITIONS = {
  confirmed: ["preparing", "cancelled"],
  confirmed_pending_deposit: ["preparing", "cancelled"],
  preparing: ["in_delivery", "cancelled"],
  in_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
} as const;

export type OrderStatusKey = keyof typeof ORDER_STATUS_TRANSITIONS;

export function getAllowedNextStatuses(
  status: OrderStatusKey,
): readonly OrderStatusKey[] {
  return ORDER_STATUS_TRANSITIONS[status] ?? [];
}

export function canTransitionFrom(
  from: OrderStatusKey,
  to: OrderStatusKey,
): boolean {
  const allowed = ORDER_STATUS_TRANSITIONS[from];
  return allowed != null && (allowed as readonly string[]).includes(to);
}
