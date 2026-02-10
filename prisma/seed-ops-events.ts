/**
 * Story 7B.1 – Seed script : génère des EventLog fictifs pour tester la console ops en local.
 *
 * Usage :
 *   npx tsx prisma/seed-ops-events.ts
 *
 * Prérequis :
 *   - Au moins un Tenant doit exister en base (le script utilise le premier trouvé).
 *   - DATABASE_URL configuré dans .env.
 */

import { PrismaClient } from "../generated/prisma";
import { randomUUID } from "crypto";

const db = new PrismaClient();

const EVENT_TYPES = [
  "webhook_received",
  "message_sent",
  "idempotent_ignored",
  "live_session_created",
  "live_session_closed",
  "live_item_created",
  "reservation_started",
  "reservation_confirmed",
  "reservation_expired",
  "waitlist_promoted",
  "order_created",
  "order.status_changed",
  "deposit_approved",
  "deposit_rejected",
] as const;

const ENTITY_TYPES = [
  "message_in",
  "message_out",
  "live_session",
  "live_item",
  "reservation",
  "waitlist",
  "order",
  "payment_proof",
  "webhook",
] as const;

const ACTOR_TYPES = ["system", "seller", "client"] as const;

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generatePayload(eventType: string): Record<string, unknown> {
  switch (eventType) {
    case "webhook_received":
      return {
        provider: "twilio",
        from: "+22890123456",
        to: "+33612345678",
        body: "Bonjour, je veux réserver le sac Louis Vuitton",
        messageSid: `SM${randomUUID().replace(/-/g, "").slice(0, 32)}`,
      };
    case "message_sent":
      return {
        to: "+22890123456",
        body: "Votre réservation a été confirmée ✅",
        templateId: "reservation_confirmed",
        phoneNumber: "+33612345678",
      };
    case "reservation_started":
      return {
        clientPhone: "+22897654321",
        itemName: "Sac Gucci Marmont",
        price: 45000,
        address: "123 Boulevard de la République, Lomé, Togo, BP 1234",
      };
    case "order_created":
      return {
        orderNumber: `ORD-${Math.floor(Math.random() * 10000)}`,
        totalCents: Math.floor(Math.random() * 200000) + 5000,
        items: 2,
      };
    case "order.status_changed":
      return {
        from: "pending",
        to: "confirmed",
        orderNumber: `ORD-${Math.floor(Math.random() * 10000)}`,
      };
    case "deposit_approved":
      return {
        proof: "payment_proof_image_a_very_long_storage_key_here.jpg",
        amount: Math.floor(Math.random() * 50000) + 1000,
        method: "mobile_money",
      };
    case "deposit_rejected":
      return {
        reason: "Image floue, montant non lisible",
        mediaStorageKey:
          "uploads/proofs/2024-01-01/abc123def456_long_key_here.jpg",
      };
    default:
      return {
        detail: `Événement ${eventType} simulé pour test ops`,
        timestamp: new Date().toISOString(),
      };
  }
}

async function main() {
  console.log("🌱 Seed ops events – Story 7B.1\n");

  const tenants = await db.tenant.findMany({
    select: { id: true, name: true },
    take: 3,
  });

  if (tenants.length === 0) {
    console.error(
      "❌ Aucun tenant trouvé. Créez d'abord un tenant via l'app ou un autre seed.",
    );
    process.exit(1);
  }

  console.log(
    `📋 Tenants disponibles : ${tenants.map((t) => `${t.name} (${t.id})`).join(", ")}\n`,
  );

  const EVENTS_PER_TENANT = 30;
  const CORRELATIONS_PER_TENANT = 5;
  let totalCreated = 0;

  for (const tenant of tenants) {
    console.log(`  ▸ Tenant "${tenant.name}" – ${EVENTS_PER_TENANT} events…`);

    // Générer quelques correlationIds réutilisables (simule un flux bout en bout)
    const correlationIds = Array.from(
      { length: CORRELATIONS_PER_TENANT },
      () => randomUUID(),
    );

    const events = Array.from({ length: EVENTS_PER_TENANT }, (_, i) => {
      const eventType = randomFrom(EVENT_TYPES);
      return {
        tenantId: tenant.id,
        eventType,
        entityType: randomFrom(ENTITY_TYPES),
        entityId: Math.random() > 0.3 ? `entity-${i}` : null,
        correlationId: randomFrom(correlationIds),
        actorType: randomFrom(ACTOR_TYPES),
        payload: generatePayload(eventType),
        createdAt: new Date(
          Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
        ), // Derniers 7 jours
      };
    });

    await db.eventLog.createMany({ data: events });
    totalCreated += events.length;
  }

  console.log(`\n✅ ${totalCreated} événements créés pour ${tenants.length} tenant(s).`);
  console.log(
    "💡 Accédez à la console ops sur /ops/logs pour les consulter.",
  );
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
