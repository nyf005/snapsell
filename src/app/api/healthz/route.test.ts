import { beforeEach, expect, it, vi } from "vitest";
const ping = vi.hoisted(() => vi.fn());
const health = vi.hoisted(() => vi.fn());
vi.mock("~/server/db", () => ({ db: { $queryRaw: ping } }));
vi.mock("~/server/workers/health", () => ({ getMessagingHealth: health }));
import { GET } from "./route";
beforeEach(() => { ping.mockResolvedValue([]); health.mockResolvedValue({ worker: "ok", outbox: "ok" }); });
it("répond 503 quand le worker est absent malgré une base saine", async () => {
  health.mockResolvedValue({ worker: "stale", outbox: "ok" });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ db: "ok", worker: "stale" });
});
it("ne met pas en cache la santé du système", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
