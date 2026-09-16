import { describe, expect, it } from "vitest";

import {
  buildPasswordResetPath,
  getResetPasswordValidationErrors,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
} from "./password-reset";

const TOKEN = "a".repeat(64);

describe("requestPasswordResetInputSchema", () => {
  it("normalise l’adresse comme la connexion", () => {
    expect(requestPasswordResetInputSchema.parse({ email: "  Boutique@Exemple.com " })).toEqual({
      email: "boutique@exemple.com",
    });
  });

  it("refuse une adresse invalide", () => {
    expect(requestPasswordResetInputSchema.safeParse({ email: "pas-un-email" }).success).toBe(false);
  });
});

describe("resetPasswordInputSchema", () => {
  it("accepte un jeton hexadécimal de 64 caractères et un mot de passe de 8+", () => {
    expect(resetPasswordInputSchema.safeParse({ token: TOKEN, password: "motdepasse" }).success).toBe(true);
  });

  it("refuse un jeton d’un autre format", () => {
    expect(resetPasswordInputSchema.safeParse({ token: "abc", password: "motdepasse" }).success).toBe(false);
    expect(resetPasswordInputSchema.safeParse({ token: "Z".repeat(64), password: "motdepasse" }).success).toBe(false);
  });

  it("refuse un mot de passe trop court", () => {
    expect(resetPasswordInputSchema.safeParse({ token: TOKEN, password: "court" }).success).toBe(false);
  });
});

describe("getResetPasswordValidationErrors", () => {
  it("signale une confirmation différente", () => {
    expect(getResetPasswordValidationErrors({ token: TOKEN, password: "motdepasse", confirmation: "autre" })).toEqual({
      confirmation: "Les deux mots de passe ne correspondent pas",
    });
  });

  it("ne renvoie rien quand tout est cohérent", () => {
    expect(getResetPasswordValidationErrors({ token: TOKEN, password: "motdepasse", confirmation: "motdepasse" })).toBeNull();
  });
});

describe("buildPasswordResetPath", () => {
  it("construit un chemin relatif portant le jeton", () => {
    expect(buildPasswordResetPath(TOKEN)).toBe(`/reinitialiser-mot-de-passe?token=${TOKEN}`);
  });
});
