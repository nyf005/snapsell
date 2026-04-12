import { describe, it, expect } from "vitest";

import {
  e164PhoneSchema,
  normalizeIncomingPhone,
} from "~/lib/validations/phone";

describe("e164PhoneSchema", () => {
  it("accepts valid E.164 numbers", () => {
    expect(e164PhoneSchema.parse("+33612345678")).toBe("+33612345678");
    expect(e164PhoneSchema.parse("+14155552671")).toBe("+14155552671");
    expect(e164PhoneSchema.parse("+33123456789")).toBe("+33123456789");
  });

  it("rejects empty string", () => {
    expect(() => e164PhoneSchema.parse("")).toThrow();
  });

  it("rejects invalid format (no +)", () => {
    expect(() => e164PhoneSchema.parse("33612345678")).toThrow();
  });

  it("rejects invalid format (letters)", () => {
    expect(() => e164PhoneSchema.parse("+33abc45678")).toThrow();
  });

  it("normalizes and validates incoming numbers (with/without whatsapp prefix)", () => {
    // Note: normalizeIncomingPhone also performs CI 8->10 migration if input is 8-digit
    // But here we test simple normalization + validation
    expect(normalizeIncomingPhone("+2250709542783")).toBe("+2250709542783");
    expect(normalizeIncomingPhone("whatsapp:+2250709542783")).toBe("+2250709542783");
  });
});
