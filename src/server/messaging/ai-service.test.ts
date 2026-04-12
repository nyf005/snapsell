import { describe, expect, it } from "vitest";
import {
  getTrustedAIFaqCategory,
  getTrustedAIProductIntent,
  hasTrustedAIIntent,
  parseAIAnalysisPayload,
} from "./ai-service";

describe("ai-service guardrails", () => {
  it("parses and normalizes a valid AI payload", () => {
    const analysis = parseAIAnalysisPayload({
      intent: "BUY",
      confidence: "0.92",
      entities: {
        productCode: " a12 ",
        quantity: "2",
      },
    });

    expect(analysis).toEqual({
      intent: "BUY",
      confidence: 0.92,
      entities: {
        productCode: "A12",
        quantity: 2,
      },
    });
  });

  it("falls back safely when the AI payload is invalid", () => {
    const analysis = parseAIAnalysisPayload({
      intent: "BUY",
      confidence: "not-a-number",
      entities: {
        productCode: "bonjour",
      },
    });

    expect(analysis).toEqual({
      intent: "OTHER",
      confidence: 0,
      entities: {},
    });
  });

  it("rejects untrusted action intents below their confidence threshold", () => {
    const analysis = parseAIAnalysisPayload({
      intent: "SELLER_CREATE",
      confidence: 0.7,
      entities: {
        productCode: "B12",
        quantity: 3,
      },
    });

    expect(hasTrustedAIIntent(analysis, "SELLER_CREATE")).toBe(false);
    expect(getTrustedAIProductIntent(analysis, "SELLER_CREATE")).toBeNull();
  });

  it("returns a trusted FAQ category only when confidence is high enough", () => {
    const lowConfidence = parseAIAnalysisPayload({
      intent: "FAQ",
      confidence: 0.4,
      entities: {
        faqCategory: "payment",
      },
    });
    const highConfidence = parseAIAnalysisPayload({
      intent: "FAQ",
      confidence: 0.87,
      entities: {
        faqCategory: "payment",
      },
    });

    expect(getTrustedAIFaqCategory(lowConfidence)).toBeNull();
    expect(getTrustedAIFaqCategory(highConfidence)).toBe("payment");
  });
});
