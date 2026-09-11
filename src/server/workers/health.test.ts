import { beforeEach, expect, it, vi } from "vitest";
const heartbeat = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => vi.fn());
vi.mock("~/server/db", () => ({ db: { workerHeartbeat: { findUnique: heartbeat }, messageOut: { findFirst: pending } } }));
import { getMessagingHealth } from "./health";
const now = new Date("2026-09-11T12:00:00Z");
beforeEach(() => { heartbeat.mockResolvedValue({ lastSeenAt: now }); pending.mockResolvedValue(null); });
it("détecte un worker absent même avec une base accessible", async () => {
  heartbeat.mockResolvedValue(null);
  expect(await getMessagingHealth(now)).toEqual({ worker: "stale", outbox: "ok" });
});
it("détecte un worker qui ne consomme plus de tâches", async () => {
  heartbeat.mockResolvedValue({ lastSeenAt: new Date(now.getTime() - 181000) });
  expect((await getMessagingHealth(now)).worker).toBe("stale");
});
it("détecte les messages bloqués et ignore une attente normale", async () => {
  pending.mockResolvedValue({ createdAt: new Date(now.getTime() - 301000) });
  expect((await getMessagingHealth(now)).outbox).toBe("delayed");
  pending.mockResolvedValue({ createdAt: new Date(now.getTime() - 10000) });
  expect((await getMessagingHealth(now)).outbox).toBe("ok");
});
