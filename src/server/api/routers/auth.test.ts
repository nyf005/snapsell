import { describe, it, expect } from "vitest";
import { signupInputSchema } from "~/lib/validations/signup";

describe("auth signup input schema", () => {
  it("accepts valid input", () => {
    const valid = {
      email: "vendeur@example.com",
      password: "password123",
      tenantName: "Ma boutique",
      name: "Jean",
    };
    expect(signupInputSchema.parse(valid)).toEqual(valid);
  });

  it("accepts without optional name", () => {
    const valid = {
      email: "vendeur@example.com",
      password: "password123",
      tenantName: "Ma boutique",
    };
    expect(signupInputSchema.parse(valid)).toEqual(valid);
  });

  it("rejects invalid email", () => {
    expect(() =>
      signupInputSchema.parse({
        email: "not-an-email",
        password: "password123",
        tenantName: "Ma boutique",
      }),
    ).toThrow();
  });

  it("rejects short password", () => {
    expect(() =>
      signupInputSchema.parse({
        email: "vendeur@example.com",
        password: "short",
        tenantName: "Ma boutique",
      }),
    ).toThrow();
  });

  it("rejects empty tenant name", () => {
    expect(() =>
      signupInputSchema.parse({
        email: "vendeur@example.com",
        password: "password123",
        tenantName: "",
      }),
    ).toThrow();
  });
});
