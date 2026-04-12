import { db } from "~/server/db";
import { decrypt } from "~/lib/crypto";
import { MetaCloudAdapter } from "./providers/meta/adapter";
import { workerLogger } from "~/lib/logger";

/**
 * Interface minimale pour un tenant avec accès Meta (sélectionnée via Prisma)
 */
export interface MetaTenantAccess {
  id: string;
  metaPhoneNumberId: string | null;
  metaAccessToken: string | null;
}

/**
 * Récupère un MessagingProvider (MetaCloudAdapter) pour un tenant donné.
 * Gère le lookup DB si nécessaire et le décryptage des credentials.
 * 
 * @param tenantOrId - ID du tenant ou objet tenant déjà chargé
 * @returns Instance de l'adaptateur ou null si credentials manquants
 */
export async function getProviderForTenant(
  tenantOrId: string | MetaTenantAccess
): Promise<MetaCloudAdapter | null> {
  const tenant = typeof tenantOrId === "string"
    ? await db.tenant.findUnique({
        where: { id: tenantOrId },
        select: { id: true, metaPhoneNumberId: true, metaAccessToken: true },
      })
    : tenantOrId;

  if (!tenant?.metaPhoneNumberId || !tenant?.metaAccessToken) {
    workerLogger.debug("Messaging provider requested but credentials missing", { 
      tenantId: typeof tenantOrId === "string" ? tenantOrId : tenantOrId.id 
    });
    return null;
  }

  try {
    return new MetaCloudAdapter(
      tenant.metaPhoneNumberId,
      decrypt(tenant.metaAccessToken)
    );
  } catch (error) {
    workerLogger.error("Failed to instantiate MetaCloudAdapter", error, {
      tenantId: tenant.id
    });
    return null;
  }
}

/**
 * Envoie un indicateur de frappe (typing indicator) instantanément.
 * Utilisé principalement dans les routes API Webhook pour une réactivité sub-seconde.
 * 
 * @param tenantOrId - ID du tenant ou objet tenant
 * @param to - Numéro destinataire
 * @param correlationId - ID du message de référence (wamid)
 */
export async function sendImmediateTyping(
  tenantOrId: string | MetaTenantAccess,
  to: string,
  correlationId: string
): Promise<void> {
  try {
    const adapter = await getProviderForTenant(tenantOrId);
    if (!adapter) return;

    // "Fire and forget" pour ne pas bloquer le thread principal, 
    // mais avec un catch pour le logging
    adapter.send({
      tenantId: typeof tenantOrId === "string" ? tenantOrId : tenantOrId.id,
      to,
      isTypingIndicator: true,
      correlationId,
    }).catch(err => {
      workerLogger.debug("Immediate typing indicator failed (non-critical)", { 
        error: err, 
        correlationId 
      });
    });
  } catch (err) {
    // Erreur silencieuse car l'indicateur est non-critique
  }
}
