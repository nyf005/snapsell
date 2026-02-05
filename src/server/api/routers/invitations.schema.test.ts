import { describe, it, expect } from "vitest";
import {
  createInvitationInputSchema,
  acceptInvitationInputSchema,
  getInvitationByTokenInputSchema,
} from "~/server/api/routers/invitations.schema";

describe("invitations schemas", () => {
  describe("createInvitationInputSchema", () => {
    it("accepts valid email", () => {
      const valid = { email: "agent@example.com" };
      expect(createInvitationInputSchema.parse(valid)).toEqual({ email: "agent@example.com" });
    });

    it("normalizes email to lowercase and trims", () => {
      const input = { email: "Agent@Example.COM" };
      expect(createInvitationInputSchema.parse(input)).toEqual({ email: "agent@example.com" });
    });

    it("rejects invalid email", () => {
      expect(() => createInvitationInputSchema.parse({ email: "not-an-email" })).toThrow();
    });

    it("rejects empty email", () => {
      expect(() => createInvitationInputSchema.parse({ email: "" })).toThrow();
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

    it("rejects missing name", () => {
      expect(() =>
        acceptInvitationInputSchema.parse({
          token: "abc123",
          password: "password123",
        }),
      ).toThrow();
    });

    it("rejects missing password", () => {
      expect(() =>
        acceptInvitationInputSchema.parse({
          token: "abc123",
          name: "Jean Dupont",
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
