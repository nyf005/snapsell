-- Les contacts se synchronisent separement de l'historique et peuvent echouer
-- seuls. Porter les deux dans `meta_history_sync_status` ne marchait pas : le
-- premier webhook d'historique ecrasait la trace de contacts manquants, et
-- l'ecran retirait alors le bouton de reprise en annoncant que tout allait bien.
ALTER TABLE "tenants" ADD COLUMN "meta_contacts_sync_status" TEXT;

-- Compatibilité avec les tentatives réalisées avant la séparation des états.
-- `partial` signifiait : historique demandé, contacts non demandés.
UPDATE "tenants"
SET "meta_contacts_sync_status" = 'failed',
    "meta_history_sync_status" = 'in_progress'
WHERE "meta_history_sync_status" = 'partial';
