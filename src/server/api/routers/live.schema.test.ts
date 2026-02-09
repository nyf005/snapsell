import { describe, expect, it } from "vitest";
import { releaseReservationInputSchema } from "./live.schema";

describe("live.schema", () => {
  describe("releaseReservationInputSchema", () => {
    it("accepts valid CUID", () => {
      expect(releaseReservationInputSchema.parse({ reservationId: "clr1234567890123456789012" })).toEqual({
        reservationId: "clr1234567890123456789012",
      });
    });

    it("rejects empty string", () => {
      expect(() => releaseReservationInputSchema.parse({ reservationId: "" })).toThrow();
    });

    it("rejects too short string", () => {
      expect(() => releaseReservationInputSchema.parse({ reservationId: "clr123" })).toThrow();
    });

    it("rejects non-CUID format (does not start with c)", () => {
      expect(() =>
        releaseReservationInputSchema.parse({ reservationId: "alr1234567890123456789012" }),
      ).toThrow();
    });

    it("rejects non-alphanumeric", () => {
      expect(() =>
        releaseReservationInputSchema.parse({ reservationId: "clr12345678901234567890-2" }),
      ).toThrow();
    });
  });
});
