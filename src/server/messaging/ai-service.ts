import { env } from "~/env";

export interface AIAnalysis {
  intent: "BUY" | "FAQ" | "HUMAN_AGENT" | "SELLER_CREATE" | "OTHER";
  confidence: number;
  entities: {
    productCode?: string;
    quantity?: number;
    question?: string;
  };
  suggestedReply?: string;
}

/**
 * Analyse l'intention d'un message client via un modèle LLM (Gemma 4 via API)
 */
export async function analyzeInboundIntent(body: string): Promise<AIAnalysis> {
  const { AI_API_KEY, AI_BASE_URL, AI_MODEL_NAME } = env;

  if (!AI_API_KEY) {
    // Fallback silencieux si pas d'API Key (évite de casser le webhook)
    return { intent: "OTHER", confidence: 0, entities: {} };
  }

  const systemPrompt = `
    Tu es l'assistant IA de SnapSell. Analyse le message.
    Intentions : 
    - BUY (client veut acheter, ex: A12)
    - FAQ (question livraison/payement)
    - HUMAN_AGENT (demande parler humain)
    - SELLER_CREATE (le vendeur veut créer/ajouter un article, ex: "Ajoute 10 de B12")
    - OTHER.
    Réponds EXCLUSIVEMENT en JSON.
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

    if (!content) return { intent: "OTHER", confidence: 0, entities: {} };

    return JSON.parse(content) as AIAnalysis;
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return { intent: "OTHER", confidence: 0, entities: {} };
  }
}
