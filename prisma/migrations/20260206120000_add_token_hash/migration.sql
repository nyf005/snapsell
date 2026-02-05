-- Migration: Ajouter tokenHash et migrer les tokens existants
-- 1. Activer l'extension pgcrypto si nécessaire (pour digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Ajouter colonne token_hash
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- 3. Créer index unique sur token_hash
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_key ON invitations(token_hash) WHERE token_hash IS NOT NULL;

-- 4. Hasher tous les tokens existants avec SHA-256
-- Utilise digest() de pgcrypto qui retourne bytea, puis encode en hex
-- Note: token est TEXT, donc on utilise directement digest() qui accepte text
UPDATE invitations 
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- 5. Créer index sur token_hash pour performance
CREATE INDEX IF NOT EXISTS invitations_token_hash_idx ON invitations(token_hash) WHERE token_hash IS NOT NULL;
