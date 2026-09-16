import type { Prisma } from "../../../generated/prisma";

/** Hold the parent stock row while checking both direct and variant reservations. */
export async function canReplaceVariants(tx: Prisma.TransactionClient, tenantId: string, catalogueItemId: string): Promise<boolean> {
  const locked = await tx.catalogueItem.updateMany({
    where: { id: catalogueItemId, tenantId, reservedQty: 0 },
    data: { updatedAt: new Date() },
  });
  if (!locked.count) return false;
  return await tx.reservation.count({
    where: { tenantId, catalogueItemId,
      OR: [{ status: { in: ["reserved", "address_collected"] } }, { order: { isNot: null } }] },
  }) === 0;
}
