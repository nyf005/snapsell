/**
 * Tests du router conversations.
 *
 * `setHandedOff` n'était appelé qu'avec `true` : une conversation basculée vers une
 * personne ne revenait jamais au robot, et un faux positif de détection coupait le
 * service à une cliente sans que personne le sache. Le webhook applique désormais
 * une expiration de 24 h ; ce router permet de rendre la main plus tôt, et surtout
 * de voir quelles conversations sont concernées.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { HANDOFF_TTL_MS } from "~/server/workers/webhook-processor";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    conversationState: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

describe("conversations router", () => {
  const session = {
    user: {
      id: "user-1",
      email: "patronne@example.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };

  const agentSession = {
    user: { ...session.user, id: "user-2", role: "AGENT" },
  };

  async function callerFor(s: unknown = session) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: s as never,
    });
    return createCaller(ctx);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listHandedOff", () => {
    it("masque le numéro et calcule l'échéance de reprise", async () => {
      const since = new Date("2026-07-30T08:00:00Z");
      mockFindMany.mockResolvedValue([
        { id: "cs-1", phone: "+2250701020304", updatedAt: since },
      ]);

      const result = await (await callerFor()).conversations.listHandedOff();

      expect(result[0]).toMatchObject({
        id: "cs-1",
        phoneMasked: "***0304",
        expiresAt: new Date(since.getTime() + HANDOFF_TTL_MS),
      });
      // Le numéro réel reste disponible : c'est la clé de `handBackToBot`.
      expect(result[0]?.phone).toBe("+2250701020304");
    });

    it("ne lit que les conversations reprises en main de la boutique", async () => {
      mockFindMany.mockResolvedValue([]);

      await (await callerFor()).conversations.listHandedOff();

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: "tenant-1", handedOff: true },
        }),
      );
    });

    /** Reprendre une conversation fait partie du travail d'un Agent. */
    it("est ouvert à l'Agent", async () => {
      mockFindMany.mockResolvedValue([]);
      await expect(
        (await callerFor(agentSession)).conversations.listHandedOff(),
      ).resolves.toEqual([]);
    });

    it("signale une mise en retrait déjà expirée", async () => {
      mockFindMany.mockResolvedValue([
        {
          id: "cs-old",
          phone: "+2250701020304",
          updatedAt: new Date(Date.now() - HANDOFF_TTL_MS - 1000),
        },
      ]);

      const result = await (await callerFor()).conversations.listHandedOff();
      expect(result[0]?.expired).toBe(true);
    });
  });

  describe("handBackToBot", () => {
    it("remet handedOff à false", async () => {
      mockFindUnique.mockResolvedValue({ id: "cs-1", handedOff: true });
      mockUpdate.mockResolvedValue({});

      const result = await (
        await callerFor()
      ).conversations.handBackToBot({ phone: "+2250701020304" });

      expect(result).toEqual({ ok: true, alreadyBack: false });
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: "cs-1" },
        data: { handedOff: false },
      });
    });

    /** Deux boutiques peuvent parler au même numéro. */
    it("cherche la conversation dans la boutique de l'appelant", async () => {
      mockFindUnique.mockResolvedValue({ id: "cs-1", handedOff: true });
      mockUpdate.mockResolvedValue({});

      await (await callerFor()).conversations.handBackToBot({ phone: "+2250701020304" });

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_phone: { tenantId: "tenant-1", phone: "+2250701020304" } },
        }),
      );
    });

    it("renvoie NOT_FOUND pour une conversation inconnue", async () => {
      mockFindUnique.mockResolvedValue(null);

      await expect(
        (await callerFor()).conversations.handBackToBot({ phone: "+2250700000000" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    /** L'expiration automatique a pu passer avant le clic. */
    it("ne réécrit rien si la main est déjà rendue", async () => {
      mockFindUnique.mockResolvedValue({ id: "cs-1", handedOff: false });

      const result = await (
        await callerFor()
      ).conversations.handBackToBot({ phone: "+2250701020304" });

      expect(result).toEqual({ ok: true, alreadyBack: true });
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
