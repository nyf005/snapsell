import { describe, expect, it } from "vitest";

import { resolveCategoryFromCategories } from "./resolve-category";

describe("resolveCategoryFromCategories", () => {
  it("résout une catégorie d’une lettre", () => {
    expect(resolveCategoryFromCategories(["A", "B"], "A12")).toBe("A");
  });

  it("préfère le préfixe le plus long", () => {
    expect(resolveCategoryFromCategories(["A", "AB"], "AB12")).toBe("AB");
    expect(resolveCategoryFromCategories(["AB", "A"], "AB12")).toBe("AB");
  });

  it("résout une catégorie mot entier", () => {
    expect(resolveCategoryFromCategories(["P", "Premium"], "Premium1")).toBe("Premium");
  });

  it("renvoie null quand aucun préfixe ne correspond", () => {
    // Le piège classique : la grille ne contient que « AB », le code commence par « A1 ».
    expect(resolveCategoryFromCategories(["AB"], "A1")).toBeNull();
    expect(resolveCategoryFromCategories(["A", "B"], "Z9")).toBeNull();
  });

  it("ignore la casse et les espaces", () => {
    expect(resolveCategoryFromCategories(["A"], "  a12  ")).toBe("A");
    expect(resolveCategoryFromCategories(["premium"], "PREMIUM7")).toBe("premium");
  });

  it("renvoie le libellé tel qu’enregistré, pas la version majuscule", () => {
    expect(resolveCategoryFromCategories(["Premium"], "premium3")).toBe("Premium");
  });

  it("gère les cas vides", () => {
    expect(resolveCategoryFromCategories([], "A12")).toBeNull();
    expect(resolveCategoryFromCategories(["A"], "")).toBeNull();
    expect(resolveCategoryFromCategories(["A"], "   ")).toBeNull();
  });

  it("dédoublonne les catégories", () => {
    expect(resolveCategoryFromCategories(["A", "A", "A"], "A5")).toBe("A");
  });

  it("est déterministe à longueur égale (ordre alphabétique)", () => {
    // « AB » et « AC » ne peuvent pas matcher le même code, mais l'ordre doit
    // rester stable quel que soit l'ordre d'entrée.
    expect(resolveCategoryFromCategories(["AC", "AB"], "AB1")).toBe("AB");
    expect(resolveCategoryFromCategories(["AB", "AC"], "AC1")).toBe("AC");
  });

  it("accepte un code égal à la catégorie, sans numéro", () => {
    expect(resolveCategoryFromCategories(["A"], "A")).toBe("A");
  });
});
