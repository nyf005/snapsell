import { describe, it, expect } from "vitest";
import { parseVariantConfigText } from "./sellerVariantConfig";

describe("sellerVariantConfig - parseVariantConfigText", () => {
  it("should parse single dimension variants (e.g. Size)", () => {
    const input = "S:5, M:3, L:2, XL:0";
    const parsed = parseVariantConfigText(input);

    if (!parsed) throw new Error("Parsed result should not be null");
    expect(parsed).toHaveLength(4);
    expect(parsed[0]!).toEqual({
      label: "S",
      quantity: 5,
      values: { Dim1: "S" },
    });
    expect(parsed[3]!).toEqual({
      label: "XL",
      quantity: 0,
      values: { Dim1: "XL" },
    });
  });

  it("should parse multi-dimension variants (e.g. Color/Size)", () => {
    const input = "Rouge/S:5, Rouge/M:3, Bleu/S:2";
    const parsed = parseVariantConfigText(input);

    if (!parsed) throw new Error("Parsed result should not be null");
    expect(parsed).toHaveLength(3);
    expect(parsed[0]!).toEqual({
      label: "Rouge / S",
      quantity: 5,
      values: { Dim1: "Rouge", Dim2: "S" },
    });
    expect(parsed[2]!).toEqual({
      label: "Bleu / S",
      quantity: 2,
      values: { Dim1: "Bleu", Dim2: "S" },
    });
  });

  it("should handle messy spaces and casing", () => {
    const input = " rouge / s : 10 ,  BLEU/M : 5 ";
    const parsed = parseVariantConfigText(input);

    if (!parsed) throw new Error("Parsed result should not be null");
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.label).toBe("rouge / s");
    expect(parsed[1]!.label).toBe("BLEU / M");
    expect(parsed[0]!.quantity).toBe(10);
  });

  it("should return null for invalid formats", () => {
    expect(parseVariantConfigText("S5, M3")).toBeNull(); // Missing colon
    expect(parseVariantConfigText("S:abc")).toBeNull(); // Invalid quantity
    expect(parseVariantConfigText("")).toBeNull();      // Empty
  });
});
