import { Client } from "@upstash/qstash";
import { db } from "~/server/db";
import { env } from "~/env";
import { boss, ensureBossReady, QUEUE } from "~/server/workers/queues";

const PUBLICATION_LEASE_MS = 120_000;

/** Un claim atomique protège la publication immédiate et la reprise périodique. */
export async function publishOutboxMessage(id: string): Promise<boolean> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + PUBLICATION_LEASE_MS);
  const claim = await db.messageOut.updateMany({
    where: {
      id, status: "pending", publishedAt: null,
      OR: [{ publishLeaseUntil: null }, { publishLeaseUntil: { lte: now } }],
    },
    data: { publishLeaseUntil: leaseUntil },
  });
  if (claim.count === 0) return false;

  try {
    if (env.QSTASH_TOKEN && env.NEXT_PUBLIC_APP_URL) {
      const client = new Client({ token: env.QSTASH_TOKEN, retry: { retries: 0 } });
      await client.publishJSON({
        url: `${env.NEXT_PUBLIC_APP_URL}/api/qstash/outbox-send`,
        body: { messageOutId: id },
        deduplicationId: id,
        retries: 5,
        failureCallback: `${env.NEXT_PUBLIC_APP_URL}/api/qstash/outbox-dlq`,
      });
    } else {
      if (env.NODE_ENV === "production") {
        throw new Error("QSTASH_TOKEN et NEXT_PUBLIC_APP_URL sont requis pour publier les messages");
      }
      await ensureBossReady();
      await boss.send(QUEUE.OUTBOX_SEND, { messageOutId: id }, { singletonKey: id });
    }
    await db.messageOut.updateMany({
      where: { id, publishLeaseUntil: leaseUntil },
      data: { publishedAt: new Date(), publishLeaseUntil: null },
    });
    return true;
  } catch (error) {
    // Même si le process s'arrête avant ce nettoyage, le bail expirera.
    await db.messageOut.updateMany({
      where: { id, publishLeaseUntil: leaseUntil },
      data: { publishLeaseUntil: null },
    });
    throw error;
  }
}
