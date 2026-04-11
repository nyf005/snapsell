/**
 * Flow de configuration des variantes côté vendeur via WhatsApp (Option B).
 *
 * Protocole en 2 messages :
 *   1. Bot envoie le template avec instructions + exemple
 *   2. Vendeur répond avec format « Label:stock, Label:stock »
 *      ex: « Rouge/S:5, Rouge/M:3, Bleu/S:2, Bleu/M:0 »
 *      ou  « S:5, M:3, L:2, XL:0 » pour une seule dimension
 *
 * State conservé dans ConversationState (vendeur) :
 *   { itemId, code, dimensions }
 */

import { db } from "~/server/db";
import { Prisma } from "../../../generated/prisma";
import { writeToOutbox } from "~/server/messaging/outbox";
import { workerLogger } from "~/lib/logger";

export const SELLER_VARIANT_CONFIG_STATE = "seller_config_variants" as const;

type SellerVariantConfigMetadata = {
  itemId: string;
  code: string;
  /** Dimensions OPTIONNELLES — déduites automatiquement depuis la saisie */
  dimensions: string[];
};

const STATE_KEY = SELLER_VARIANT_CONFIG_STATE;

// ─── Pattern de parsing ────────────────────────────────────────────────────
// Accepte : "Rouge/S:3" ou "S:3" ou "  rouge / s : 3  "
const VARIANT_ENTRY_PATTERN = /^(.+?)\s*:\s*(\d+)$/;

export type ParsedVariantEntry = {
  label: string;  // ex: "Rouge / S"
  quantity: number;
  /** Valeurs structurées \u2014 on déduit les dimensions par les "/" dans le label */
  values: Record<string, string>;
};

/**
 * Parse une saisie vendeur du type « S:5, M:3, L:2, XL:0 »
 * ou « Rouge/S:5, Rouge/M:3, Bleu/S:2 ».
 * Retourne null si le format n'est pas reconnu (≥ 1 entrée valide requise).
 */
export function parseVariantConfigText(text: string): ParsedVariantEntry[] | null {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const entries: ParsedVariantEntry[] = [];
  for (const part of parts) {
    const m = part.match(VARIANT_ENTRY_PATTERN);
    if (!m) return null; // format invalide → abort entier
    const rawLabel = m[1]!.trim();
    const quantity = parseInt(m[2]!, 10);
    if (isNaN(quantity) || quantity < 0) return null;

    // Déduire les valeurs depuis le label (séparateur "/")
    const segments = rawLabel.split("/").map((s) => s.trim());
    const label = segments.join(" / ");
    // Générer des clés "Dim1" … "DimN" (sera remplacé plus tard si dimensions connues)
    const values: Record<string, string> = {};
    segments.forEach((seg, i) => {
      values[`Dim${i + 1}`] = seg;
    });

    entries.push({ label, quantity, values });
  }

  return entries.length > 0 ? entries : null;
}

/**
 * Injecte les vraies clés de dimensions dans les `values` de chaque entrée.
 * Si le vendeur a saisi « Rouge/S:5 » et que les dimensions sont [« Couleur », « Taille »],
 * on obtient { Couleur: "Rouge", Taille: "S" }.
 */
function injectDimensions(
  entries: ParsedVariantEntry[],
  dimensions: string[],
): ParsedVariantEntry[] {
  if (dimensions.length === 0) return entries;
  return entries.map((e) => {
    const segments = e.label.split(" / ");
    const values: Record<string, string> = {};
    segments.forEach((seg, i) => {
      const dimKey = dimensions[i] ?? `Dim${i + 1}`;
      values[dimKey] = seg;
    });
    return { ...e, values };
  });
}

/**
 * Démarre le flow de config variantes pour un vendeur.
 * Appelé quand le vendeur clique sur « ⚙️ Configurer Variantes » pour un article avec variantes.
 */
