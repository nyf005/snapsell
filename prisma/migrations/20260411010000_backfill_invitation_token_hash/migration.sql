-- Backfill de sécurité: garantir token_hash sur les invitations legacy
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE invitations
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL
  AND token IS NOT NULL;
