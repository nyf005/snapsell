import { db } from "~/server/db";
import { Prisma } from "../../../generated/prisma";
import { botMsg } from "~/server/messaging/templates";
import { writeToOutbox } from "~/server/messaging/outbox";
import { workerLogger } from "~/lib/logger";
import { createReservation } from "~/server/reservation/service";

/** States for variant selection flow */
export const VARIANT_SELECTION_STATE = {
  CHOOSING_DIMENSION: "choosing_dimension",
  COMPLETED: "completed",
} as const;

export type VariantSelectionMetadata = {
  itemId: string;
  code: string;
  quantity: number;
  liveSessionId: string | null; // Conservé pour lier la réservation à la session live
  dimensions: string[]; // ex: ["Couleur", "Taille"]
  selections: Record<string, string>; // ex: { "Couleur": "Rouge" }
  currentDimensionIndex: number;
};

/**
 * Starts the variant selection flow for a client.
 */
export async function startVariantSelection(
  tenantId: string,
  from: string, // phone E.164
  catalogueItem: { id: string; code: string; attributes: any },
  quantity: number,
  correlationId: string,
  liveSessionId: string | null = null,
) {
  const attributes = (catalogueItem.attributes as string[]) || [];
  if (attributes.length === 0) return null;

  const metadata: VariantSelectionMetadata = {
    itemId: catalogueItem.id,
    code: catalogueItem.code,
    quantity,
    liveSessionId,
    dimensions: attributes,
    selections: {},
    currentDimensionIndex: 0,
  };

  await db.conversationState.upsert({
    where: { tenantId_phone: { tenantId, phone: from } },
    create: {
      tenantId,
      phone: from,
      state: VARIANT_SELECTION_STATE.CHOOSING_DIMENSION,
      metadata,
    },
    update: {
      state: VARIANT_SELECTION_STATE.CHOOSING_DIMENSION,
      metadata,
    },
  });

  return sendNextDimensionQuestion(tenantId, from, metadata, correlationId);
}

/**
 * Sends the next dimension question (e.g. "Choose Color") based on current selections.
 */
export async function sendNextDimensionQuestion(
  tenantId: string,
  from: string,
  metadata: VariantSelectionMetadata,
  correlationId: string,
) {
  const currentDim = metadata.dimensions[metadata.currentDimensionIndex];
  if (!currentDim) return;

  // Find available options for this dimension given current selections
  // This is a bit complex: find all variants that match current selections and extract unique values for NEXT dimension
  const variants = await db.itemVariant.findMany({
    where: {
      tenantId,
      catalogueItemId: metadata.itemId,
      availableQty: { gte: metadata.quantity },
    },
  });

  const availableOptions = new Set<string>();
  for (const v of variants) {
    const vals = v.values as Record<string, string>;
    // Check if this variant matches all previous selections
    let match = true;
    for (const [dim, val] of Object.entries(metadata.selections)) {
      if (vals[dim] !== val) {
        match = false;
        break;
      }
    }
    if (match && vals[currentDim]) {
      availableOptions.add(vals[currentDim]);
    }
  }

  if (availableOptions.size === 0) {
    // Should not happen if data is consistent
    workerLogger.warn("No available options found for dimension", { tenantId, from, currentDim });
    return;
  }

  // Generate interactive message (List or Buttons)
  const options = Array.from(availableOptions);
  
  const maxOptions = options.slice(0, 10);
  // Use buttons if 3 or less, else List (meta limits list to max 10 items in total)
  const interactivePayload = maxOptions.length <= 3 
    ? {
        type: "buttons" as const,
        header: "Choix variante 🏷️",
        buttons: maxOptions.map(opt => ({ id: `select_val:${opt}`, title: opt.slice(0, 20) })),
      }
    : {
        type: "list" as const,
        header: "Choix variante 🏷️",
        buttonLabel: "Choisir",
        items: maxOptions.map(opt => ({ id: `select_val:${opt}`, title: opt.slice(0, 24) })),
      };

  await writeToOutbox({
    tenantId,
    to: from,
    body: `Pour l'article *${metadata.code}*, quelle ${currentDim} souhaites-tu ?`,
    interactive: interactivePayload,
    correlationId,
  });
}

/**
 * Handles a user's choice for the current dimension.
 */
export async function handleVariantChoice(
  tenantId: string,
  from: string,
  choiceValue: string,
  correlationId: string,
) {
  const conv = await db.conversationState.findUnique({
    where: { tenantId_phone: { tenantId, phone: from } },
  });

  if (!conv || conv.state !== VARIANT_SELECTION_STATE.CHOOSING_DIMENSION) return;

  const metadata = conv.metadata as unknown as VariantSelectionMetadata;
  const currentDim = metadata.dimensions[metadata.currentDimensionIndex];

  // Record selection
  if (currentDim) {
    metadata.selections[currentDim] = choiceValue;
    metadata.currentDimensionIndex++;
  }

  if (metadata.currentDimensionIndex < metadata.dimensions.length) {
    // There are more dimensions to pick
    await db.conversationState.update({
      where: { id: conv.id },
      data: { metadata: metadata },
    });
    return sendNextDimensionQuestion(tenantId, from, metadata, correlationId);
  }

  // All selections done! Find the variant
  const variants = await db.itemVariant.findMany({
    where: {
      tenantId,
      catalogueItemId: metadata.itemId,
    },
  });

  const finalVariant = variants.find(v => {
    const vals = v.values as Record<string, string>;
    return Object.entries(metadata.selections).every(([dim, val]) => vals[dim] === val);
  });

  if (!finalVariant) {
    await writeToOutbox({
      tenantId,
      to: from,
      body: "Désolé, cette combinaison n'est plus disponible 😔",
      correlationId,
    });
  } else {
    // Create reservation for the variant, linked to live session if applicable
    const resResult = await createReservation(
      tenantId,
      metadata.liveSessionId,
      null,
      from,
      correlationId,
      {
        catalogueItemId: metadata.itemId,
        liveSessionId: metadata.liveSessionId,
        quantity: metadata.quantity,
        variantId: finalVariant.id,
      },
    );

    if (resResult.success) {
      const qtyLabel = metadata.quantity > 1 ? ` (x${metadata.quantity})` : "";
      await writeToOutbox({
        tenantId,
        to: from,
        body: botMsg.client.reserved(`${metadata.code} [${finalVariant.label}]${qtyLabel}`),
        correlationId,
      });
    } else {
      await writeToOutbox({
        tenantId,
        to: from,
        body: botMsg.client.exhausted(),
        correlationId,
      });
    }
  }

  // Clear conversation state
  await db.conversationState.update({
    where: { id: conv.id },
    data: { state: null, metadata: Prisma.JsonNull },
  });
}
