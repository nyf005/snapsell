import { db } from "~/server/db";
import { captureException } from "~/lib/sentry";
import { workerLogger } from "~/lib/logger";

export const WORKER_HEARTBEAT = "messaging-worker";
const STALE_AFTER_MS = 3 * 60_000;
const PENDING_ALERT_MS = 5 * 60_000;

export async function getMessagingHealth(now = new Date()) {
  const [heartbeat, oldestPending] = await Promise.all([
    db.workerHeartbeat.findUnique({ where: { name: WORKER_HEARTBEAT } }),
    db.messageOut.findFirst({
      where: { status: "pending" }, orderBy: { createdAt: "asc" }, select: { createdAt: true },
    }),
  ]);
  const workerOk = Boolean(heartbeat && now.getTime() - heartbeat.lastSeenAt.getTime() < STALE_AFTER_MS);
  const outboxOk = !oldestPending || now.getTime() - oldestPending.createdAt.getTime() < PENDING_ALERT_MS;
  return { worker: workerOk ? "ok" : "stale", outbox: outboxOk ? "ok" : "delayed" } as const;
}

let lastAlertAt = 0;

export async function recordWorkerHeartbeat() {
  await db.workerHeartbeat.upsert({
    where: { name: WORKER_HEARTBEAT },
    create: { name: WORKER_HEARTBEAT, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });
  const health = await getMessagingHealth();
  if (health.outbox === "ok") lastAlertAt = 0;
  if (health.outbox === "delayed" && Date.now() - lastAlertAt >= 15 * 60_000) {
    lastAlertAt = Date.now();
    await captureException(new Error("outbox_delayed"), { tags: { component: "outbox-health" } });
    workerLogger.error("Outbox delayed: pending message older than five minutes", new Error("outbox_delayed"));
  }
}
