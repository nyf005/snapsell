import { z } from "zod";
import { env } from "~/env";

const aiIntentSchema = z.enum(["BUY", "FAQ", "HUMAN_AGENT", "SELLER_CREATE", "OTHER"]);
const faqCategorySchema = z.enum(["delivery", "payment", "location", "availability"]);

const aiAnalysisSchema = z.object({
  intent: aiIntentSchema,
  confidence: z.coerce.number().min(0).max(1),
  entities: z
    .object({
      productCode: z.string().trim().min(1).optional(),
      quantity: z.coerce.number().int().positive().optional(),
      question: z.string().trim().min(1).optional(),
      faqCategory: faqCategorySchema.optional(),
    })
    .default({}),
});

export type AIIntent = z.infer<typeof aiIntentSchema>;
export type AIFaqCategory = z.infer<typeof faqCategorySchema>;
export type AIAnalysis = z.infer<typeof aiAnalysisSchema>;

const AI_FALLBACK_ANALYSIS: AIAnalysis = { intent: "OTHER", confidence: 0, entities: {} };

export const AI_CONFIDENCE_THRESHOLD: Record<AIIntent, number> = {
  BUY: 0.85,
  FAQ: 0.8,
  HUMAN_AGENT: 0.75,
  SELLER_CREATE: 0.9,
  OTHER: 1,
};

const AI_PRODUCT_CODE_PATTERN = /^[A-Za-z]+\d+$/;

export function parseAIAnalysisPayload(payload: unknown): AIAnalysis {
  const parsed = aiAnalysisSchema.safeParse(payload);
  if (!parsed.success) {
    return AI_FALLBACK_ANALYSIS;
  }

  const { productCode, ...restEntities } = parsed.data.entities;
  const normalizedCode = productCode?.toUpperCase().replace(/\s+/g, "");

  if (normalizedCode && !AI_PRODUCT_CODE_PATTERN.test(normalizedCode)) {
    return {
      ...parsed.data,
      entities: restEntities,
    };
  }

  return {
    ...parsed.data,
    entities: normalizedCode
      ? { ...restEntities, productCode: normalizedCode }
      : restEntities,
  };
}

export function hasTrustedAIIntent(
  analysis: AIAnalysis | null | undefined,
  intent: AIIntent,
): analysis is AIAnalysis {
  return (
    analysis?.intent === intent &&
    analysis.confidence >= AI_CONFIDENCE_THRESHOLD[intent]
  );
}

export function getTrustedAIProductIntent(
  analysis: AIAnalysis | null | undefined,
  intent: "BUY" | "SELLER_CREATE",
): { code: string; quantity: number } | null {
  if (!hasTrustedAIIntent(analysis, intent)) {
    return null;
  }

  const code = analysis.entities.productCode;
  if (!code || !AI_PRODUCT_CODE_PATTERN.test(code)) {
    return null;
  }

  return {
    code,
    quantity: analysis.entities.quantity ?? 1,
  };
}

export function getTrustedAIFaqCategory(
  analysis: AIAnalysis | null | undefined,
): AIFaqCategory | null {
  if (!hasTrustedAIIntent(analysis, "FAQ")) {
    return null;
  }

  return analysis.entities.faqCategory ?? null;
}

/**
 * Analyse l'intention d'un message client via un modèle LLM (Gemma 4 via API)
 */
export async function analyzeInboundIntent(body: string): Promise<AIAnalysis> {
  const { AI_API_KEY, AI_BASE_URL, AI_MODEL_NAME } = env;

  if (!AI_API_KEY) {
    // Fallback silencieux si pas d'API Key (évite de casser le webhook)
    return AI_FALLBACK_ANALYSIS;
  }

  const systemPrompt = `
    Tu es l'assistant IA de SnapSell. Analyse le message.
    Intentions : 
    - BUY (client veut acheter, ex: A12)
    - FAQ (question livraison/payement)
    - HUMAN_AGENT (demande parler humain)
    - SELLER_CREATE (le vendeur veut créer/ajouter un article, ex: "Ajoute 10 de B12")
    - OTHER.
    Réponds EXCLUSIVEMENT en JSON avec la structure {"intent": "...", "confidence": 0.9, "entities": {}}.
    L'objet "entities" doit TOUJOURS être présent.
    Si intent = BUY ou SELLER_CREATE, fournis si possible entities.productCode et entities.quantity.
    Si intent = FAQ, fournis entities.faqCategory parmi: delivery, payment, location, availability.
    Ne rédige jamais de réponse finale destinée à l'utilisateur.
  `;

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL_NAME,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: body },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Basse température pour plus de fiabilité
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message.content;

    if (!content) return AI_FALLBACK_ANALYSIS;

    return parseAIAnalysisPayload(JSON.parse(content));
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return AI_FALLBACK_ANALYSIS;
  }
}
