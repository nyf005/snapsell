import { db } from "~/server/db";
import { adjustReservationStock } from "./stock";

/** A cancellation and its stock release either both commit, or neither does. */
export async function cancelActiveReservations(tenantId: string, clientPhone: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const reservations = await tx.reservation.findMany({
      where: { tenantId, clientPhone, status: { in: ["reserved", "address_collected"] } },
      orderBy: { id: "asc" },
    });
    let cancelled = 0;
    for (const reservation of reservations) {
      const claimed = await tx.reservation.updateMany({
        where: { id: reservation.id, tenantId, status: { in: ["reserved", "address_collected"] } },
        data: { status: "expired" },
      });
      if (!claimed.count) continue;
      await adjustReservationStock(tx, reservation, "release");
      cancelled++;
    }
    return cancelled;
  });
}
