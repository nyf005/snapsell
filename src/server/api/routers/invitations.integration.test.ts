import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

// Aucune donnée externe : cette suite exige la base locale dédiée contrôlée par le setup.
describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")("invitations — quotas PostgreSQL", () => {
  const tenants: string[] = [];
  const users: string[] = [];
  afterEach(async () => {
    const { db } = await import("~/server/db");
    await db.user.deleteMany({ where: { id: { in: users.splice(0) } } });
    await db.tenant.deleteMany({ where: { id: { in: tenants.splice(0) } } });
  });

  it.each(["new", "rejoin", "mixed"])("une seule place pour deux acceptations %s", async (mode) => {
    const { db } = await import("~/server/db");
    const { invitationsRouter, hashToken } = await import("./invitations");
    const tenant = await db.tenant.create({ data: { name: "Audit quota", maxAgents: 1 } });
    tenants.push(tenant.id);
    const attempts = await Promise.all([0, 1].map(async (i) => {
      const token = crypto.randomUUID();
      const email = `${token}@example.test`;
      const role = i === 0 ? "AGENT" as const : "MANAGER" as const;
      const existing = mode === "rejoin" || (mode === "mixed" && i === 1)
        ? await db.user.create({ data: { email, role, passwordHash: "unchanged" } }) : null;
      if (existing) users.push(existing.id);
      await db.invitation.create({ data: { tenantId: tenant.id, email, role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60000) } });
      const caller = invitationsRouter.createCaller({ db, headers: new Headers(), session: existing ? {
        user: { id: existing.id, email, role, tenantId: null }, expires: "2099-01-01",
      } : null });
      return () => caller.acceptInvitation({ token, name: "Audit", password: "audit-password" });
    }));
    const result = await Promise.allSettled(attempts.map(run => run()));
    const members = await db.user.findMany({ where: { tenantId: tenant.id } });
    users.push(...members.map(x => x.id));
    expect(result.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(members).toHaveLength(1);
    expect(await db.invitation.count({ where: { tenantId: tenant.id, consumedAt: null } })).toBe(1);
    if (mode === "rejoin") expect(members[0]?.passwordHash).toBe("unchanged");
  });
});
