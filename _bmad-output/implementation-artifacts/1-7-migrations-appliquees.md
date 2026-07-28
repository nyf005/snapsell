# Migrations Appliquées - Story 1-7

**Date** : 2026-02-05  
**Status** : ✅ **MIGRATIONS APPLIQUÉES**

---

## ✅ Migrations Appliquées

### 1. Contrainte Unique sur (tenantId, email)
- **Migration** : `20260206110000_add_invitation_unique_constraint`
- **Status** : ✅ Appliquée
- **Changement** : Index unique partiel sur `(tenant_id, email)` où `consumed_at IS NULL`

### 2. Hash des Tokens
- **Migration** : `20260206120000_add_token_hash`
- **Status** : ✅ Schéma synchronisé via `prisma db push`
- **Changements** :
  - Colonne `token_hash` ajoutée (TEXT, unique)
  - Index unique créé sur `token_hash`
  - Extension `pgcrypto` activée pour `digest()`

---

## 📝 État de la Base de Données

**Schéma synchronisé** : ✅ Oui  
**Client Prisma généré** : ✅ Oui  
**Tests passent** : ✅ Oui (11/11)

---

## ⚠️ Action Manuelle Requise (Optionnelle)

Si vous avez des invitations existantes dans la base de données, vous devez hasher leurs tokens :

```sql
-- Activer pgcrypto si nécessaire
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hasher tous les tokens existants
UPDATE invitations 
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;
```

**Script disponible** : `scripts/hash-existing-tokens.sql`

---

## ✅ Validation

- ✅ Schéma Prisma synchronisé avec la base de données
- ✅ Colonne `token_hash` créée
- ✅ Index unique sur `token_hash` créé
- ✅ Client Prisma régénéré avec les nouveaux types
- ✅ Code compile sans erreurs TypeScript
- ✅ Tests passent

---

## 🎯 Prochaines Étapes

1. ✅ Migrations appliquées
2. ⚠️ Hasher les tokens existants (si nécessaire) - Script SQL fourni
3. ✅ Code prêt pour utilisation
4. 📝 Optionnel : Supprimer colonne `token` après vérification (migration future)

---

**Date de complétion** : 2026-02-05
