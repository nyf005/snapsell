import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "~/server/db";
import { withSignupAttempt, type SignupCheckpoint } from "./signup-attempt";

const run = process.env.RUN_INTEGRATION_TESTS === "true";
describe.skipIf(!run)("Durable WhatsApp connection recovery", () => {
  let tenantId: string;
  let otherTenantId: string;
  const appId = "signup-recovery-app";
  const input = (code: string = randomUUID()) => ({ tenantId, appId, code, wabaId: "waba-test" });
  const finish = (checkpoint: SignupCheckpoint, phone = "signup-recovery-phone") => db.$transaction(async tx => {
    await checkpoint.complete(tx, phone);
    await tx.tenant.update({ where: { id: tenantId }, data: { metaPhoneNumberId: phone } });
  });
  beforeAll(async () => {
    tenantId = (await db.tenant.create({ data: { name: "Signup recovery test" } })).id;
    otherTenantId = (await db.tenant.create({ data: { name: "Other signup tenant" } })).id;
  });
  beforeEach(async () => {
    await db.whatsAppSignupAttempt.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await db.tenant.update({ where: { id: tenantId }, data: { metaPhoneNumberId: null } });
  });
  afterAll(async () => {
    await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  });
  it("persists only a hashed code and encrypted token, then resumes after a failure", async () => {
    const params = input("sensitive-oauth-code");
    await expect(withSignupAttempt(params, async checkpoint => {
      await checkpoint.saveAccessToken("secret-token");
      throw new Error("Meta subscription failed");
    })).rejects.toThrow("Meta subscription failed");
    const saved = await db.whatsAppSignupAttempt.findFirstOrThrow({ where: { tenantId } });
    expect(saved.id).not.toContain(params.code);
    expect(saved.encryptedToken).toMatch(/^enc:/);
    expect(saved.encryptedToken).not.toContain("secret-token");
    expect(saved.leaseOwner).toBeNull();
    await withSignupAttempt(params, async checkpoint => {
      expect(checkpoint.accessToken).toBe("secret-token");
      await finish(checkpoint);
    });
    expect(await db.whatsAppSignupAttempt.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({ encryptedToken: null, completedAt: expect.any(Date) });
  });
  it("acknowledges a lost success response without reconnecting or resetting the tenant", async () => {
    const params = input();
    await withSignupAttempt(params, async checkpoint => { await finish(checkpoint); });
    await db.tenant.update({ where: { id: tenantId }, data: { assistantEnabled: true, metaHistorySyncStatus: "completed" } });
    const reconnect = vi.fn();
    await withSignupAttempt(params, reconnect);
    expect(reconnect).not.toHaveBeenCalled();
    expect(await db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).toMatchObject({ assistantEnabled: true, metaHistorySyncStatus: "completed" });
  });
  it("rolls completion back with the tenant transaction and keeps the recovery token", async () => {
    const params = input();
    await expect(withSignupAttempt(params, async checkpoint => {
      await checkpoint.saveAccessToken("recoverable-token");
      await db.$transaction(async tx => {
        await checkpoint.complete(tx, "phone");
        throw new Error("seller phone write failed");
      });
    })).rejects.toThrow("seller phone write failed");
    const attempt = await db.whatsAppSignupAttempt.findFirstOrThrow({ where: { tenantId } });
    expect(attempt.completedAt).toBeNull();
    await withSignupAttempt(params, async checkpoint => {
      expect(checkpoint.accessToken).toBe("recoverable-token");
      await finish(checkpoint);
    });
  });
  it("rejects cross-tenant replay and changes of target identifiers", async () => {
    const params = input();
    await withSignupAttempt(params, async checkpoint => { await checkpoint.saveAccessToken("token"); });
    const connect = vi.fn();
    await expect(withSignupAttempt({ ...params, tenantId: otherTenantId }, connect)).rejects.toMatchObject({ userKey: "whatsapp.signupRestart" });
    await expect(withSignupAttempt({ ...params, wabaId: "other-waba" }, connect)).rejects.toMatchObject({ userKey: "whatsapp.signupRestart" });
    expect(connect).not.toHaveBeenCalled();
  });
  it("allows only one simultaneous worker to use the same code", async () => {
    const params = input();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const first = withSignupAttempt(params, async checkpoint => { started(); await gate; await finish(checkpoint); });
    await entered;
    try {
      const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => withSignupAttempt(params, async () => { throw new Error("must not enter"); })));
      for (const result of attempts) {
        expect(result.status).toBe("rejected");
        if (result.status === "rejected") expect(result.reason).toMatchObject({ userKey: "whatsapp.signupBusy" });
      }
    } finally { release(); await first; }
  });
  it("handles concurrent creation of the checkpoint without duplicate completion", async () => {
    const params = input();
    const connect = vi.fn(async (checkpoint: SignupCheckpoint) => { await finish(checkpoint); });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => withSignupAttempt(params, connect)));
    expect(connect).toHaveBeenCalledOnce();
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ userKey: "whatsapp.signupBusy" });
    }
  });

  it("fences out an old worker after its lease was replaced", async () => {
    const params = input();
    await expect(withSignupAttempt(params, async checkpoint => {
      await db.whatsAppSignupAttempt.updateMany({ where: { tenantId }, data: { leaseOwner: "new-worker" } });
      await finish(checkpoint);
    })).rejects.toMatchObject({ userKey: "whatsapp.signupRestart" });
    expect((await db.tenant.findUniqueOrThrow({ where: { id: tenantId } })).metaPhoneNumberId).toBeNull();
    expect((await db.whatsAppSignupAttempt.findFirstOrThrow({ where: { tenantId } })).leaseOwner).toBe("new-worker");
  });
  it("takes over an expired lease using its saved token", async () => {
    const params = input();
    await withSignupAttempt(params, async checkpoint => { await checkpoint.saveAccessToken("saved"); });
    await db.whatsAppSignupAttempt.updateMany({ where: { tenantId }, data: { leaseOwner: "crashed-worker", leaseUntil: new Date(Date.now() - 1000) } });
    await withSignupAttempt(params, async checkpoint => { expect(checkpoint.accessToken).toBe("saved"); await finish(checkpoint); });
  });
  it("does not reuse an expired checkpoint", async () => {
    const params = input();
    await withSignupAttempt(params, async checkpoint => { await checkpoint.saveAccessToken("expired-token"); });
    await db.whatsAppSignupAttempt.updateMany({ where: { tenantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await withSignupAttempt(params, async checkpoint => { expect(checkpoint.accessToken).toBeUndefined(); });
  });
});
