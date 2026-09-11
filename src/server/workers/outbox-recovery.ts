import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { publishOutboxMessage } from "~/server/messaging/outbox-publisher";

/** Lot borné ; les messages plus récents disposent d'abord de leur publication immédiate. */
export async function runOutboxRecovery(now = new Date()): Promise<number> {
  const messages = await db.messageOut.findMany({
    where: {
      status: "pending", publishedAt: null,
      createdAt: { lte: new Date(now.getTime() - 30_000) },
      OR: [{ publishLeaseUntil: null }, { publishLeaseUntil: { lte: now } }],
    },
    orderBy: { createdAt: "asc" }, take: 100, select: { id: true },
  });
  let published = 0;
  for (const message of messages) {
    try {
      if (await publishOutboxMessage(message.id)) published++;
    } catch (error) {
      workerLogger.error("Outbox recovery: publication failed", error, { messageOutId: message.id });
      // Une panne globale ne doit pas produire 100 appels et 100 erreurs par minute.
      break;
    }
  }
  return published;
}
