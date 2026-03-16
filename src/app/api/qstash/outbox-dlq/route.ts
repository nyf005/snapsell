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
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";

function getReceiver(): Receiver | null {
  if (!env.QSTASH_CURRENT_SIGNING_KEY || !env.QSTASH_NEXT_SIGNING_KEY) {
    return null;
  }
  return new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
}

export async function POST(request: Request) {
  const bodyText = await request.text();

  const receiver = getReceiver();
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
    const parsed = JSON.parse(bodyText) as { messageOutId?: string };
    if (!parsed.messageOutId) throw new Error("messageOutId manquant");
    messageOutId = parsed.messageOutId;
    // QStash transmet l'erreur finale dans le header x-upstash-error si disponible
    errorMessage = request.headers.get("upstash-failure-callback-last-message") ?? "Max retries QStash épuisés";
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const messageOut = await db.messageOut.findUnique({
    where: { id: messageOutId },
    select: { tenantId: true, id: true, to: true, body: true, attempts: true, lastError: true, correlationId: true },
  });

  if (!messageOut) {
    workerLogger.warn("QStash outbox-dlq: MessageOut introuvable", { messageOutId });
    return new NextResponse("OK", { status: 200 });
  }

  try {
    await db.deadLetterJob.create({
      data: {
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
