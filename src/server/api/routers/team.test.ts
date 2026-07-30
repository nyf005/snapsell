/**
 * Tests du router équipe.
 *
 * Le router n'en avait aucun, alors qu'il porte les deux écritures les plus
 * sensibles du produit après les paiements : changer le rôle d'une personne et
 * lui retirer l'accès à la boutique.
 *
 * L'assertion centrale est `tokenVersion: { increment: 1 }`. Les sessions sont des
 * JWT de sept jours et le rôle n'y est relu que s'il est absent : sans cet
 * incrément, `updateRole` et `removeMember` n'avaient aucun effet avant expiration
 * du jeton. Une rétrogradation laissait ses droits une semaine, et une personne
 * retirée gardait un accès complet — `enforceTenant` fait confiance au `tenantId`
 * du jeton sans le revérifier. C'est la régression que ce fichier interdit.
 */

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ASSIGNABLE_ROLES } from "~/lib/rbac";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockUserFindMany = vi.hoisted(() => vi.fn());
const mockUserFindFirst = vi.hoisted(() => vi.fn());
const mockUserUpdate = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    user: {
      findMany: mockUserFindMany,
      findFirst: mockUserFindFirst,
      update: mockUserUpdate,
    },
  },
}));

describe("team router", () => {
  const ownerSession = {
    user: {
      id: "user-owner",
      email: "patronne@example.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };

  const agentSession = {
    user: {
      id: "user-agent",
      email: "agent@example.com",
      tenantId: "tenant-1",
      role: "AGENT",
    },
  };

  /** Caller pour une session donnée. */
  async function callerFor(session: unknown) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: session as never,
    });
    return createCaller(ctx);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdate.mockResolvedValue({ id: "user-2" });
  });

  describe("updateRole", () => {
    /**
     * Le cœur du fichier : sans l'incrément, la mutation écrit en base et ne change
     * rien à ce que la personne peut faire jusqu'à l'expiration de son jeton.
     */
    it.each(ASSIGNABLE_ROLES)("attribue %s et révoque la session du membre", async (role) => {
      mockUserFindFirst.mockResolvedValue({ id: "user-2", role: "AGENT" });
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.updateRole({ userId: "user-2", role }),
      ).resolves.toEqual({ ok: true });

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { role, tokenVersion: { increment: 1 } },
      });
    });

    it("cherche la cible dans le tenant de l'appelant", async () => {
      mockUserFindFirst.mockResolvedValue({ id: "user-2", role: "AGENT" });
      const caller = await callerFor(ownerSession);

      await caller.team.updateRole({ userId: "user-2", role: "MANAGER" });

      expect(mockUserFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "user-2", tenantId: "tenant-1" } }),
      );
    });

    it("refuse de toucher au Propriétaire", async () => {
      mockUserFindFirst.mockResolvedValue({ id: "user-owner-2", role: "OWNER" });
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.updateRole({ userId: "user-owner-2", role: "AGENT" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("refuse qu'on modifie son propre rôle", async () => {
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.updateRole({ userId: "user-owner", role: "AGENT" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockUserFindFirst).not.toHaveBeenCalled();
    });

    it("refuse un appelant sans droits de gestion", async () => {
      const caller = await callerFor(agentSession);

      await expect(
        caller.team.updateRole({ userId: "user-2", role: "MANAGER" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("renvoie NOT_FOUND quand la cible n'est pas du tenant", async () => {
      mockUserFindFirst.mockResolvedValue(null);
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.updateRole({ userId: "user-autre-tenant", role: "MANAGER" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    /** Les rôles hors `ASSIGNABLE_ROLES` sont refusés par Zod, avant le router. */
    it.each(["OWNER", "OPS", "VENDEUR"])("refuse le rôle %s", async (role) => {
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.updateRole({ userId: "user-2", role: role as never }),
      ).rejects.toThrow(TRPCError);
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });
  });

  describe("removeMember", () => {
    it("détache du tenant et révoque la session", async () => {
      mockUserFindFirst.mockResolvedValue({ id: "user-2", role: "AGENT" });
      const caller = await callerFor(ownerSession);

      await expect(caller.team.removeMember({ userId: "user-2" })).resolves.toEqual({
        ok: true,
      });

      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "user-2" },
        data: { tenantId: null, tokenVersion: { increment: 1 } },
      });
    });

    it("refuse de retirer le Propriétaire", async () => {
      mockUserFindFirst.mockResolvedValue({ id: "user-owner-2", role: "OWNER" });
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.removeMember({ userId: "user-owner-2" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("refuse qu'on se retire soi-même", async () => {
      const caller = await callerFor(ownerSession);

      await expect(
        caller.team.removeMember({ userId: "user-owner" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockUserFindFirst).not.toHaveBeenCalled();
    });

    it("refuse un appelant sans droits de gestion", async () => {
      const caller = await callerFor(agentSession);

      await expect(
        caller.team.removeMember({ userId: "user-2" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });
  });

  describe("listMembers", () => {
    it("renvoie les membres du tenant au Propriétaire", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          id: "user-2",
          email: "agent@example.com",
          name: "Awa Traoré",
          role: "AGENT",
          createdAt: new Date("2026-01-02"),
          updatedAt: new Date("2026-01-02"),
        },
      ]);
      const caller = await callerFor(ownerSession);

      const result = await caller.team.listMembers();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: "user-2", role: "AGENT" });
      expect(mockUserFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "tenant-1" } }),
      );
    });

    /** Repli sur l'e-mail quand le nom est absent, plutôt qu'un libellé vide. */
    it("dérive un nom de l'e-mail quand il manque", async () => {
      mockUserFindMany.mockResolvedValue([
        {
          id: "user-3",
          email: "sans-nom@example.com",
          name: null,
          role: "AGENT",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const caller = await callerFor(ownerSession);

      const result = await caller.team.listMembers();
      expect(result[0]?.name).toBe("sans-nom");
    });

    /**
     * Renvoie une liste vide au lieu de FORBIDDEN : l'écran Équipe est déjà fermé
     * en amont, et un throw ici ferait remonter une erreur là où il n'y a rien à
     * montrer.
     */
    it("renvoie une liste vide à un rôle sans droits de gestion", async () => {
      const caller = await callerFor(agentSession);

      await expect(caller.team.listMembers()).resolves.toEqual([]);
      expect(mockUserFindMany).not.toHaveBeenCalled();
    });
  });
});
