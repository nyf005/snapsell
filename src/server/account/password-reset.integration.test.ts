import { compare } from "bcrypt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  workerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "réinitialisation de mot de passe — PostgreSQL réel",
  () => {
    let db: typeof import("~/server/db").db;
    let issue: typeof import("./password-reset").issuePasswordResetToken;
    let reset: typeof import("./password-reset").resetPasswordWithToken;
    let tenantId: string;
    let userId: string;

    beforeAll(async () => {
      db = (await import("~/server/db")).db;
      ({ issuePasswordResetToken: issue, resetPasswordWithToken: reset } = await import("./password-reset"));
      tenantId = (await db.tenant.create({ data: { name: "Reset intégration" } })).id;
      userId = (
        await db.user.create({
          data: { tenantId, email: `reset-${Date.now()}@exemple.test`, passwordHash: "ancien", tokenVersion: 3 },
        })
      ).id;
    });

    afterAll(async () => {
      await db.tenant.delete({ where: { id: tenantId } });
    });

    it("un jeton sert une seule fois, change le mot de passe et incrémente tokenVersion", async () => {
      const { token } = await issue(userId);

      await expect(reset(token, "nouveau-mot-de-passe")).resolves.toEqual({ ok: true, userId });
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.tokenVersion).toBe(4);
      expect(await compare("nouveau-mot-de-passe", user.passwordHash!)).toBe(true);

      await expect(reset(token, "encore-un-autre")).resolves.toEqual({ ok: false, reason: "used" });
    });

    it("une nouvelle demande rend le lien précédent inutilisable", async () => {
      const first = await issue(userId);
      const second = await issue(userId);

      await expect(reset(first.token, "motdepasse-1")).resolves.toEqual({ ok: false, reason: "used" });
      await expect(reset(second.token, "motdepasse-2")).resolves.toEqual({ ok: true, userId });
    });

    it("deux consommations simultanées du même jeton n’en réussissent qu’une", async () => {
      const { token } = await issue(userId);
      const results = await Promise.all([reset(token, "concurrent-a"), reset(token, "concurrent-b")]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });

    it("sérialise les émissions simultanées et ne permet qu'un changement", async () => {
      const links = await Promise.all(Array.from({ length: 3 }, () => issue(userId)));
      expect(await db.passwordResetToken.count({where:{userId,usedAt:null}})).toBe(1);
      const results = [];
      for (const link of links) results.push(await reset(link.token, "password-concurrent"));
      expect(results.filter(r => r.ok)).toHaveLength(1);
    });

    it("réutilise le jeton d'un retry sans invalider une demande plus récente", async () => {
      const emailUser = await db.user.create({data:{tenantId,email:`delivery-${Date.now()}@example.test`,passwordHash:"old"}});
      const a = { id: "request-a", requestedAt: new Date(Date.now()-2000) };
      const b = { id: "request-b", requestedAt: new Date(Date.now()-1000) };
      const first = await issue(emailUser.id, a);
      const retry = await issue(emailUser.id, a);
      expect(retry).toEqual(first);
      expect(await db.passwordResetToken.count({where:{userId:emailUser.id}})).toBe(1);
      const newer = await issue(emailUser.id, b);
      expect(await issue(emailUser.id, a)).toBeNull();
      expect(await reset(newer!.token, "new-password")).toEqual({ok:true,userId:emailUser.id});
      expect(await issue(emailUser.id, b)).toBeNull();
    });

    it("un jeton expiré est refusé sans toucher au compte", async () => {
      const { token } = await issue(userId);
      const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
      await db.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await expect(reset(token, "trop-tard")).resolves.toEqual({ ok: false, reason: "expired" });
      const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.tokenVersion).toBe(before.tokenVersion);
    });
  },
);
