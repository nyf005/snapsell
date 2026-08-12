-- Coexistence : le numéro est partagé entre l'application WhatsApp Business et
-- la Cloud API. Confirmé par Meta à la connexion, jamais déduit du choix fait à
-- l'écran.
-- Nullable a dessein : NULL = indetermine. Une erreur de lecture chez Meta ne
-- vaut pas « non », sous peine de sauter la synchronisation et de perdre
-- l'historique dans la fenetre de 24 h.
ALTER TABLE "tenants" ADD COLUMN "meta_coexistence" BOOLEAN;

-- Suivi de la synchronisation d'historique. Meta n'accorde que 24 h après
-- l'intégration pour la lancer ; sans trace de son état, on ne saurait ni la
-- relancer ni dire à la boutique où elle en est.
ALTER TABLE "tenants" ADD COLUMN "meta_history_sync_status" TEXT;
ALTER TABLE "tenants" ADD COLUMN "meta_history_sync_at" TIMESTAMP(3);

-- Contacts remontés par l'application WhatsApp Business. Servent à afficher un
-- nom à la place d'un numéro ; aucune automatisation ne s'y branche.
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "full_name" TEXT,
    "first_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_contacts_tenant_id_phone_key" ON "whatsapp_contacts"("tenant_id", "phone");
CREATE INDEX "whatsapp_contacts_tenant_id_idx" ON "whatsapp_contacts"("tenant_id");

ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
