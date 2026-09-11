import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdownHandler } from "./shutdown";

afterEach(() => vi.useRealTimers());
describe("worker shutdown", () => {
  it("sort normalement après SIGTERM", async () => {
    const exit = vi.fn();
    await createShutdownHandler({ stop: async () => {}, exit, onError: vi.fn() })();
    expect(exit).toHaveBeenCalledWith(0);
  });
  it("conserve le code fatal si un signal arrive pendant l'arrêt", async () => {
    let release!: () => void;
    const stop = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const exit = vi.fn();
    const shutdown = createShutdownHandler({ stop, exit, onError: vi.fn() });
    const pending = shutdown();
    void shutdown(true);
    release();
    await pending;
    expect(stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });
  it("une panne de nettoyage termine en erreur", async () => {
    const exit = vi.fn();
    await createShutdownHandler({ stop: async () => { throw new Error("db down"); }, exit, onError: vi.fn() })();
    expect(exit).toHaveBeenCalledWith(1);
  });
  it("force une sortie fatale si le nettoyage reste bloqué", async () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    void createShutdownHandler({ stop: () => new Promise(() => {}), exit, onError: vi.fn(), timeoutMs: 100 })();
    await vi.advanceTimersByTimeAsync(101);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
