-- Story 2.6 complement: une seule session active par tenant (contrainte unique partielle)
-- Évite la création concurrente de deux sessions actives pour le même tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "live_sessions_tenant_id_active_key" ON "live_sessions"("tenant_id") WHERE "status" = 'active';
