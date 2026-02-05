import { describe, it, expect } from "vitest";

import {
  e164PhoneSchema,
  setWhatsAppConfigInputSchema,
} from "~/server/api/routers/settings.schema";

describe("e164PhoneSchema", () => {
  it("accepts valid E.164 numbers", () => {
    expect(e164PhoneSchema.parse("+33612345678")).toBe("+33612345678");
    expect(e164PhoneSchema.parse("+14155552671")).toBe("+14155552671");
    expect(e164PhoneSchema.parse("+33123456789")).toBe("+33123456789");
  });

  it("trims whitespace", () => {
    expect(e164PhoneSchema.parse("  +33612345678  ")).toBe("+33612345678");
  });

  it("rejects empty string", () => {
    expect(() => e164PhoneSchema.parse("")).toThrow();
  });

  it("rejects invalid format (no +)", () => {
    expect(() => e164PhoneSchema.parse("33612345678")).toThrow();
  });

  it("rejects invalid format (too short)", () => {
    expect(() => e164PhoneSchema.parse("+33612")).toThrow();
  });

  it("rejects invalid format (letters)", () => {
    expect(() => e164PhoneSchema.parse("+33abc45678")).toThrow();
  });
});

describe("setWhatsAppConfigInputSchema", () => {
  it("accepts valid E.164 and returns it", () => {
    const out = setWhatsAppConfigInputSchema.parse({
      whatsappPhoneNumber: "+33612345678",
    });
    expect(out.whatsappPhoneNumber).toBe("+33612345678");
  });

  it("accepts null", () => {
    const out = setWhatsAppConfigInputSchema.parse({
      whatsappPhoneNumber: null,
    });
    expect(out.whatsappPhoneNumber).toBeNull();
  });

  it("transforms empty string to null", () => {
    const out = setWhatsAppConfigInputSchema.parse({
      whatsappPhoneNumber: "",
    });
    expect(out.whatsappPhoneNumber).toBeNull();
  });

  it("rejects invalid E.164", () => {
    expect(() =>
      setWhatsAppConfigInputSchema.parse({
        whatsappPhoneNumber: "not-a-number",
      }),
    ).toThrow();
  });

  it("rejects number without +", () => {
    expect(() =>
      setWhatsAppConfigInputSchema.parse({
        whatsappPhoneNumber: "33612345678",
      }),
    ).toThrow();
  });
});
