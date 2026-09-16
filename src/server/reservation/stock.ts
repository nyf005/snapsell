import type { Prisma } from "../../../generated/prisma";

export type ReservationStock = {
  tenantId: string;
  quantity: number;
  catalogueItemId: string | null;
  liveItemId: string | null;
  variantId: string | null;
};

/** Call only after claiming the reservation/order transition in the same transaction. */
export async function adjustReservationStock(
  tx: Prisma.TransactionClient,
  reservation: ReservationStock,
  action: "release" | "restore",
): Promise<void> {
  const { tenantId, quantity, variantId, catalogueItemId, liveItemId } = reservation;
  const data = action === "release"
    ? { reservedQty: { decrement: quantity } }
    : { availableQty: { increment: quantity }, quantity: { increment: quantity } };
  const guard = action === "release" ? { reservedQty: { gte: quantity } } : {};
  const where = { tenantId, ...guard };
  let count = 0;
  if (variantId) {
    count = (await tx.itemVariant.updateMany({ where: { ...where, id: variantId }, data })).count;
    if (count && catalogueItemId) {
      count = (await tx.catalogueItem.updateMany({ where: { ...where, id: catalogueItemId }, data: { ...data, syncedToMeta: false } })).count;
    }
  } else if (catalogueItemId) {
    count = (await tx.catalogueItem.updateMany({ where: { ...where, id: catalogueItemId }, data: { ...data, syncedToMeta: false } })).count;
  } else if (liveItemId) {
    count = (await tx.liveItem.updateMany({ where: { ...where, id: liveItemId }, data })).count;
  }
  if (!count) throw new Error("Stock transition failed; reservation/order must remain unchanged");
}
