# Refactorisations Nécessaires - Story 1-7

**Date** : 2026-02-05  
**Problèmes** : H-2 (Hash des tokens) et H-4 (Session serveur-side)

---

## 🔐 H-2 : Hasher les Tokens d'Invitation

### Problème Actuel

Les tokens d'invitation sont stockés **en clair** dans la base de données :

```typescript
// invitations.ts:75
const token = crypto.randomBytes(32).toString("hex");
// Stocké directement : token = "a1b2c3d4e5f6..."
```

**Risque** : Si la DB est compromise, tous les tokens sont exposés et peuvent être réutilisés.

### Solution : Hash des Tokens

#### Architecture Proposée

```
┌─────────────────┐
│  Client Request │
│  token: "abc123"│
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Hash Token (bcrypt)   │
│  hash("abc123") → "xyz" │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Recherche dans DB      │
│  WHERE token_hash = "xyz"│
└─────────────────────────┘
```

#### Changements Nécessaires

**1. Modifier le Schéma Prisma**

```prisma
model Invitation {
  id         String    @id @default(cuid())
  tenantId   String    @map("tenant_id")
  email      String
  role       Role      @default(AGENT)
  tokenHash  String    @unique @map("token_hash")  // ⚠️ Changé de "token" à "token_hash"
  expiresAt  DateTime  @map("expires_at")
  consumedAt DateTime? @map("consumed_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([tokenHash])  // ⚠️ Index sur tokenHash au lieu de token
  @@map("invitations")
}
```

**2. Migration SQL**

```sql
-- Migration: hash_existing_tokens
-- 1. Ajouter colonne token_hash
ALTER TABLE invitations ADD COLUMN token_hash TEXT;

-- 2. Hasher tous les tokens existants (si migration de données)
UPDATE invitations 
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL;

-- 3. Créer index unique
CREATE UNIQUE INDEX invitations_token_hash_key ON invitations(token_hash);

-- 4. Supprimer colonne token (après vérification)
ALTER TABLE invitations DROP COLUMN token;
```

**3. Modifier `createInvitation`**

```typescript
// Avant
const token = crypto.randomBytes(32).toString("hex");
return await tx.invitation.create({
  data: {
    token,  // Stocké en clair
    // ...
  },
});

// Après
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = await hash(token, 10);  // Hash avec bcrypt

// Stocker le token original temporairement pour le retourner au client
const invitation = await tx.invitation.create({
  data: {
    tokenHash,  // Stocké hashé
    // ...
  },
});

return {
  acceptLink: `/invite/accept?token=${token}`,  // Token original dans l'URL
  // ...
};
```

**4. Modifier `getInvitationByToken` et `acceptInvitation`**

```typescript
// Avant
const inv = await db.invitation.findUnique({
  where: { token: input.token },
});

// Après
const tokenHash = await hash(input.token, 10);
const inv = await db.invitation.findUnique({
  where: { tokenHash },
});
```

**⚠️ Problème Critique** : `bcrypt.hash()` produit un hash **différent à chaque appel** (salt aléatoire) !

```typescript
hash("abc123", 10) → "$2b$10$xyz..."  // Hash 1
hash("abc123", 10) → "$2b$10$abc..."  // Hash 2 (différent !)
```

**Solution** : Utiliser `bcrypt.compare()` au lieu de `hash()` pour la vérification :

```typescript
// ❌ INCORRECT
const tokenHash = await hash(input.token, 10);
const inv = await db.invitation.findUnique({ where: { tokenHash } });

// ✅ CORRECT
const invitations = await db.invitation.findMany({
  where: { tenantId: expectedTenantId, consumedAt: null },
});
const inv = await Promise.all(
  invitations.map(async (inv) => {
    const matches = await compare(input.token, inv.tokenHash);
    return matches ? inv : null;
  })
).then(results => results.find(r => r !== null));
```

**⚠️ Problème Performance** : Cela nécessite de charger **toutes les invitations** et de comparer avec bcrypt, ce qui est très lent !

