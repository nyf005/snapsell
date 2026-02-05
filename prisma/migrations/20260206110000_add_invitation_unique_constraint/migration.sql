-- CreateIndex: Contrainte unique partielle pour éviter les invitations dupliquées
-- Uniquement pour les invitations non consommées (consumed_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS invitations_tenant_email_unique 
ON invitations(tenant_id, email) 
WHERE consumed_at IS NULL;
