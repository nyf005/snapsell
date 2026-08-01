import { describe, it, expect } from "vitest";
import { ASSIGNABLE_ROLES } from "~/lib/rbac";
import {
  createInvitationInputSchema,
  acceptInvitationInputSchema,
  getInvitationByTokenInputSchema,
} from "~/server/api/routers/invitations.schema";

describe("invitations schemas", () => {
  describe("createInvitationInputSchema", () => {
    it("accepts valid email", () => {
      const valid = { email: "agent@example.com" };
      expect(createInvitationInputSchema.parse(valid)).toEqual({
        email: "agent@example.com",
        role: "AGENT",
      });
    });

    it("normalizes email to lowercase and trims", () => {
      const input = { email: "Agent@Example.COM" };
      expect(createInvitationInputSchema.parse(input)).toEqual({
        email: "agent@example.com",
        role: "AGENT",
      });
    });

    it("rejects invalid email", () => {
      expect(() => createInvitationInputSchema.parse({ email: "not-an-email" })).toThrow();
    });

    it("rejects empty email", () => {
      expect(() => createInvitationInputSchema.parse({ email: "" })).toThrow();
    });

    /**
     * Le rôle est devenu choisissable. Le défaut reste le rôle le plus étroit :
     * un appel qui omet le champ ne peut pas élargir un accès par accident.
     */
    it("retombe sur AGENT quand le rôle est omis", () => {
      expect(createInvitationInputSchema.parse({ email: "a@b.co" }).role).toBe("AGENT");
    });

    it.each(ASSIGNABLE_ROLES)("accepte le rôle assignable %s", (role) => {
      expect(createInvitationInputSchema.parse({ email: "a@b.co", role }).role).toBe(role);
    });

    /**
     * OWNER désigne la personne qui a créé la boutique, OPS la console interne.
     * Ni l'un ni l'autre ne s'attribue par invitation — sans quoi une invitation
     * pourrait fabriquer un second Propriétaire, ou un accès multi-boutiques.
     */
    it.each(["OWNER", "OPS", "ADMIN", "agent"])("refuse le rôle %s", (role) => {
      expect(() => createInvitationInputSchema.parse({ email: "a@b.co", role })).toThrow();
    });
  });

  describe("acceptInvitationInputSchema", () => {
    it("accepts valid input", () => {
      const valid = {
        token: "abc123",
        name: "Jean Dupont",
        password: "password123",
      };
      expect(acceptInvitationInputSchema.parse(valid)).toEqual(valid);
    });

    /**
     * `name` et `password` ne sont plus exigés par le schéma, et ces deux cas
     * décrivent désormais pourquoi.
     *
     * Ils ne servent qu'à **créer** un compte. Quand l'invitation vise une
     * adresse qui en possède déjà un — une personne retirée de l'équipe puis
     * réinvitée — il n'y a rien à créer : le compte est rattaché à la boutique
     * sans que son mot de passe soit touché. Les exiger ici obligerait l'écran
     * à réclamer un mot de passe pour un compte existant, donc soit à l'ignorer
     * en silence, soit à laisser l'émetteur de l'invitation le redéfinir.
     *
     * L'exigence n'a pas disparu, elle s'est déplacée là où elle a un sens :
     * `acceptInvitation` la fait respecter sur le seul chemin de création
     * (cf. `invitations.test.ts`).
     */
    it("accepts a token alone — le rattachement d'un compte existant n'en demande pas plus", () => {
      expect(
        acceptInvitationInputSchema.parse({ token: "abc123" }),
      ).toEqual({ token: "abc123" });
    });

    it("accepts a name without password", () => {
      expect(
        acceptInvitationInputSchema.parse({
          token: "abc123",
          name: "Jean Dupont",
        }),
      ).toEqual({ token: "abc123", name: "Jean Dupont" });
    });

    it("rejects an empty name when one is provided", () => {
      expect(() =>
        acceptInvitationInputSchema.parse({
          token: "abc123",
          name: "",
          password: "password123",
        }),
      ).toThrow();
    });

    it("rejects short password", () => {
      expect(() =>
        acceptInvitationInputSchema.parse({
          token: "abc123",
          name: "Jean Dupont",
          password: "short",
        }),
      ).toThrow();
    });

    it("rejects empty token", () => {
      expect(() =>
        acceptInvitationInputSchema.parse({
          token: "",
          name: "Jean Dupont",
          password: "password123",
        }),
      ).toThrow();
    });
  });

  describe("getInvitationByTokenInputSchema", () => {
    it("accepts valid token", () => {
      const valid = { token: "abc123" };
      expect(getInvitationByTokenInputSchema.parse(valid)).toEqual(valid);
    });

    it("rejects empty token", () => {
      expect(() => getInvitationByTokenInputSchema.parse({ token: "" })).toThrow();
    });
  });
});