**Alternative Recommandée** : Utiliser SHA-256 (déterministe) au lieu de bcrypt :

```typescript
import crypto from "node:crypto";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Création
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = hashToken(token);  // Déterministe, peut être indexé

// Recherche
const tokenHash = hashToken(input.token);
const inv = await db.invitation.findUnique({
  where: { tokenHash },
});
```

#### Impact de la Refactorisation

| Aspect | Impact |
|--------|--------|
| **Migration DB** | ⚠️ HAUTE - Nécessite migration avec hash des tokens existants |
| **Performance** | ✅ BONNE - Si SHA-256 (index direct), ⚠️ MAUVAISE si bcrypt |
| **Sécurité** | ✅ AMÉLIORÉE - Tokens non exposés en DB |
| **Code** | ⚠️ MODÉRÉ - Changements dans 3 procédures tRPC |
| **Tests** | ⚠️ MODÉRÉ - Mettre à jour tous les tests utilisant tokens |

#### Plan d'Implémentation

1. **Créer migration** avec colonne `token_hash`
2. **Hasher tokens existants** (si migration de données)
3. **Modifier schéma Prisma** (`token` → `tokenHash`)
4. **Créer helper `hashToken()`** (SHA-256)
5. **Modifier `createInvitation`** (hasher avant stockage)
6. **Modifier `getInvitationByToken`** (hasher avant recherche)
7. **Modifier `acceptInvitation`** (hasher avant recherche)
8. **Mettre à jour tests** (utiliser tokens hashés)
9. **Supprimer colonne `token`** (après vérification)

**Estimation** : 4-6 heures de développement + tests

---

## 🔑 H-4 : Créer Session Serveur-Side

### Problème Actuel

La création de session après acceptation d'invitation dépend du **client** :

```typescript
// invite/accept/page.tsx:43-60
const res = await signIn("credentials", {
  email,
  password: variables.password,
  callbackUrl: "/dashboard",
  redirect: false,
});
if (res?.ok) {
  router.push("/dashboard");
} else {
  setError("Compte créé mais connexion échouée...");
}
```

**Problèmes** :
- Si `signIn()` échoue, l'utilisateur a un compte mais n'est pas connecté
- Dépendance au client pour créer la session
- Pas de garantie que la session soit créée

### Solution : Session Serveur-Side

#### Architecture Proposée

```
┌─────────────────────┐
│ acceptInvitation()  │
│ (tRPC mutation)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Créer User          │
│ Créer Session       │ ← Nouveau
│ Générer SessionToken│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Retourner           │
│ sessionToken        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Client: Set Cookie  │
│ Redirect Dashboard  │
└─────────────────────┘
```

#### Option 1 : Utiliser NextAuth Session Directement

**Avantages** : Réutilise l'infrastructure existante  
**Inconvénients** : Nécessite accès aux cookies dans tRPC

```typescript
// invitations.ts
import { signIn } from "next-auth/react";  // ❌ Ne fonctionne pas côté serveur
```

**Problème** : `signIn()` de NextAuth est une fonction **client-side** uniquement.

#### Option 2 : Créer Session Manuellement avec NextAuth

```typescript
// invitations.ts
import { encode } from "next-auth/jwt";
import { db } from "~/server/db";

acceptInvitation: publicProcedure
  .input(acceptInvitationInputSchema)
  .mutation(async ({ input, ctx }) => {
    // ... création user ...
    
    // Créer session NextAuth manuellement
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date();
    expires.setDate(expires.getDate() + 30); // 30 jours
    
    // Créer session dans DB
    await db.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });
    
    // Générer JWT pour le cookie
    const token = await encode({
      token: {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
      },
      secret: process.env.AUTH_SECRET!,
    });
    
    // Retourner token pour que le client set le cookie
    return {
      created: true,
      userId: user.id,
      sessionToken: token,  // JWT à mettre dans cookie
      message: "Compte créé avec succès.",
    };
  }),
```

**Problème** : Le client doit gérer le cookie manuellement, ce qui est complexe.

#### Option 3 : Utiliser NextAuth API Route

