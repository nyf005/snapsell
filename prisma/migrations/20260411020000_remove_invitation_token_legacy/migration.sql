-- Déploiement 2: suppression du stockage legacy des tokens d'invitation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Filet de sécurité avant durcissement du schéma
UPDATE invitations
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL
  AND token IS NOT NULL;

-- Garantir que toutes les invitations restantes ont un token_hash
ALTER TABLE invitations
  ALTER COLUMN token_hash SET NOT NULL;

-- Supprimer les artefacts legacy
DROP INDEX IF EXISTS invitations_token_idx;
DROP INDEX IF EXISTS invitations_token_key;
ALTER TABLE invitations
  DROP COLUMN IF EXISTS token;
