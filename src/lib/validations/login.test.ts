import { describe, it, expect } from "vitest";

import {
  getLoginValidationErrors,
  loginInputSchema,
} from "~/lib/validations/login";

describe("login input schema", () => {
  it("accepts valid email and password", () => {
    const valid = {
      email: "vendeur@example.com",
      password: "password123",
    };
    expect(loginInputSchema.parse(valid)).toEqual(valid);
  });

  it("rejects invalid email", () => {
    expect(() =>
      loginInputSchema.parse({
        email: "not-an-email",
        password: "password123",
      }),
    ).toThrow();
  });

  it("rejects empty password", () => {
    expect(() =>
      loginInputSchema.parse({
        email: "vendeur@example.com",
        password: "",
      }),
    ).toThrow();
  });
});

describe("getLoginValidationErrors", () => {
  it("returns null for valid input", () => {
    expect(
      getLoginValidationErrors({
        email: "vendeur@example.com",
        password: "password123",
      }),
    ).toBeNull();
  });

  it("returns field errors for invalid input", () => {
    const err = getLoginValidationErrors({
      email: "invalid",
      password: "",
    });
    expect(err).not.toBeNull();
    expect(err).toHaveProperty("email");
    expect(err).toHaveProperty("password");
  });
});
