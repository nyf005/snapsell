import { db } from "~/server/db";
import { webhookLogger } from "~/lib/logger";
import { normalizeMetaPhone } from "~/lib/validations/phone";

/**
 * ── TRAITEMENTS DE COEXISTENCE — AUCUNE AUTOMATISATION ICI ─────────────────
 *
 * Ces trois évènements décrivent le passé ou l'activité propre de la boutique :
 * ce qu'elle a envoyé depuis son téléphone, ses contacts, ses anciennes
 * conversations. Rien de tout cela n'est une sollicitation d'une cliente qui
 * attend une réponse.
 *
 * Ce module n'écrit donc jamais dans l'outbox et n'enfile aucune tâche. C'est la
 * règle qui compte : `webhook-processor.ts` répond automatiquement à ce qu'il
 * reçoit, et y faire entrer ces messages ferait répondre SnapSell à la boutique
 * elle-même, ou pire, relancerait des conversations closes depuis des mois.
 * ────────────────────────────────────────────────────────────────────────────
 */

type Dict = Record<string, unknown>;

function asArray(value: unknown): Dict[] {
  return Array.isArray(value) ? (value.filter((v) => typeof v === "object" && v !== null) as Dict[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asDict(value: unknown): Dict | null {
  return typeof value === "object" && value !== null ? (value as Dict) : null;
}

/** Convertit l'horodatage Unix fourni par Meta sans rendre l'import fragile. */
function metaTimestamp(value: unknown): Date | null {
  const raw = typeof value === "number" ? value : Number.parseFloat(asString(value) ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return null;

  // Les payloads WhatsApp utilisent des secondes. Accepter aussi des
  // millisecondes rend le parseur tolérant sans modifier les dates valides.
  const date = new Date(raw >= 1_000_000_000_000 ? raw : raw * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Le texte affichable d'un message, quel que soit son type.
 *
 * Meta range le contenu sous une clé qui porte le nom du type (`text`, `image`,
 * `document`…). Un média sans légende n'a pas de texte : on rend une chaîne
 * vide plutôt que d'inventer un libellé, `MessageIn.body` n'acceptant pas null.
 */
function extractBody(message: Dict): string {
  const type = asString(message.type) ?? "";
  const content = asDict(message[type]);
  if (!content) return "";
  return asString(content.body) ?? asString(content.caption) ?? "";
}

/**
 * ── UN IMPORT INCOMPLET N'EST PAS UN IMPORT RÉUSSI ────────────────────────
 *
 * Les erreurs d'écriture étaient capturées ligne par ligne puis oubliées : le
 * job se terminait normalement, pg-boss le considérait réussi et ne le rejouait
 * jamais. Une base momentanément indisponible pouvait donc laisser une reprise
 * marquée « terminée » alors qu'il manquait des messages ou des contacts.
 *
 * On laisse volontairement remonter après avoir parcouru tout le lot : les
 * écritures se font par `upsert`, donc le rejeu ne duplique rien et reprend
 * seulement ce qui manque.
 */
function throwIfIncomplete(
  what: string,
  failures: number,
  params: { correlationId: string; tenantId: string },
): void {
  if (failures === 0) return;
  webhookLogger.error(
    `Coexistence: import ${what} incomplet — rejeu demandé`,
    new Error(`${failures} écriture(s) en échec`),
    { correlationId: params.correlationId, tenantId: params.tenantId },
  );
  throw new Error(`Import ${what} incomplet: ${failures} écriture(s) en échec`);
}

function safeNormalize(phone: string | null): string | null {
  if (!phone) return null;
  try {
    return normalizeMetaPhone(phone);
  } catch {
    return null;
  }
}

/**
 * Messages envoyés par la boutique depuis son application WhatsApp Business.
 *
 * Ils sont enregistrés comme sortants — ce qu'ils sont — pour que le tableau de
 * bord montre la conversation complète plutôt que la moitié dont SnapSell est
 * l'auteur. `providerMessageId` sert de clé d'idempotence : Meta rejoue ses
 * webhooks, et un même écho ne doit pas produire deux lignes.
 */
export async function handleMessageEchoes(params: {
  tenantId: string;
  value: Dict;
  correlationId: string;
}): Promise<number> {
  const echoes = asArray(params.value.message_echoes);
  let written = 0;
  let failures = 0;

  for (const echo of echoes) {
    const wamid = asString(echo.id);
    const to = safeNormalize(asString(echo.to));
    if (!wamid || !to) continue;
    const sentAt = metaTimestamp(echo.timestamp);

    try {
      await db.messageOut.upsert({
        where: {
          tenantId_correlationId_to: { tenantId: params.tenantId, correlationId: wamid, to },
        },
        create: {
          tenantId: params.tenantId,
          to,
          body: extractBody(echo),
          // Déjà parti, et pas par nous : l'outbox ne doit surtout pas le
          // reprendre pour l'envoyer une seconde fois.
          status: "sent",
          correlationId: wamid,
          providerMessageId: wamid,
          ...(sentAt ? { createdAt: sentAt } : {}),
        },
        update: sentAt ? { createdAt: sentAt } : {},
      });
      written += 1;
    } catch (error) {
      failures += 1;
      webhookLogger.error(
        "Coexistence: écho non enregistré",
        error instanceof Error ? error : new Error(String(error)),
        { correlationId: params.correlationId, tenantId: params.tenantId },
      );
    }
  }

  throwIfIncomplete("échos", failures, params);
  return written;
}

/**
 * Contacts de l'application WhatsApp Business.
 *
 * Sert à afficher un nom à la place d'un numéro. `action` vaut `add` ou
 * `remove` ; tout autre valeur est ignorée plutôt que devinée.
 */
export async function handleAppStateSync(params: {
  tenantId: string;
  value: Dict;
  correlationId: string;
}): Promise<number> {
  const entries = asArray(params.value.state_sync);
  let applied = 0;
  let failures = 0;
  let sawContactChange = false;

  for (const entry of entries) {
    if (asString(entry.type) !== "contact") continue;

    const contact = asDict(entry.contact);
    const phone = safeNormalize(asString(contact?.phone_number));
    if (!phone) continue;

    const action = asString(entry.action);

    try {
      if (action === "remove") {
        sawContactChange = true;
        await db.whatsAppContact.deleteMany({
          where: { tenantId: params.tenantId, phone },
        });
      } else if (action === "add") {
        sawContactChange = true;
        await db.whatsAppContact.upsert({
          where: { tenantId_phone: { tenantId: params.tenantId, phone } },
          create: {
            tenantId: params.tenantId,
            phone,
            fullName: asString(contact?.full_name),
            firstName: asString(contact?.first_name),
          },
          update: {
            fullName: asString(contact?.full_name),
            firstName: asString(contact?.first_name),
          },
        });
      } else {
        continue;
      }
      applied += 1;
    } catch (error) {
      failures += 1;
      webhookLogger.error(
        "Coexistence: contact non synchronisé",
        error instanceof Error ? error : new Error(String(error)),
        { correlationId: params.correlationId, tenantId: params.tenantId },
      );
    }
  }

  if (failures > 0) {
    await db.tenant.updateMany({
      where: {
        id: params.tenantId,
        OR: [
          { metaContactsSyncStatus: null },
          { metaContactsSyncStatus: { not: "completed" } },
        ],
      },
      data: { metaContactsSyncStatus: "failed" },
    });
    throwIfIncomplete("contacts", failures, params);
  }

  /*
    Les contacts sont arrivés : on lève l'éventuel « échec » posé à la demande.
    C'est ce qui retire de l'écran l'avertissement sur les noms manquants.
  */
  if (sawContactChange) {
    await db.tenant.updateMany({
      where: {
        id: params.tenantId,
        OR: [
          { metaContactsSyncStatus: null },
          { metaContactsSyncStatus: { not: "completed" } },
        ],
      },
      data: { metaContactsSyncStatus: "completed" },
    });
  }

  return applied;
}

/**
 * Anciennes conversations, envoyées par tranches après l'intégration.
 *
 * Le sens de lecture est donné par `from` : ce qui vient du numéro de la
 * boutique est sortant, le reste est entrant. C'est la seule manière de
 * reconstituer une conversation lisible — sans quoi tout apparaîtrait comme
 * reçu, y compris les réponses de la boutique.
 *
 * Aucun de ces messages ne déclenche quoi que ce soit : ils sont vieux de
 * plusieurs mois, et les rejouer réveillerait des conversations closes.
 */
export async function handleHistory(params: {
  tenantId: string;
  value: Dict;
  correlationId: string;
}): Promise<{ imported: number; progress: string | null }> {
  const businessPhone = safeNormalize(
    asString(asDict(params.value.metadata)?.display_phone_number),
  );
  let imported = 0;
  let failures = 0;
  let progress: string | null = null;

  for (const chunk of asArray(params.value.history)) {
    progress = asString(asDict(chunk.metadata)?.progress) ?? progress;

    for (const thread of asArray(chunk.threads)) {
      for (const message of asArray(thread.messages)) {
        const wamid = asString(message.id);
        const from = safeNormalize(asString(message.from));
        const to = safeNormalize(asString(message.to));
        if (!wamid || !from) continue;
        const sentAt = metaTimestamp(message.timestamp);

        const isFromBusiness = businessPhone != null && from === businessPhone;

        try {
          if (isFromBusiness) {
            if (!to) continue;
            await db.messageOut.upsert({
              where: {
                tenantId_correlationId_to: {
                  tenantId: params.tenantId,
                  correlationId: wamid,
                  to,
                },
              },
              create: {
                tenantId: params.tenantId,
                to,
                body: extractBody(message),
                status: "sent",
                correlationId: wamid,
                providerMessageId: wamid,
                ...(sentAt ? { createdAt: sentAt } : {}),
              },
              update: sentAt ? { createdAt: sentAt } : {},
            });
          } else {
            await db.messageIn.upsert({
              where: {
                tenantId_providerMessageId: {
                  tenantId: params.tenantId,
                  providerMessageId: wamid,
                },
              },
              create: {
                tenantId: params.tenantId,
                providerMessageId: wamid,
                from,
                body: extractBody(message),
                correlationId: wamid,
                ...(sentAt ? { createdAt: sentAt } : {}),
              },
              update: sentAt ? { createdAt: sentAt } : {},
            });
          }
          imported += 1;
        } catch (error) {
          failures += 1;
          webhookLogger.error(
            "Coexistence: message d'historique non importé",
            error instanceof Error ? error : new Error(String(error)),
            { correlationId: params.correlationId, tenantId: params.tenantId },
          );
        }
      }
    }
  }

  /**
   * Meta documente `progress` sans en préciser le format. On ne marque donc
   * « terminé » que sur une valeur numérique atteignant 100, et on reste sinon
   * en « en cours » — se tromper dans ce sens fait afficher une synchronisation
   * en cours un peu trop longtemps, l'inverse ferait annoncer une reprise
   * complète alors qu'il manque des conversations.
   */
  const numericProgress = progress != null ? Number.parseFloat(progress) : Number.NaN;
  const status =
    Number.isFinite(numericProgress) && numericProgress >= 100 ? "completed" : "in_progress";

  /**
   * ── L'ÉTAT NE RECULE JAMAIS ────────────────────────────────────────────
   *
   * Meta envoie l'historique par tranches, et le worker en traite deux à la
   * fois : la tranche à 100 % peut donc être écrite avant une tranche à 50 %
   * restée en route. Une écriture inconditionnelle faisait alors repasser une
   * reprise terminée en « en cours », et la boutique voyait sa page revenir en
   * arrière sans raison — voire attendre indéfiniment une fin déjà survenue.
   *
   * Le même garde protège de la course avec le routeur, qui écrit `requested`
   * après le retour de Meta : un premier webhook peut le devancer.
   */
  /**
   * ── LA GARDE DOIT COUVRIR `NULL`, PAS SEULEMENT LES AUTRES VALEURS ──────
   *
   * `{ not: "completed" }` seul ne sélectionne pas les lignes où la colonne
   * vaut `NULL` — c'est la logique SQL des valeurs nulles, et c'est exactement
   * l'état juste après une connexion. Un webhook rapide importait donc les
   * messages puis n'écrivait rien : la reprise restait invisible, et le routeur
   * n'y posait ensuite que « demandé ».
   *
   * Le `OR` explicite lève l'ambiguïté quelle que soit la traduction de Prisma.
   */
  if (failures > 0) {
    await db.tenant.updateMany({
      where: {
        id: params.tenantId,
        OR: [
          { metaHistorySyncStatus: null },
          { metaHistorySyncStatus: { not: "completed" } },
        ],
      },
      data: { metaHistorySyncStatus: "failed" },
    });
    throwIfIncomplete("historique", failures, params);
  }

  await db.tenant.updateMany({
    where: {
      id: params.tenantId,
      // `completed` est terminal : rien ne le remplace.
      OR: [{ metaHistorySyncStatus: null }, { metaHistorySyncStatus: { not: "completed" } }],
    },
    data: { metaHistorySyncStatus: status },
  });

  return { imported, progress };
}
