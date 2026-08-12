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

  for (const echo of echoes) {
    const wamid = asString(echo.id);
    const to = safeNormalize(asString(echo.to));
    if (!wamid || !to) continue;

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
        },
        update: {},
      });
      written += 1;
    } catch (error) {
      webhookLogger.error(
        "Coexistence: écho non enregistré",
        error instanceof Error ? error : new Error(String(error)),
        { correlationId: params.correlationId, tenantId: params.tenantId },
      );
    }
  }

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

  for (const entry of entries) {
    if (asString(entry.type) !== "contact") continue;

    const contact = asDict(entry.contact);
    const phone = safeNormalize(asString(contact?.phone_number));
    if (!phone) continue;

    const action = asString(entry.action);

    try {
      if (action === "remove") {
        await db.whatsAppContact.deleteMany({
          where: { tenantId: params.tenantId, phone },
        });
      } else if (action === "add") {
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
      webhookLogger.error(
        "Coexistence: contact non synchronisé",
        error instanceof Error ? error : new Error(String(error)),
        { correlationId: params.correlationId, tenantId: params.tenantId },
      );
    }
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
  let progress: string | null = null;

  for (const chunk of asArray(params.value.history)) {
    progress = asString(asDict(chunk.metadata)?.progress) ?? progress;

    for (const thread of asArray(chunk.threads)) {
      for (const message of asArray(thread.messages)) {
        const wamid = asString(message.id);
        const from = safeNormalize(asString(message.from));
        const to = safeNormalize(asString(message.to));
        if (!wamid || !from) continue;

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
              },
              update: {},
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
              },
              update: {},
            });
          }
          imported += 1;
        } catch (error) {
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
  await db.tenant.updateMany({
    // `completed` est terminal : rien ne le remplace.
    where: { id: params.tenantId, metaHistorySyncStatus: { not: "completed" } },
    data: { metaHistorySyncStatus: status },
  });

  return { imported, progress };
}