export async function startSellerVariantConfig(
  tenantId: string,
  sellerPhone: string,
  itemId: string,
  code: string,
  correlationId: string,
  existingDimensions: string[] = [],
) {
  const metadata: SellerVariantConfigMetadata = { itemId, code, dimensions: existingDimensions };

  await db.conversationState.upsert({
    where: { tenantId_phone: { tenantId, phone: sellerPhone } },
    create: { tenantId, phone: sellerPhone, state: STATE_KEY, metadata },
    update: { state: STATE_KEY, metadata },
  });

  const dimExample = existingDimensions.length > 0
    ? existingDimensions.join(" + ")
    : "ex: Taille ou Couleur/Taille";

  const example = existingDimensions.length === 2
    ? `Rouge/S:5, Rouge/M:3, Bleu/S:2, Bleu/M:0`
    : existingDimensions.length === 1
      ? `S:5, M:3, L:2, XL:0`
      : `S:5, M:3 ou Rouge/S:5, Rouge/M:3, Bleu/S:2`;

  await writeToOutbox({
    tenantId,
    to: sellerPhone,
    body: [
      `⚙️ Configuration des variantes pour *${code}* (${dimExample})`,
      ``,
      `Répondez avec vos variantes dans ce format :`,
      `\`Label:stock, Label:stock\``,
      ``,
      `📝 Exemple :`,
      `\`${example}\``,
      ``,
      `Les stocks à 0 seront créés mais marqués épuisés.`,
      `Répondez *annuler* pour abandonner.`,
    ].join("\n"),
    correlationId,
  });
}

/**
 * Traite la réponse du vendeur à la question de configuration des variantes.
 * Appelé dans le webhook-processor quand le ConversationState = seller_config_variants.
 */
export async function handleSellerVariantConfigReply(
  tenantId: string,
  sellerPhone: string,
  body: string,
  correlationId: string,
): Promise<boolean> {
  const conv = await db.conversationState.findUnique({
    where: { tenantId_phone: { tenantId, phone: sellerPhone } },
  });

  if (!conv || conv.state !== STATE_KEY) return false;

  const metadata = conv.metadata as unknown as SellerVariantConfigMetadata;

  // Annulation
  if (body.trim().toLowerCase() === "annuler") {
    await clearSellerState(conv.id);
    await writeToOutbox({ tenantId, to: sellerPhone, body: "❌ Configuration des variantes annulée.", correlationId });
    return true;
  }

  const parsed = parseVariantConfigText(body.trim());
  if (!parsed) {
    await writeToOutbox({
      tenantId,
      to: sellerPhone,
      body: [
        `❌ Format non reconnu. Utilisez :`,
        `\`Label:stock, Label:stock\``,
        ``,
        `Exemple : \`S:5, M:3, L:2, XL:0\``,
        `ou \`Rouge/S:5, Rouge/M:3, Bleu/S:2\``,
        ``,
        `Répondez *annuler* pour abandonner.`,
      ].join("\n"),
      correlationId,
    });
    return true;
  }

  const withDimensions = injectDimensions(parsed, metadata.dimensions);

  // Déduire les dimensions depuis les labels si non-définies
  const firstLabel = withDimensions[0]!.label;
  const segCount = firstLabel.split(" / ").length;
  const finalDimensions = metadata.dimensions.length > 0
    ? metadata.dimensions
    : Array.from({ length: segCount }, (_, i) => `Dim${i + 1}`);

  try {
    await db.$transaction(async (tx) => {
      // Supprimer anciennes variantes
      await tx.itemVariant.deleteMany({ where: { catalogueItemId: metadata.itemId, tenantId } });

      // Créer nouvelles variantes
      await tx.itemVariant.createMany({
        data: withDimensions.map((e) => ({
          tenantId,
          catalogueItemId: metadata.itemId,
          label: e.label,
          values: e.values,
          quantity: e.quantity,
          availableQty: e.quantity,
          reservedQty: 0,
        })),
      });

      // Mettre à jour article : dimensions + stock agrégé
      const totalQty = withDimensions.reduce((s, e) => s + e.quantity, 0);
      await tx.catalogueItem.update({
        where: { id: metadata.itemId },
        data: {
          attributes: finalDimensions,
          quantity: totalQty,
          availableQty: totalQty,
          reservedQty: 0,
        },
      });
    });

    await clearSellerState(conv.id);

    const summary = withDimensions
      .map((e) => `  • ${e.label} : ${e.quantity} en stock`)
      .join("\n");

    await writeToOutbox({
      tenantId,
      to: sellerPhone,
      body: [
        `✅ Variantes de *${metadata.code}* configurées (${withDimensions.length} variante${withDimensions.length > 1 ? "s" : ""}) :`,
        summary,
      ].join("\n"),
      correlationId,
    });
  } catch (err) {
    workerLogger.error("Failed to save seller variant config", { tenantId, itemId: metadata.itemId, err });
    await writeToOutbox({
      tenantId,
      to: sellerPhone,
      body: "❌ Une erreur est survenue lors de la sauvegarde. Réessayez ou passez par le dashboard.",
      correlationId,
    });
  }

  return true;
}

async function clearSellerState(convId: string) {
  await db.conversationState.update({
    where: { id: convId },
    data: { state: null, metadata: Prisma.JsonNull },
  }).catch(() => { /* best-effort */ });
}