**Meilleure approche** : Créer une route API NextAuth dédiée :

```typescript
// src/app/api/auth/accept-invitation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { signIn } from "next-auth/react";
import { db } from "~/server/db";
import { hash } from "bcrypt";

export async function POST(request: NextRequest) {
  const { token, name, password } = await request.json();
  
  // Valider invitation
  const inv = await db.invitation.findUnique({ where: { token } });
  // ... validation ...
  
  // Créer user
  const passwordHash = await hash(password, 10);
  const user = await db.user.create({
    data: {
      tenantId: inv.tenantId,
      email: inv.email,
      name,
      passwordHash,
      role: inv.role,
    },
  });
  
  // Consommer invitation
  await db.invitation.update({
    where: { id: inv.id },
    data: { consumedAt: new Date() },
  });
  
  // Créer session NextAuth
  // Utiliser les credentials pour créer la session
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  
  // Créer session via NextAuth (nécessite accès aux internals)
  // ...
  
  return response;
}
```

**Problème** : NextAuth ne fournit pas d'API publique pour créer une session côté serveur dans App Router.

#### Option 4 : Retourner Token et Créer Session Client-Side (Recommandé)

**Approche hybride** : Le serveur crée le compte, le client crée la session :

```typescript
// invitations.ts - Modifié
acceptInvitation: publicProcedure
  .input(acceptInvitationInputSchema)
  .mutation(async ({ input }) => {
    // ... création user et consommation invitation ...
    
    return {
      created: true,
      userId: user.id,
      email: user.email,
      // Ne pas retourner le password hash !
      message: "Compte créé avec succès. Vous allez être connecté automatiquement.",
    };
  }),

// invite/accept/page.tsx - Modifié
const acceptInvitation = api.invitations.acceptInvitation.useMutation({
  onSuccess: async (result) => {
    // Le serveur a créé le compte
    // Maintenant créer la session avec les credentials
    const res = await signIn("credentials", {
      email: result.email,
      password: password,  // Password déjà saisi par l'utilisateur
      callbackUrl: "/dashboard",
      redirect: false,
    });
    
    if (res?.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      // Gérer erreur de connexion
      setError("Compte créé mais connexion échouée. Veuillez vous connecter manuellement.");
    }
  },
});
```

**Avantage** : Réutilise l'infrastructure NextAuth existante  
**Inconvénient** : Toujours dépendant du client, mais plus robuste

#### Option 5 : Utiliser NextAuth Callbacks (Meilleure Solution)

Créer un endpoint API qui accepte le token d'invitation et crée la session :

```typescript
// src/app/api/auth/accept-invitation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "~/server/auth";
import { db } from "~/server/db";
import { hash, compare } from "bcrypt";

export async function POST(request: NextRequest) {
  const { token, name, password } = await request.json();
  
  // Valider et accepter invitation (même logique que tRPC)
  const inv = await db.invitation.findUnique({ where: { token } });
  // ... validation ...
  
  // Créer user
  const passwordHash = await hash(password, 10);
  const user = await db.user.create({
    data: {
      tenantId: inv.tenantId,
      email: inv.email,
      name,
      passwordHash,
      role: inv.role,
    },
  });
  
  // Consommer invitation
  await db.invitation.update({
    where: { id: inv.id },
    data: { consumedAt: new Date() },
  });
  
  // Créer session NextAuth en utilisant les credentials
  // Rediriger vers une route qui appelle signIn() automatiquement
  const response = NextResponse.redirect(
    new URL(`/api/auth/callback/credentials?email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(password)}&callbackUrl=/dashboard`, request.url)
  );
  
  return response;
}
```

**Problème** : NextAuth n'a pas de route `/api/auth/callback/credentials` par défaut.

#### Solution Recommandée : Améliorer la Gestion d'Erreur Actuelle

Au lieu de refactoriser complètement, **améliorer la robustesse** de l'approche actuelle :

