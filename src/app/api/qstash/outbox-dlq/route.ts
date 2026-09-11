import { createHash } from "node:crypto";
import { z } from "zod";
/**
 * POST /api/qstash/outbox-dlq — Callback QStash en cas d'échec total après tous les retries.
 *
 * QStash appelle cette route (failureCallback) quand le message n'a pas pu être envoyé
 * après toutes les tentatives. On persiste le job en DeadLetterJob pour traitement ops manuel.
 *
 * Sécurité: vérification de la signature QStash.
 */
import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { createQStashReceiver, isQStashMisconfiguredForHttpRoute } from "~/server/qstash/config";

/**
 * `null` signifie « pas de vérification » et n'est atteignable qu'en dehors de
 * la production : `isQStashMisconfiguredForHttpRoute()` y verrouille désormais
 * la route dès que les clés manquent, quel que soit `QSTASH_TOKEN`.
 */
function getReceiver(): Receiver | "misconfigured" | null {
  if (isQStashMisconfiguredForHttpRoute()) {
    return "misconfigured";
  }
  return createQStashReceiver();
}

export async function POST(request: Request) {
  const bodyText = await request.text();

  const receiver = getReceiver();
  if (receiver === "misconfigured") {
    workerLogger.error("QStash outbox-dlq: signature config missing in production", undefined, {
      route: "/api/qstash/outbox-dlq",
      hasCurrentSigningKey: !!process.env.QSTASH_CURRENT_SIGNING_KEY,
      hasNextSigningKey: !!process.env.QSTASH_NEXT_SIGNING_KEY,
    });
    return new NextResponse("Service Unavailable", { status: 503 });
  }
  if (receiver) {
    const signature = request.headers.get("upstash-signature") ?? "";
    const isValid = await receiver.verify({ signature, body: bodyText }).catch(() => false);
    if (!isValid) {
      workerLogger.warn("QStash outbox-dlq: signature invalide", {});
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  let messageOutId: string;
  let errorMessage: string;
  try {
    // QStash enveloppe le message original dans sourceBody encodé en base64.
    const callback = z.object({ sourceBody: z.string().min(1), status: z.number().optional() }).parse(JSON.parse(bodyText));
    const source = z.object({ messageOutId: z.string().min(1) }).parse(
      JSON.parse(Buffer.from(callback.sourceBody, "base64").toString("utf8")),
    );
    messageOutId = source.messageOutId;
    errorMessage = `Max retries QStash épuisés (HTTP ${callback.status ?? "inconnu"})`;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const messageOut = await db.messageOut.findUnique({
    where: { id: messageOutId },
    select: { status: true, tenantId: true, id: true, to: true, body: true, attempts: true, lastError: true, correlationId: true },
  });

  if (!messageOut) {
    workerLogger.warn("QStash outbox-dlq: MessageOut introuvable", { messageOutId });
    return new NextResponse("OK", { status: 200 });
  }

  if (["sent", "blocked", "suppressed"].includes(messageOut.status)) {
    return new NextResponse("Already processed", { status: 200 });
  }

  const deadLetterId = `c${createHash("sha256").update(`outbox:${messageOut.id}`).digest("hex").slice(0, 24)}`;
  try {
    // Un id déterministe évite plusieurs incidents pour le rejeu du même callback.
    await db.deadLetterJob.upsert({
      where: { id: deadLetterId },
      update: {},
      create: {
        id: deadLetterId,
        tenantId: messageOut.tenantId,
        jobType: "message_out",
        payload: {
          messageOutId: messageOut.id,
          to: messageOut.to,
          correlationId: messageOut.correlationId,
        },
        errorMessage,
        attempts: messageOut.attempts,
      },
    });

    workerLogger.error(
      "QStash outbox-dlq: message en DLQ après épuisement des retries",
      new Error(errorMessage),
      { messageOutId, tenantId: messageOut.tenantId, correlationId: messageOut.correlationId },
    );
  } catch (err) {
    workerLogger.error("QStash outbox-dlq: impossible d'écrire en DLQ", err, { messageOutId });
    return new NextResponse("Internal Error", { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}
