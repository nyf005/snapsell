/**
 * POST /api/qstash/outbox-send — Callback QStash pour l'envoi de messages sortants.
 *
 * QStash appelle cette route avec le payload { messageOutId } et gère les retries
 * automatiquement (retryLimit: 5, backoff exponentiel) si la route retourne un 5xx.
 * En cas d'échec total après retries, QStash appelle /api/qstash/outbox-dlq (failureCallback).
 *
 * Sécurité: vérification de la signature QStash via @upstash/qstash Receiver.
 */
import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { processOutboundMessage } from "~/server/workers/outbox-sender";
import { workerLogger } from "~/lib/logger";
import { createQStashReceiver, hasQStashSigningKeys, isQStashMisconfiguredForHttpRoute } from "~/server/qstash/config";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function getReceiver(): Receiver | "misconfigured" | null {
  if (isQStashMisconfiguredForHttpRoute()) {
    return "misconfigured";
  }
  const receiver = createQStashReceiver();
  if (!receiver && isProduction() && hasQStashSigningKeys()) {
    return "misconfigured";
  }
  if (!receiver) {
    return null;
  }
  return receiver;
}

export async function POST(request: Request) {
  const bodyText = await request.text();

  // Vérification de la signature QStash
  const receiver = getReceiver();
  if (receiver === "misconfigured") {
    workerLogger.error("QStash outbox-send: signature config missing in production", undefined, {
      route: "/api/qstash/outbox-send",
      hasCurrentSigningKey: !!process.env.QSTASH_CURRENT_SIGNING_KEY,
      hasNextSigningKey: !!process.env.QSTASH_NEXT_SIGNING_KEY,
    });
    return new NextResponse("Service Unavailable", { status: 503 });
  }

  if (receiver) {
    const signature = request.headers.get("upstash-signature") ?? "";
    const isValid = await receiver.verify({ signature, body: bodyText }).catch(() => false);
    if (!isValid) {
      workerLogger.warn("QStash outbox-send: signature invalide", {});
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  let messageOutId: string;
  try {
    const parsed = JSON.parse(bodyText) as { messageOutId?: string };
    if (!parsed.messageOutId) throw new Error("messageOutId manquant");
    messageOutId = parsed.messageOutId;
  } catch {
    return new NextResponse("Bad Request: payload invalide", { status: 400 });
  }

  const messageOut = await db.messageOut.findUnique({
    where: { id: messageOutId },
  });

  if (!messageOut) {
    // Ne pas retenter — le message n'existe pas
    workerLogger.warn("QStash outbox-send: MessageOut introuvable", { messageOutId });
    return new NextResponse("Not Found", { status: 200 });
  }

  // Idempotence : si déjà traité, ne pas renvoyer
  if (messageOut.status === "sent" || messageOut.status === "blocked") {
    workerLogger.debug("QStash outbox-send: MessageOut déjà traité", {
      messageOutId,
      status: messageOut.status,
    });
    return new NextResponse("Already processed", { status: 200 });
  }

  const result = await processOutboundMessage(messageOut);

  if (!result.success) {
    // Retourner 503 pour déclencher le retry QStash
    workerLogger.warn("QStash outbox-send: échec, retry QStash", {
      messageOutId,
      error: result.error,
    });
    return new NextResponse(result.error ?? "Send failed", { status: 503 });
  }

  return new NextResponse("OK", { status: 200 });
}
