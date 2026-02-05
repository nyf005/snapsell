-- Script pour hasher les tokens existants dans la table invitations
-- À exécuter manuellement si nécessaire

-- Activer pgcrypto si nécessaire
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hasher tous les tokens existants qui n'ont pas encore de token_hash
UPDATE invitations 
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- Vérifier le résultat
SELECT COUNT(*) as total, 
       COUNT(token_hash) as hashed,
       COUNT(*) - COUNT(token_hash) as not_hashed
FROM invitations;
