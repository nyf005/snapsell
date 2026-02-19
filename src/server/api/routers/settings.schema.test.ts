import { describe, it, expect } from "vitest";

import {
  setMetaConfigInputSchema,
} from "~/server/api/routers/settings.schema";

describe("setMetaConfigInputSchema", () => {
  it("accepts valid Meta config with all fields", () => {
    const out = setMetaConfigInputSchema.parse({
      metaPhoneNumberId: "123456789",
      metaWabaId: "987654321",
      metaAccessToken: "EAAx...",
    });
    expect(out.metaPhoneNumberId).toBe("123456789");
    expect(out.metaWabaId).toBe("987654321");
    expect(out.metaAccessToken).toBe("EAAx...");
  });

  it("trims whitespace on all fields", () => {
    const out = setMetaConfigInputSchema.parse({
      metaPhoneNumberId: "  123  ",
      metaWabaId: "  456  ",
      metaAccessToken: "  tok  ",
    });
    expect(out.metaPhoneNumberId).toBe("123");
    expect(out.metaWabaId).toBe("456");
    expect(out.metaAccessToken).toBe("tok");
  });

  it("transforms empty strings to null", () => {
    const out = setMetaConfigInputSchema.parse({
      metaPhoneNumberId: "",
      metaWabaId: "",
      metaAccessToken: "",
    });
    expect(out.metaPhoneNumberId).toBeNull();
    expect(out.metaWabaId).toBeNull();
    expect(out.metaAccessToken).toBeNull();
  });

  it("accepts null values", () => {
    const out = setMetaConfigInputSchema.parse({
      metaPhoneNumberId: null,
      metaWabaId: null,
      metaAccessToken: null,
    });
    expect(out.metaPhoneNumberId).toBeNull();
    expect(out.metaWabaId).toBeNull();
    expect(out.metaAccessToken).toBeNull();
  });

  it("accepts mix of values and nulls", () => {
    const out = setMetaConfigInputSchema.parse({
      metaPhoneNumberId: "123",
      metaWabaId: null,
      metaAccessToken: "",
    });
    expect(out.metaPhoneNumberId).toBe("123");
    expect(out.metaWabaId).toBeNull();
    expect(out.metaAccessToken).toBeNull();
  });
});
