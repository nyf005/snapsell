import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { MetaCloudAdapter } from "~/server/messaging/providers/meta/adapter";
import { boss, ensureBossReady, QUEUE } from "~/server/workers/queues";
import {
  metaWebhookSchema,
  metaWebhookEnvelopeSchema,
  extractMetaWebhookFields,
  inboundMessageForQueueSchema,
} from "~/lib/zod/webhook";
import {
  classifyMetaWebhookField,
  isInboundMessageField,
} from "~/server/messaging/providers/meta/webhook-fields";
import { env } from "~/env";
import { webhookLogger } from "~/lib/logger";
import { checkWebhookRateLimit, getClientIpFromRequest } from "~/lib/rate-limit";
import { captureException as sendToSentry } from "~/lib/sentry";

import {
  normalizeIncomingPhone,
} from "~/lib/validations/phone";
import { getProviderForTenant, sendImmediateTyping } from "~/server/messaging/service";
import {
  logWebhookReceived,
  logIdempotentIgnored,
} from "~/server/events/eventLog";

/**
 * Verification de signature HMAC-SHA256 inline
 * AVANT resolution tenant (MetaCloudAdapter requiert phoneNumberId+accessToken)
 */
function verifyMetaSignature(bodyText: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const receivedHash = signatureHeader.replace("sha256=", "");
  const calculatedHash = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  try {
    const a = Buffer.from(calculatedHash, "hex");
    const b = Buffer.from(receivedHash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Enfile les évènements de Coexistence — sans les traiter ici.
 *
 * L'import se faisait dans cette requête : chaque contact et chaque message
 * d'historique produisait une requête SQL, en série, pendant que Meta attendait.
 * Un historique de six mois représente des milliers de messages, la réponse
 * dépassait donc largement la seconde visée, Meta rejouait le lot, et le rejeu
 * relançait le même import.
 *
 * On résout la boutique — c'est rapide et ça évite d'enfiler pour rien — puis on
 * confie le travail au worker. Un échec est journalisé et n'arrête pas les
 * autres changements du lot.
 */
async function enqueueCoexistenceChanges(
  changes: Array<{ field: string; value?: Record<string, unknown> }>,
  correlationId: string,
): Promise<{ enqueueFailed: boolean }> {
  let enqueueFailed = false;

  for (const change of changes) {
    const value = change.value;
    if (!value) continue;

    const metadata = value.metadata as { phone_number_id?: string } | undefined;
    const phoneNumberId = metadata?.phone_number_id;
    if (!phoneNumberId) {
      webhookLogger.warn("Coexistence: phone_number_id absent", {
        correlationId,
        field: change.field,
      });
      continue;
    }

    const tenant = await db.tenant.findUnique({
      where: { metaPhoneNumberId: phoneNumberId },
      select: { id: true },
    });
    if (!tenant) {
      webhookLogger.warn("Coexistence: boutique introuvable", {
        correlationId,
        field: change.field,
        phoneNumberId,
      });
      continue;
    }

    try {
      await ensureBossReady();
      await boss.send(QUEUE.COEXISTENCE_SYNC, {
        tenantId: tenant.id,
        field: change.field,
        value,
        correlationId,
      });
      webhookLogger.info("Coexistence: évènement enfilé", {
        correlationId,
        field: change.field,
        tenantId: tenant.id,
      });
    } catch (error) {
      /**
       * ── UN ÉVÈNEMENT PERDU ICI NE REVIENT JAMAIS ────────────────────────
       *
       * On répondait `200` malgré l'échec, en craignant qu'un rejeu ne
       * duplique un message client présent dans le même lot. Cette crainte
       * était infondée : le chemin entrant est protégé par l'unicité
       * `(tenantId, providerMessageId)` en base **et** par un `singletonKey`
       * pg-boss, et les handlers de Coexistence n'écrivent que par `upsert`.
       * Un rejeu est donc sans effet de bord.
       *
       * La perte, elle, était définitive : Meta ne rejoue que sur une réponse
       * non-2xx. Un historique manqué ici l'était pour de bon, et la fenêtre
       * de 24 h ne laisse pas de seconde chance.
       *
       * On mémorise donc l'échec et on finit le lot — les autres changements
       * n'ont pas à en souffrir — puis l'appelant répondra `503`.
       * ────────────────────────────────────────────────────────────────────
       */
      enqueueFailed = true;
      webhookLogger.error(
        "Coexistence: mise en file échouée — réponse non-200 pour que Meta rejoue",
        error,
        { correlationId, field: change.field, tenantId: tenant.id },
      );
    }
  }

  return { enqueueFailed };
}

/**
 * GET /api/webhooks/meta — Challenge verification Meta
 * Story 10.3 AC#1
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!env.META_VERIFY_TOKEN) {
    webhookLogger.error("META_VERIFY_TOKEN not configured", undefined, {});
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (mode === "subscribe" && verifyToken === env.META_VERIFY_TOKEN && challenge) {
    webhookLogger.info("Meta webhook challenge verified", { challenge });
    return new NextResponse(challenge, { status: 200 });
  }

  webhookLogger.warn("Meta webhook challenge failed", {
    mode: mode ?? "",
    hasVerifyToken: verifyToken != null && verifyToken.length > 0,
  });
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * POST /api/webhooks/meta — Reception messages entrants Meta WhatsApp
 * Story 10.3 AC#2, AC#4
 * Route webhook Meta WhatsApp Cloud API (13 etapes)
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();

  // 1. Rate limiting par IP
  const maxPerWindow = env.WEBHOOK_RATE_LIMIT_MAX ?? 120;
  const windowMs = env.WEBHOOK_RATE_LIMIT_WINDOW_MS ?? 60_000;
  try {
    const allowed = await checkWebhookRateLimit(request, maxPerWindow, windowMs);
    if (!allowed) {
      const ip = getClientIpFromRequest(request);
      webhookLogger.warn("Meta webhook rate limit exceeded", {
        correlationId,
        ip,
        maxPerWindow,
        windowMs,
      });
      return new NextResponse("OK", { status: 200 });
    }
  } catch (error) {
    // Le limiteur dégrade désormais tout seul (repli mémoire) : ce bloc ne
    // devrait plus se déclencher. Il reste comme dernier filet, et il laisse
    // passer.
    //
    // Il répondait 503. Quand la base Redis a disparu, le webhook a donc rejeté
    // *chaque* message pendant toute la panne, sans qu'aucune alerte ne parte —
    // découvert seulement en interrogeant l'endpoint à la main. Une protection
    // contre les abus ne doit pas pouvoir arrêter la réception des commandes,
    // surtout quand la signature HMAC vérifiée juste après fait le vrai tri.
    webhookLogger.error("Meta webhook rate limit unavailable — on laisse passer", error, {
      correlationId,
      errorType: "rate_limit_unavailable",
    });
    void sendToSentry(error instanceof Error ? error : new Error(String(error)), {
      correlationId,
      tags: { component: "webhook-meta", errorType: "rate_limit_unavailable" },
    }).catch(() => {});
  }

  try {
    // 2. Lire le body une seule fois
    const bodyText = await request.text();

    // 3. Verifier signature HMAC-SHA256 AVANT resolution tenant
    if (!env.META_APP_SECRET) {
      webhookLogger.error("META_APP_SECRET not configured", undefined, { correlationId });
      return new NextResponse("OK", { status: 200 });
    }

    const signatureHeader = request.headers.get("X-Hub-Signature-256");
    const signatureValid = verifyMetaSignature(bodyText, signatureHeader, env.META_APP_SECRET);

    const isDevelopment = env.NODE_ENV === "development";

    if (!signatureValid) {
      webhookLogger.warn("Invalid Meta signature", { correlationId, isDevelopment });

      if (!isDevelopment) {
        return new NextResponse("Invalid signature", { status: 401 });
      }

      webhookLogger.debug("Development mode: continuing despite invalid Meta signature", { correlationId });
    }

    /**
     * 4. Aiguiller par `field` AVANT de valider le contenu.
     *
     * Le schéma des messages était appliqué à tout ce qui arrivait ; un webhook
     * portant un autre champ échouait donc à la validation et se perdait avec un
     * avertissement muet sur son type. On lit désormais l'enveloppe d'abord —
     * elle ne préjuge pas du contenu — puis on ne fait passer au pipeline
     * entrant que ce qui en relève vraiment.
     */
    let envelope: ReturnType<typeof metaWebhookEnvelopeSchema.parse>;
    try {
      envelope = metaWebhookEnvelopeSchema.parse(JSON.parse(bodyText));
    } catch (parseError) {
      webhookLogger.warn("Invalid Meta webhook envelope", {
        correlationId,
        error: String(parseError),
      });
      return new NextResponse("OK", { status: 200 });
    }

    const fields = extractMetaWebhookFields(envelope);

    /**
     * Les champs hors pipeline sont journalisés nommément. C'est ce qui manquait :
     * l'ancien avertissement ne disait pas *quel* type d'évènement était perdu,
     * donc on voyait passer des rejets sans pouvoir les relier à quoi que ce soit.
     */
    for (const field of fields.filter((candidate) => !isInboundMessageField(candidate))) {
      const kind = classifyMetaWebhookField(field);
      webhookLogger.info("Meta webhook field hors pipeline entrant", {
        correlationId,
        field,
        kind,
        /*
          Dit explicitement pourquoi rien ne partira en réponse. Un écho traité
          comme une entrée ferait répondre SnapSell à la boutique elle-même.
        */
        reason:
          kind === "echo"
            ? "message émis par la boutique — jamais traité comme une entrée cliente"
            : kind === "coexistence-sync"
              ? "évènement de synchronisation Coexistence"
              : "champ inconnu de SnapSell",
      });
    }

    /**
     * Les évènements de Coexistence partent sur leur propre file, hors du
     * pipeline entrant.
     *
     * Ils décrivent le passé ou l'activité propre de la boutique — ce qu'elle a
     * envoyé depuis son téléphone, ses contacts, ses anciennes conversations —
     * et aucun n'appelle de réponse.
     */
    const coexistenceChanges = envelope.entry.flatMap((entry) =>
      entry.changes.filter((change) => {
        const kind = classifyMetaWebhookField(change.field);
        return kind === "echo" || kind === "coexistence-sync";
      }),
    );

    let coexistenceEnqueueFailed = false;
    if (coexistenceChanges.length > 0) {
      ({ enqueueFailed: coexistenceEnqueueFailed } = await enqueueCoexistenceChanges(
        coexistenceChanges,
        correlationId,
      ));
    }

    if (!fields.some(isInboundMessageField)) {
      // Meta ne rejoue que sur une réponse non-2xx : c'est notre seul moyen de
      // récupérer un évènement de Coexistence qu'on n'a pas su enfiler.
      return coexistenceEnqueueFailed
        ? new NextResponse("Enqueue failed", { status: 503 })
        : new NextResponse("OK", { status: 200 });
    }

    /**
     * 4b. Ne garder que les changements `messages`, puis valider strictement.
     *
     * Le filtrage n'est pas un détail : `metaWebhookSchema` exige que **chaque**
     * changement soit `messages`. Appliqué au payload entier, il fait échouer en
     * bloc un lot où Meta groupe un message client avec un `history` ou un écho
     * — et la cliente n'a alors jamais de réponse, pour un évènement qui ne la
     * concernait même pas.
     *
     * Le corps filtré sert aussi à l'adaptateur plus bas, pour qu'il ne voie
     * jamais autre chose que ce qui a été validé ici.
     */
    const inboundBodyText = JSON.stringify({
      object: envelope.object,
      entry: envelope.entry
        .map((entry) => ({
          ...entry,
          changes: entry.changes.filter((change) => isInboundMessageField(change.field)),
        }))
        .filter((entry) => entry.changes.length > 0),
    });

    let payload: ReturnType<typeof metaWebhookSchema.parse>;
    try {
      payload = metaWebhookSchema.parse(JSON.parse(inboundBodyText));
    } catch (parseError) {
      webhookLogger.warn("Invalid Meta webhook payload", { correlationId, error: String(parseError) });
      return new NextResponse("OK", { status: 200 });
    }

    // 5. Extraire phone_number_id pour resolver le tenant
    const phoneNumberId = payload.entry[0]?.changes[0]?.value.metadata.phone_number_id;
    if (!phoneNumberId) {
      webhookLogger.warn("Missing phone_number_id in Meta webhook", { correlationId });
      return new NextResponse("OK", { status: 200 });
    }

    // 6. Resolver tenant via metaPhoneNumberId
    const tenant = await db.tenant.findUnique({
      where: { metaPhoneNumberId: phoneNumberId },
      select: { id: true, metaPhoneNumberId: true, metaAccessToken: true },
    });

    // 7. Si pas de tenant → persist MessageIn avec tenantId null + return 200
    if (!tenant) {
      webhookLogger.warn("Tenant not found for Meta phone_number_id", { correlationId, phoneNumberId });

      // Best-effort persist TOUS les messages pour tracabilite
      const allMessages = payload.entry.flatMap(
        (e) => e.changes.flatMap((c) => c.value.messages ?? []),
      );
      for (const msg of allMessages) {
        try {
          await db.messageIn.create({
            data: {
              tenantId: null,
              providerMessageId: msg.id,
              from: msg.from,
              body: msg.text?.body ?? "",
              correlationId,
            },
          });
        } catch {
          // ignore — tracabilite best-effort (P2002 race condition inclus)
        }
      }

      return new NextResponse("OK", { status: 200 });
    }

    // 8. Creer Request clone pour parseInboundBatch()
    const requestClone = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: inboundBodyText,
    });

    // 9. Instancier adapter via le service (DRY)
    const adapter = await getProviderForTenant(tenant);
    if (!adapter) {
      webhookLogger.error("Failed to get messaging provider for tenant", undefined, { correlationId, tenantId: tenant.id });
      return new NextResponse("OK", { status: 200 });
    }
    const messages = await adapter.parseInboundBatch(requestClone);

    // 10. Si tableau vide (status-only) → traiter les statuts delivered/read puis return 200
    if (messages.length === 0) {
      webhookLogger.debug("Meta webhook status-only — processing statuses", { correlationId });
      const metaAdapter = adapter as MetaCloudAdapter;
      if (typeof metaAdapter.parseStatusUpdates === "function") {
        const statusUpdates = metaAdapter.parseStatusUpdates(JSON.parse(inboundBodyText));
        if (statusUpdates.length > 0) {
          await Promise.allSettled(
            statusUpdates.map(({ providerMessageId: wamid, status }) =>
              db.messageOut.updateMany({
                where: { tenantId: tenant.id, providerMessageId: wamid },
                data: { status },
              }),
            ),
          );
          webhookLogger.debug("MessageOut statuses updated", {
            correlationId,
            count: statusUpdates.length,
          });
        }
      }
      return new NextResponse("OK", { status: 200 });
    }

    // 11. Pour CHAQUE message du batch : idempotence → persist → log → validate → enqueue
    // Try/catch per-message pour qu'une erreur sur un message n'avorte pas le reste du batch
    //
    // Vrai si au moins un message n'a pas pu être mis en file. On termine quand
    // même le lot — les autres messages n'ont pas à en pâtir — puis on répond
    // non-200 pour que Meta rejoue.
    let enqueueFailed = false;

    for (const message of messages) {
      try {
        // Idempotence DB check
        const existingMessage = await db.messageIn.findUnique({
          where: {
            tenantId_providerMessageId: {
              tenantId: tenant.id,
              providerMessageId: message.providerMessageId,
            },
          },
        });

        // Un message déjà reçu n'est pas re-persisté — mais on ne saute pas
        // pour autant la suite : l'enfilage doit rester atteignable. C'est le
        // seul chemin de rattrapage quand le message avait été écrit mais que sa
        // mise en file avait échoué, et que Meta rejoue le lot après notre
        // réponse non-200. `singletonKey` rend l'enfilage idempotent : le
        // rejouer ne crée jamais de travail en double.
        //
        // Auparavant ce bloc faisait `continue`, et un message persisté sans
        // job était perdu définitivement — sans trace, `MessageIn` n'ayant
        // aucun champ de statut et aucun job de rattrapage n'existant.
        let isFirstReceipt = true;

        if (existingMessage) {
          isFirstReceipt = false;
          webhookLogger.info("Meta duplicate message detected", {
            correlationId,
            providerMessageId: message.providerMessageId,
            tenantId: tenant.id,
          });

          await logIdempotentIgnored(
            tenant.id,
            existingMessage.correlationId ?? correlationId,
            message.providerMessageId,
          ).catch((error) => {
            webhookLogger.error("Error logging idempotent_ignored event", error, { correlationId });
          });
        }

        // Persist MessageIn
        const messageIn = existingMessage ?? await db.messageIn.create({
          data: {
            tenantId: tenant.id,
            providerMessageId: message.providerMessageId,
            from: message.from,
            body: message.body,
            mediaUrl: message.mediaUrl,
            correlationId: message.correlationId,
          },
        }).catch((error: unknown) => {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2002"
          ) {
            webhookLogger.info("Meta race condition duplicate detected", {
              correlationId,
              providerMessageId: message.providerMessageId,
              tenantId: tenant.id,
            });
            return null;
          }
          throw error;
        });

        // `null` = course perdue sur la contrainte unique : un autre traitement
        // vient de créer la ligne et enfilera le job. Rien à faire ici.
        if (!messageIn) continue;

        // Journalisé à la première réception seulement : un rejeu de Meta ne
        // doit pas gonfler le journal d'activité de la vendeuse.
        if (isFirstReceipt) {
          await logWebhookReceived(
            tenant.id,
            messageIn.id,
            messageIn.correlationId,
            message.providerMessageId,
          ).catch((error) => {
            webhookLogger.error("Error logging webhook_received event", error, { correlationId });
          });
        }

        // Validate + enqueue
        const normalizedMessage = {
          ...message,
          from: normalizeIncomingPhone(message.from),
          tenantId: tenant.id,
          correlationId: message.correlationId,
        };

        // Story 11.2: Envoyer l'indicateur de frappe IMMEDIATEMENT (avant la queue)
        // via le service centralisé (latence sub-seconde).
        // Uniquement à la première réception : sur un rejeu, la cliente a déjà
        // vu l'indicateur et le message est peut-être déjà traité.
        if (isFirstReceipt) {
          sendImmediateTyping(tenant, message.from, message.providerMessageId);
        }

        const validatedPayload = inboundMessageForQueueSchema.parse(normalizedMessage);
        const jobId = `${tenant.id}-${message.providerMessageId}`;

        // L'enfilage a son propre filet, distinct de celui du message.
        // Une donnée malformée (le `parse` ci-dessus) n'est pas rejouable : la
        // rejouer indéfiniment ne servirait à rien. Une file indisponible, si —
        // et c'est la seule erreur pour laquelle on demande à Meta de revenir.
        try {
          await ensureBossReady();
          const sendResult = await boss.send(QUEUE.WEBHOOK_PROCESSING, validatedPayload, { singletonKey: jobId });

          if (sendResult === null) {
            // singletonKey duplicate — job déjà enqueued, rien à refaire.
            webhookLogger.info("Meta job already enqueued (singletonKey duplicate)", {
              correlationId,
              providerMessageId: message.providerMessageId,
              tenantId: tenant.id,
              jobId,
            });
          } else {
            webhookLogger.info("Meta job enqueued", {
              correlationId,
              providerMessageId: message.providerMessageId,
              tenantId: tenant.id,
              jobId,
            });
          }
        } catch (enqueueError) {
          // Le message est en base mais sans job : sans rejeu, il ne sera jamais
          // traité et la cliente n'aura aucune réponse. On le signale à Meta.
          enqueueFailed = true;
          webhookLogger.error(
            "Meta job enqueue failed — réponse non-200 pour que Meta rejoue le lot",
            enqueueError,
            {
              correlationId,
              providerMessageId: message.providerMessageId,
              tenantId: tenant.id,
              jobId,
            },
          );
        }
      } catch (msgError) {
        // Log per-message error but continue processing remaining messages
        webhookLogger.error("Error processing Meta message in batch", msgError, {
          correlationId,
          providerMessageId: message.providerMessageId,
          tenantId: tenant.id,
        });
      }
    }

    // 12. Check temps ecoule
    const elapsed = Date.now() - startTime;
    webhookLogger.info("Meta webhook processed", {
      correlationId,
      elapsedMs: elapsed,
      tenantId: tenant.id,
      messageCount: messages.length,
    });

    if (elapsed >= 1000) {
      webhookLogger.warn("Meta response time exceeds 1s threshold", { correlationId, elapsedMs: elapsed });
    }

    // Meta ne rejoue un lot que sur une réponse non-2xx. C'est notre seul moyen
    // de récupérer un message persisté sans job : au rejeu, le chemin doublon
    // atteint désormais l'enfilage (cf. plus haut), donc le message repart.
    if (enqueueFailed || coexistenceEnqueueFailed) {
      return new NextResponse("Enqueue failed", { status: 503 });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    const isCriticalError =
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("ETIMEDOUT") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("database"));

    if (isCriticalError) {
      webhookLogger.error("Critical error processing Meta webhook", error, {
        correlationId,
        errorType: "critical",
      });
      void sendToSentry(error, {
        correlationId,
        tags: { component: "webhook-meta", errorType: "critical" },
      }).catch(() => {});

      // Base ou réseau indisponible : le lot n'a rien pu produire. Répondre 200
      // revenait à dire à Meta « bien reçu » et à perdre les messages sans
      // trace. Un 503 les fait rejouer, et le traitement est idempotent.
      return new NextResponse("Service unavailable", { status: 503 });
    }

    // Erreur attendue (charge malformée, signature, tenant inconnu) : rejouer
    // n'y changerait rien. On absorbe, comme le veut Meta.
    webhookLogger.error("Error processing Meta webhook", error, {
      correlationId,
      errorType: "expected",
    });

    return new NextResponse("Error", { status: 200 });
  }
}
