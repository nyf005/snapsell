/**
 * Helper pour écrire dans l'outbox (MessageOut)
 * Story 2.4: Fonction utilisée par les workers métier pour préparer messages sortants
 * 
 * Architecture §4.5: Tout envoi sortant écrit d'abord dans MessageOut (outbox) avec statut pending
 */

import { z } from "zod";
import { Client as QStashClient } from "@upstash/qstash";
import { Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { boss, QUEUE } from "~/server/workers/queues";
import { env } from "~/env";
import type { OutboundMessage } from "./types";

const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Enqueue via QStash (production) ou pg-boss (dev/fallback).
 * QStash est event-driven, serverless-native, et gère les retries automatiquement.
 *
 * ⚠️ Le fallback pg-boss `outbox-send` n'a AUCUN consommateur : `startOutboxSenderWorker()`
 * n'est démarré par aucun entrypoint. Il ne sert donc qu'à ne pas faire échouer le flux
 * métier en développement local. En production, l'absence de configuration QStash
 * signifie que plus aucun message ne part — on refuse de le laisser passer en silence.
 */
async function enqueueOutboxSend(messageOutId: string): Promise<void> {
  if (env.QSTASH_TOKEN && env.NEXT_PUBLIC_APP_URL) {
    const client = new QStashClient({ token: env.QSTASH_TOKEN });
    const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/qstash/outbox-send`;
    const failureCallbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/qstash/outbox-dlq`;
    await client.publishJSON({
      url: callbackUrl,
      body: { messageOutId },
      retries: 5,
      failureCallback: failureCallbackUrl,
    });
    return;
  }

  // Configuration incomplète : diagnostiquer précisément laquelle des deux manque.
  const missing = [
    !env.QSTASH_TOKEN ? "QSTASH_TOKEN" : null,
    !env.NEXT_PUBLIC_APP_URL ? "NEXT_PUBLIC_APP_URL" : null,
  ].filter(Boolean);

  if (env.NODE_ENV === "production") {
    // En production, la bascule silencieuse sur une queue sans consommateur
    // laissait les messages en `pending` indéfiniment, sans la moindre erreur.
    throw new Error(
      `Outbox non configuré : ${missing.join(" et ")} manquant(s). ` +
        `Les deux sont requis ensemble pour publier vers QStash. ` +
        `Le message ${messageOutId} reste en statut 'pending' et ne partira pas.`,
    );
  }

  workerLogger.warn(
    "QStash non configuré — fallback pg-boss `outbox-send`, qui n'a aucun consommateur. " +
      "Le message ne sera PAS envoyé. Configurer QSTASH_TOKEN + NEXT_PUBLIC_APP_URL pour un envoi réel.",
    { messageOutId, missing },
  );
  await boss.send(QUEUE.OUTBOX_SEND, { messageOutId }, { singletonKey: messageOutId });
}

/**
 * Schéma Zod pour validation OutboundMessage
 */
const interactiveButtonSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(20),
});

const interactivePayloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("buttons"),
    header: z.string().max(60).optional(),
    footer: z.string().max(60).optional(),
    buttons: z.array(interactiveButtonSchema).min(1).max(3),
  }),
  z.object({
    type: z.literal("list"),
    header: z.string().max(60).optional(),
    footer: z.string().max(60).optional(),
    buttonLabel: z.string().min(1).max(20),
    items: z.array(z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(24),
      description: z.string().max(72).optional(),
    })).min(1).max(10),
  }),
  z.object({
    type: z.literal("product"),
    body: z.string().max(1024).optional(),
    footer: z.string().max(60).optional(),
    catalogId: z.string().min(1),
    productRetailerId: z.string().min(1),
  }),
  z.object({
    type: z.literal("product_list"),
    header: z.string().min(1).max(60),
    body: z.string().max(1024).optional(),
    footer: z.string().max(60).optional(),
    catalogId: z.string().min(1),
    sections: z.array(z.object({
      title: z.string().min(1).max(24),
      items: z.array(z.object({ productRetailerId: z.string().min(1) })).min(1).max(30),
    })).min(1).max(10),
  }),
]);