```typescript
// invitations.ts - Ajouter retry logic
acceptInvitation: publicProcedure
  .input(acceptInvitationInputSchema)
  .mutation(async ({ input }) => {
    // ... création user ...
    
    // Retourner un flag indiquant que la session doit être créée
    return {
      created: true,
      userId: user.id,
      email: user.email,
      requiresSignIn: true,  // Indique au client de créer la session
      message: "Compte créé avec succès.",
    };
  }),

// invite/accept/page.tsx - Améliorer gestion erreur
const acceptInvitation = api.invitations.acceptInvitation.useMutation({
  onSuccess: async (result) => {
    if (!result.requiresSignIn) return;
    
    // Retry logic pour création de session
    let retries = 3;
    while (retries > 0) {
      const res = await signIn("credentials", {
        email: result.email,
        password: password,
        callbackUrl: "/dashboard",
        redirect: false,
      });
      
      if (res?.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      
      retries--;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1s
    }
    
    // Si échec après retries, rediriger vers login avec message
    router.push("/login?message=account_created_please_signin");
  },
});
```

#### Impact de la Refactorisation

| Aspect | Impact |
|--------|--------|
| **Complexité** | ⚠️ HAUTE - Nécessite comprendre internals NextAuth |
| **Sécurité** | ✅ AMÉLIORÉE - Session créée serveur-side |
| **UX** | ✅ AMÉLIORÉE - Pas de dépendance client |
| **Maintenance** | ⚠️ MODÉRÉE - Code plus complexe |
| **Tests** | ⚠️ MODÉRÉE - Tests d'intégration nécessaires |

#### Plan d'Implémentation (Option Recommandée)

1. **Analyser internals NextAuth** pour création session serveur-side
2. **Créer helper `createSession()`** qui utilise NextAuth internals
3. **Modifier `acceptInvitation`** pour créer session après création user
4. **Retourner sessionToken** ou cookie directement
5. **Modifier client** pour utiliser session créée
6. **Tests d'intégration** pour vérifier création session

**Estimation** : 6-8 heures de développement + tests

---

## 📊 Comparaison des Options

### H-2 : Hash des Tokens

| Option | Sécurité | Performance | Complexité | Recommandation |
|--------|----------|-------------|------------|----------------|
| **SHA-256** | ✅ Bonne | ✅ Excellente | ✅ Faible | ⭐ **Recommandé** |
| **bcrypt** | ✅ Excellente | ⚠️ Lente | ⚠️ Complexe | ❌ Non recommandé |
| **Status Quo** | ❌ Faible | ✅ Excellente | ✅ Aucune | ⚠️ Acceptable pour MVP |

### H-4 : Session Serveur-Side

| Option | Robustesse | Complexité | Maintenance | Recommandation |
|--------|------------|------------|-------------|----------------|
| **Améliorer gestion erreur** | ⚠️ Modérée | ✅ Faible | ✅ Facile | ⭐ **Recommandé pour MVP** |
| **API Route dédiée** | ✅ Excellente | ⚠️ Modérée | ⚠️ Modérée | ⭐ **Recommandé pour production** |
| **NextAuth internals** | ✅ Excellente | ❌ Haute | ❌ Difficile | ⚠️ Si nécessaire |

---

## 🎯 Recommandations Finales

### Priorité Immédiate (MVP)

1. **H-2** : ⚠️ **Reporté** - Acceptable pour MVP, implémenter en production
2. **H-4** : ✅ **Améliorer gestion erreur** - Ajouter retry logic et meilleurs messages

### Priorité Production

1. **H-2** : ✅ **Implémenter SHA-256 hash** - Migration nécessaire
2. **H-4** : ✅ **Créer API route dédiée** - Meilleure robustesse

### Estimation Totale

- **H-2 (SHA-256)** : 4-6 heures
- **H-4 (Amélioration)** : 2-3 heures
- **H-4 (API Route)** : 6-8 heures
- **Total** : 12-17 heures de développement

---

**Conclusion** : Ces refactorisations améliorent la sécurité et la robustesse, mais ne sont pas critiques pour le MVP. Recommandation : implémenter après validation du produit avec les utilisateurs.
