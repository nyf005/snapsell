import { describe, expect, it } from "vitest";

import {
  canonicalImageContentType,
  isAllowedImageContentType,
} from "./image-content-type";

/**
 * Ce module est le garde-fou d'une faille réelle : `/api/media` sert des objets
 * R2 sans authentification, depuis l'origine de l'application, en réémettant le
 * type stocké. Un document HTML déposé par le chemin d'upload live — qui ne
 * validait rien — devenait donc du script exécutable sur notre propre domaine.
 *
 * Les cas ci-dessous décrivent la frontière exacte de ce qui peut sortir.
 */
describe("isAllowedImageContentType", () => {
  it("accepte les types image attendus de WhatsApp", () => {
    for (const type of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
    ]) {
      expect(isAllowedImageContentType(type)).toBe(true);
    }
  });

  it("accepte un type accompagné de ses paramètres", () => {
    expect(isAllowedImageContentType("image/jpeg; charset=binary")).toBe(true);
    expect(isAllowedImageContentType("  IMAGE/PNG  ")).toBe(true);
  });

  it("refuse les documents exécutables", () => {
    for (const type of [
      "text/html",
      "application/xhtml+xml",
      "text/javascript",
      "application/javascript",
    ]) {
      expect(isAllowedImageContentType(type)).toBe(false);
    }
  });

  /**
   * Un SVG est une image au sens du type MIME, mais un document au sens du
   * navigateur : il exécute du script. L'admettre rouvrirait la faille que ce
   * module ferme.
   */
  it("refuse le SVG, image au sens MIME mais document exécutable", () => {
    expect(isAllowedImageContentType("image/svg+xml")).toBe(false);
  });

  it("refuse un type absent ou vide plutôt que de le supposer", () => {
    expect(isAllowedImageContentType(null)).toBe(false);
    expect(isAllowedImageContentType(undefined)).toBe(false);
    expect(isAllowedImageContentType("")).toBe(false);
    expect(isAllowedImageContentType("   ")).toBe(false);
    expect(isAllowedImageContentType("application/octet-stream")).toBe(false);
  });

  it("ne se laisse pas contourner par un préfixe trompeur", () => {
    // `startsWith` — la comparaison d'origine — aurait laissé passer les deux.
    expect(isAllowedImageContentType("image/png-evil")).toBe(false);
    expect(isAllowedImageContentType("image/jpeg.html")).toBe(false);
  });
});

describe("canonicalImageContentType", () => {
  it("ne réémet que le type, jamais les paramètres reçus d'un tiers", () => {
    expect(canonicalImageContentType("image/jpeg; charset=binary")).toBe(
      "image/jpeg",
    );
    expect(canonicalImageContentType("IMAGE/PNG")).toBe("image/png");
    expect(canonicalImageContentType("  image/webp  ")).toBe("image/webp");
  });
});