const outboundMessageSchema = z.object({
  tenantId: z.string().min(1),
  to: z.string().min(1), // Format E.164 normalisé
  body: z.string().optional(), // Story 11.2: Optionnel pour les typing indicators
  correlationId: z.string().min(1), // UUID ou message_sid pour traçabilité
  mediaUrl: z.string().min(1).optional(), // Story 9.4: clé R2 storage ou URL média
  interactive: interactivePayloadSchema.optional(),
  isTypingIndicator: z.boolean().optional(),
});

/**
 * Écrit un message dans l'outbox (MessageOut) avec status pending
 * Le worker outbox-sender traitera ce message et l'enverra via MessagingProvider
 * 
 * @param message - Message normalisé OutboundMessage
 * @returns MessageOut créé avec id, status = 'pending'
 */
export async function writeToOutbox(message: OutboundMessage): Promise<{
  id: string;
  tenantId: string;
  to: string;
  body?: string | null;
  status: string;
  attempts: number;
  correlationId: string;
  createdAt: Date;
}> {
  // Préserver le destinataire tel qu'il a été fourni par le flux métier.
  // Pour les réponses WhatsApp, cela évite de réécrire le wa_id reçu du provider.
  const normalizedMessage = { ...message };

  // Injection du Header (Nom de la boutique) et Footer (Branding) globalement
  const tenant = await db.tenant.findUnique({
    where: { id: normalizedMessage.tenantId },
    select: { name: true, showBranding: true },
  });

  if (tenant && !normalizedMessage.isTypingIndicator) {
    const shopName = tenant.name;
    if (normalizedMessage.interactive) {
      // Si le message n'a pas déjà de header (l'Action), on peut mettre le nom de la boutique.
      // Mais puisque l'on veut l'Action en header, on ne force plus le nom de la boutique ici,
      // on laisse le template définir le header (ou on le laisse vide pour que l'action soit le texte du body).
      
      // Footer dynamique selon l'abonnement (Premium vs Free)
      normalizedMessage.interactive.footer = tenant.showBranding ? "Via SnapSell" : shopName;
    } else if (normalizedMessage.body) {
      // Injection texte pour les messages simples
      // On ne met plus le nom de la boutique en gros en haut, l'action est déjà la première ligne.
      const footerText = tenant.showBranding ? "_Via SnapSell_" : `_${shopName}_`;
      normalizedMessage.body = `${normalizedMessage.body}\n\n${footerText}`;
    }
  }

  // Valider le message avec Zod
  const validatedMessage = outboundMessageSchema.parse(normalizedMessage);

  workerLogger.debug("Writing message to outbox", {
    tenantId: validatedMessage.tenantId,
    to: validatedMessage.to,
    correlationId: validatedMessage.correlationId,
  });

  try {
    // Créer MessageOut avec status pending
    const messageOut = await db.messageOut.create({
      data: {
        tenantId: validatedMessage.tenantId,
        to: validatedMessage.to,
        body: validatedMessage.body ?? "",
        mediaUrl: validatedMessage.mediaUrl ?? null,
        interactivePayload: validatedMessage.interactive ?? undefined,
        isTypingIndicator: validatedMessage.isTypingIndicator ?? false,
        status: "pending",
        attempts: 0,
        correlationId: validatedMessage.correlationId,
      },
      select: {
        id: true,
        tenantId: true,
        to: true,
        body: true,
        status: true,
        attempts: true,
        correlationId: true,
        createdAt: true,
      },
    });

    // Enqueue via QStash (prod) ou pg-boss (dev) pour traitement immédiat.
    // On ne propage volontairement pas l'échec : le MessageOut est déjà persisté en
    // `pending` et ne doit pas être perdu, ni faire échouer le flux métier appelant.
    //
    // En revanche l'échec est journalisé en `error` en production : quelle qu'en soit la
    // cause (QStash indisponible ou mal configuré), le message ne partira pas tant que
    // personne n'intervient. C'est un incident, pas un avertissement.
    try {
      await enqueueOutboxSend(messageOut.id);
    } catch (enqueueError) {
      const context = {
        messageOutId: messageOut.id,
        tenantId: validatedMessage.tenantId,
        correlationId: validatedMessage.correlationId,
        error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError),
      };

      if (env.NODE_ENV === "production") {
        workerLogger.error(
          "Failed to enqueue outbox-send job — message stuck in 'pending', will NOT be delivered",
          enqueueError,
          context,
        );
      } else {
        workerLogger.warn("Failed to enqueue outbox-send job, MessageOut remains pending", context);
      }
    }

    workerLogger.info("Message written to outbox", {
      messageOutId: messageOut.id,
      tenantId: validatedMessage.tenantId,
      to: validatedMessage.to,
      correlationId: validatedMessage.correlationId,
    });

    return {
      id: messageOut.id,
      tenantId: messageOut.tenantId,
      to: messageOut.to,
      body: messageOut.body,
      status: messageOut.status,
      attempts: messageOut.attempts,
      correlationId: messageOut.correlationId,
      createdAt: messageOut.createdAt,
    };
  } catch (error) {
    // La contrainte @@unique([tenantId, correlationId, to]) sur MessageOut sert de clé
    // d'idempotence : un même flux entrant ne peut écrire qu'un message par destinataire.
    //
    // Avant, un P2002 remontait jusqu'au handler pg-boss et faisait échouer le job.
    // Conséquence : après un incident transitoire survenu APRÈS l'écriture du message,
    // le retry rejouait le job, retombait sur ce P2002 et échouait à son tour — le job
    // ne pouvait donc jamais se terminer, et tout le traitement métier restant
    // (réservation, commande, event log) était perdu définitivement.
    //
    // On traite désormais le conflit comme ce qu'il est : le message est déjà en outbox.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION
    ) {
      const existing = await db.messageOut.findUnique({
        where: {
          tenantId_correlationId_to: {
            tenantId: validatedMessage.tenantId,
            correlationId: validatedMessage.correlationId,
            to: validatedMessage.to,
          },
        },
        select: {
          id: true,
          tenantId: true,
          to: true,
          body: true,
          status: true,
          attempts: true,
          correlationId: true,
          createdAt: true,
        },
      });

      if (existing) {
        const sameContent = (existing.body ?? "") === (validatedMessage.body ?? "");

        if (sameContent) {
          // Cas nominal d'un rejeu : le message identique est déjà en file. Rien à faire.
          workerLogger.info("Outbox message already written (idempotent replay), skipping", {
            messageOutId: existing.id,
            tenantId: validatedMessage.tenantId,
            to: validatedMessage.to,
            correlationId: validatedMessage.correlationId,
          });
        } else {
          // Contenu différent : le flux a tenté d'envoyer un SECOND message distinct au
          // même destinataire pour le même message entrant. La contrainte l'interdit.
          // On ne fait pas échouer le job pour autant, mais on le signale bruyamment :
          // c'est un défaut de conception du flux appelant, pas un incident transitoire.
          workerLogger.error(
            "Outbox conflict: a different message already exists for this correlationId+recipient. Second message dropped.",
            undefined,
            {
              messageOutId: existing.id,
              tenantId: validatedMessage.tenantId,
              to: validatedMessage.to,
              correlationId: validatedMessage.correlationId,
              existingBody: (existing.body ?? "").slice(0, 120),
              droppedBody: (validatedMessage.body ?? "").slice(0, 120),
            },
          );
        }

        return existing;
      }
    }

    workerLogger.error("Error writing message to outbox", error, {
      tenantId: validatedMessage.tenantId,
      to: validatedMessage.to,
      correlationId: validatedMessage.correlationId,
    });
    throw error;
  }
}
