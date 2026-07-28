# Code Review: Story 1-7 - Inviter un agent (manager)

**Date** : 2026-02-05  
**Reviewer** : Adversarial Code Review (AI)  
**Story** : 1-7-inviter-un-agent-manager.md  
**Statut Story** : done → **in-progress** (issues critiques identifiées)

---

## 🔍 Résumé Exécutif

**Git vs Story Discrepancies** : ✅ Cohérent (tous les fichiers listés existent)  
**Issues Trouvées** : 3 CRITIQUE, 5 HAUTE, 4 MOYENNE, 3 BASSE  
**AC Status** : ⚠️ PARTIELLEMENT IMPLEMENTÉ (AC #1 couvert mais avec problèmes)  
**Tasks Status** : ⚠️ Toutes les tâches marquées [x] mais problèmes de qualité identifiés

---

## 📋 Validation des Claims vs Réalité

### ✅ Acceptance Criteria #1 : IMPLEMENTÉ (avec réserves)

**Requirement** : Manager/Owner peut inviter un agent par email/lien, l'agent peut s'inscrire/se connecter et accéder au dashboard limité.

**Preuve d'implémentation** :
- ✅ Modèle `Invitation` dans `prisma/schema.prisma` (lignes 38-52)
- ✅ Router `invitations` avec `createInvitation` protégé par `canManageGrid` (`src/server/api/routers/invitations.ts:42-96`)
- ✅ Page `/invite/accept` avec flux inscription/connexion (`src/app/(auth)/invite/accept/page.tsx`)
- ✅ RBAC : page team protégée par `canManageGrid` (`src/app/(dashboard)/parametres/team/page.tsx:20-22`)
- ✅ Lien d'acceptation retourné après création (`invitations.ts:94`)

**⚠️ Problèmes identifiés** : Voir sections CRITIQUE et HAUTE ci-dessous.

### ✅ Tasks 1-4 : IMPLEMENTÉES (avec problèmes)

**Task 1** : ✅ Modèle Invitation + migration
- Modèle présent dans schema.prisma
- Migration appliquée (`prisma/migrations/20260206100000_add_invitations/`)
- ⚠️ **PROBLÈME** : Pas de contrainte unique sur (tenantId, email) au niveau DB

**Task 2** : ✅ API tRPC
- Router `invitations` créé avec toutes les procédures requises
- Schémas Zod dans `invitations.schema.ts`
- ⚠️ **PROBLÈME** : Schéma `acceptInvitationInputSchema` permet `name` et `password` optionnels mais le code les exige

**Task 3** : ✅ Envoi de l'invitation
- Lien d'acceptation retourné dans `createInvitation`
- Affichage du lien dans modal après création
- ⚠️ **PROBLÈME** : Pas de rate limiting, risque d'abus

**Task 4** : ✅ Acceptation d'invitation
- Page `/invite/accept` créée avec flux complet
- Gestion nouveaux utilisateurs et utilisateurs existants
- ⚠️ **PROBLÈME** : Logique pour utilisateur existant dans même tenant incorrecte, pas de création de session serveur

---

## 🔴 CRITIQUE - Issues à Corriger Immédiatement

### CR-1 : Aucun Test - Story Marque Tasks [x] Mais Pas de Tests

**Sévérité** : CRITIQUE  
**Fichiers** : Tous les routers et pages de la story

**Problème** :
- Aucun test unitaire ou d'intégration trouvé pour `invitations.ts`
- Aucun test pour `team.ts`
- Aucun test pour la page `/invite/accept`
- Story marque toutes les tâches [x] mais aucune validation automatique

**Preuve** :
```bash
$ find . -name "*invitation*.test.*" -o -name "*invitation*.spec.*"
# Résultat : 0 fichiers
```

**Impact** : Risque élevé de régression, pas de validation que le code fonctionne réellement.

**Recommandation** : Créer des tests pour :
- `createInvitation` : RBAC, validation email, génération token, unicité
- `acceptInvitation` : création compte, gestion utilisateur existant, invalidation invitation
- `getInvitationByToken` : validation token, expiration
- Page `/invite/accept` : flux complet utilisateur

**Référence** : `src/server/api/routers/invitations.ts`, `src/app/(auth)/invite/accept/page.tsx`

---

### CR-2 : Schéma Zod Incohérent - acceptInvitationInputSchema

**Sévérité** : CRITIQUE  
**Fichier** : `src/server/api/routers/invitations.schema.ts:11-15`

**Problème** :
```typescript
export const acceptInvitationInputSchema = z.object({
  token: z.string().min(1, "Token requis"),
  name: z.string().min(1, "Le nom est requis").optional(),  // ⚠️ OPTIONAL mais requis dans le code
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères").optional(),  // ⚠️ OPTIONAL mais requis
});
```

Mais dans `invitations.ts:171-176` :
```typescript
if (!input.name?.trim() || !input.password) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Nom et mot de passe requis pour créer le compte.",
  });
}
```

**Impact** : 
- Validation Zod accepte `undefined` pour `name` et `password`
- Code métier rejette ensuite → validation incohérente
- TypeScript ne peut pas garantir la présence de ces champs

**Recommandation** : 
```typescript
export const acceptInvitationInputSchema = z.object({
  token: z.string().min(1, "Token requis"),
  name: z.string().min(1, "Le nom est requis"),  // Retirer .optional()
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),  // Retirer .optional()
});
```

**Référence** : `src/server/api/routers/invitations.schema.ts:11-15`, `src/server/api/routers/invitations.ts:171-176`

---

### CR-3 : Contrainte Unique Manquante - Invitations Dupliquées Possible

**Sévérité** : CRITIQUE  
**Fichier** : `prisma/schema.prisma:38-52`

**Problème** :
- Modèle `Invitation` n'a pas de contrainte unique sur `(tenantId, email, consumedAt IS NULL)`
- Transaction dans `createInvitation` vérifie l'unicité mais pas au niveau DB
- Race condition possible si deux requêtes simultanées créent une invitation pour le même email

**Code actuel** :
```prisma
model Invitation {
  id         String    @id @default(cuid())
  tenantId   String    @map("tenant_id")
  email      String
  // ... pas de @@unique([tenantId, email])
}
```

**Impact** : 
- Possibilité d'avoir plusieurs invitations en attente pour le même email/tenant
- Violation de la contrainte métier mentionnée dans la story

**Recommandation** : Ajouter une contrainte unique partielle (PostgreSQL) ou un index unique avec filtre :
```prisma
model Invitation {
  // ...
  @@unique([tenantId, email], where: { consumedAt: null })
  // OU utiliser un index unique avec condition dans migration SQL
}
```

**Référence** : `prisma/schema.prisma:38-52`, `src/server/api/routers/invitations.ts:60-73`

---

## 🟡 HAUTE - Issues Importantes à Corriger

### H-1 : Logique Incorrecte - Utilisateur Existant dans Même Tenant

**Sévérité** : HAUTE  
**Fichier** : `src/server/api/routers/invitations.ts:149-162`

**Problème** :
```typescript
if (existingUser) {
  if (existingUser.tenantId === inv!.tenantId) {
    // Utilisateur déjà membre du tenant → consommer l'invitation seulement
    await db.invitation.update({
      where: { id: inv!.id },
      data: { consumedAt: new Date() },
    });
    return { 
      created: false, 
      alreadyMember: true, 
      userId: existingUser.id,
      message: "Vous êtes déjà membre de cette équipe. Connectez-vous pour accéder au dashboard.",
    };
  }
  // ...
}
```

**Impact** :
- Si un utilisateur est déjà membre du tenant, pourquoi accepter une invitation ?
- L'invitation est consommée mais rien ne change pour l'utilisateur
- Logique métier confuse : devrait soit refuser l'invitation, soit mettre à jour le rôle

**Recommandation** : 
- Option 1 : Refuser l'invitation avec message clair "Vous êtes déjà membre de cette équipe"
- Option 2 : Si l'invitation a un rôle différent, mettre à jour le rôle de l'utilisateur

**Référence** : `src/server/api/routers/invitations.ts:149-162`

---

### H-2 : Token Stocké en Clair - Risque Sécurité

**Sévérité** : HAUTE  
**Fichier** : `src/server/api/routers/invitations.ts:75`, `prisma/schema.prisma:44`

**Problème** :
- Token généré avec `crypto.randomBytes(32).toString("hex")` et stocké en clair dans la DB
- Si la DB est compromise, tous les tokens sont exposés
- Pas de hash du token comme pour les mots de passe

**Code actuel** :
```typescript
const token = crypto.randomBytes(32).toString("hex");
// Stocké directement dans la DB sans hash
```

**Impact** : 
- Si accès non autorisé à la DB, tous les tokens d'invitation sont compromis
- Tokens peuvent être réutilisés même après expiration si non invalidés

**Recommandation** : 
- Stocker un hash du token (comme pour les mots de passe)
- Utiliser `bcrypt` ou `crypto.createHash` pour hasher le token avant stockage
- Comparer le hash lors de la validation

**Référence** : `src/server/api/routers/invitations.ts:75`, `prisma/schema.prisma:44`

---

### H-3 : Pas de Rate Limiting - Risque d'Abus

**Sévérité** : HAUTE  
**Fichier** : `src/server/api/routers/invitations.ts:42-96`

**Problème** :
- `createInvitation` n'a pas de rate limiting
- Un utilisateur malveillant peut créer des milliers d'invitations rapidement
- Spam d'emails possible si service email implémenté plus tard

**Impact** :
- Abus de l'API possible
- Coût potentiel si service email payant
- Performance dégradée

**Recommandation** : 
- Ajouter rate limiting (ex: max 10 invitations par heure par tenant)
- Utiliser un middleware de rate limiting ou Redis
- Limiter aussi par email (max 3 tentatives par email par jour)

**Référence** : `src/server/api/routers/invitations.ts:42-96`

---

### H-4 : Session Non Créée Serveur-Side - Dépendance Client

**Sévérité** : HAUTE  
**Fichier** : `src/app/(auth)/invite/accept/page.tsx:52-69`

**Problème** :
- `acceptInvitation` crée le compte mais ne crée pas de session serveur-side
- Le client doit appeler `signIn` manuellement après acceptation
- Si `signIn` échoue, l'utilisateur a un compte mais n'est pas connecté

**Code actuel** :
```typescript
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

**Impact** :
- Expérience utilisateur dégradée si connexion échoue
- Utilisateur peut avoir un compte mais ne pas pouvoir se connecter
- Pas de garantie que la session soit créée

**Recommandation** : 
- Créer la session serveur-side dans `acceptInvitation` après création du compte
- Retourner un token de session ou utiliser NextAuth pour créer la session directement
- Ne pas dépendre du client pour créer la session

**Référence** : `src/app/(auth)/invite/accept/page.tsx:52-69`, `src/server/api/routers/invitations.ts:137-202`

---

### H-5 : Gestion d'Erreur Incomplète - Cas Utilisateur Existant

**Sévérité** : HAUTE  
**Fichier** : `src/app/(auth)/invite/accept/page.tsx:35-43`

**Problème** :
- Quand `acceptInvitation` retourne `alreadyMember: true`, le client redirige vers `/login`
- Mais l'utilisateur n'a pas de moyen de savoir pourquoi il est redirigé
- Message d'erreur affiché mais redirection après 2 secondes peut être ignorée

**Code actuel** :
```typescript
if (result.alreadyMember) {
  setError(result.message ?? "Vous êtes déjà membre...");
  setTimeout(() => {
    router.push("/login?callbackUrl=/dashboard&fromInvite=1&message=already_member");
  }, 2000);
  return;
}
```

**Impact** :
- Expérience utilisateur confuse
- Pas de feedback clair sur ce qui s'est passé
- L'utilisateur peut ne pas comprendre pourquoi il doit se connecter

**Recommandation** : 
- Afficher un message clair avec bouton "Se connecter maintenant"
- Passer un paramètre dans l'URL pour afficher un message sur la page de login
- Améliorer le message d'erreur pour être plus explicite

**Référence** : `src/app/(auth)/invite/accept/page.tsx:35-43`

---

## 🟠 MOYENNE - Issues à Améliorer

### M-1 : Bouton "Renvoyer l'invitation" Sans Handler

**Sévérité** : MOYENNE  
**Fichier** : `src/app/(dashboard)/parametres/_components/team-content.tsx:397-403`

**Problème** :
```typescript
<Button
  variant="link"
  size="xs"
  className="h-auto p-0 font-bold text-primary hover:underline"
>
  Renvoyer l'invitation
</Button>
```
- Pas de `onClick` handler
- Bouton non fonctionnel

**Impact** : Fonctionnalité annoncée mais non implémentée.

**Recommandation** : 
- Implémenter le handler pour renvoyer l'invitation (créer nouvelle invitation ou réutiliser token existant)
- Ou désactiver le bouton avec `disabled` et `title="À implémenter"`

**Référence** : `src/app/(dashboard)/parametres/_components/team-content.tsx:397-403`

---

### M-2 : Actions "Modifier le rôle" / "Retirer du tenant" Sans Handler

**Sévérité** : MOYENNE  
**Fichier** : `src/app/(dashboard)/parametres/_components/team-content.tsx:417-432`

**Problème** :
```typescript
<DropdownMenuItem
  onSelect={() => {
    /* TODO: appeler API modifier rôle quand le router sera en place */
  }}
>
  Modifier le rôle
</DropdownMenuItem>
```
- Actions non implémentées
- TODO dans le code

**Impact** : Fonctionnalités annoncées mais non disponibles.

**Recommandation** : 
- Soit implémenter les handlers (créer routers tRPC pour modifier rôle et retirer membre)
- Soit désactiver ces options avec message "À venir"

**Référence** : `src/app/(dashboard)/parametres/_components/team-content.tsx:417-432`

---

### M-3 : Magic Number - Durée d'Expiration

**Sévérité** : MOYENNE  
**Fichier** : `src/server/api/routers/invitations.ts:14`

**Problème** :
```typescript
const INVITATION_EXPIRY_DAYS = 7;
```
- Valeur hardcodée
- Pas de configuration via variables d'environnement

**Impact** : Difficile de changer la durée d'expiration sans modifier le code.

**Recommandation** : 
- Utiliser variable d'environnement : `process.env.INVITATION_EXPIRY_DAYS ?? 7`
- Documenter la valeur par défaut

**Référence** : `src/server/api/routers/invitations.ts:14`

---

### M-4 : Pas de Logging/Audit Trail

**Sévérité** : MOYENNE  
**Fichiers** : `src/server/api/routers/invitations.ts`

**Problème** :
- Aucun logging des actions critiques :
  - Création d'invitation
  - Acceptation d'invitation
  - Échecs de validation

**Impact** : 
- Difficile de déboguer les problèmes
- Pas de traçabilité des actions
- Impossible de détecter les abus

**Recommandation** : 
- Ajouter des logs pour création/acceptation d'invitations
- Logger les erreurs avec contexte (tenantId, email, token)
- Utiliser un système de logging structuré

**Référence** : `src/server/api/routers/invitations.ts`

---

## 🟢 BASSE - Améliorations Suggérées

### L-1 : Accessibilité - Attributs ARIA Manquants

**Sévérité** : BASSE  
**Fichier** : `src/app/(dashboard)/parametres/_components/team-content.tsx:318-440`

**Problème** :
- Pas d'attributs `aria-label` sur certaines actions
- Pas de `scope` sur les `TableHead`
- Boutons d'action sans labels explicites

**Impact** : Accessibilité réduite pour lecteurs d'écran.

**Recommandation** : Ajouter attributs ARIA appropriés.

**Référence** : `src/app/(dashboard)/parametres/_components/team-content.tsx:318-440`

---

### L-2 : Code Dupliqué - Validation Email

**Sévérité** : BASSE  
**Fichiers** : `src/app/(dashboard)/parametres/_components/team-content.tsx:38-45`

**Problème** :
- Validation email côté client avec Zod mais code dupliqué
- Pourrait être extrait dans un utilitaire partagé

**Impact** : Maintenance plus difficile si validation change.

**Recommandation** : Extraire validation dans utilitaire partagé.

**Référence** : `src/app/(dashboard)/parametres/_components/team-content.tsx:38-45`

---

### L-3 : Pagination Non Fonctionnelle

**Sévérité** : BASSE  
**Fichier** : `src/app/(dashboard)/parametres/_components/team-content.tsx:445-452`

**Problème** :
- Boutons de pagination désactivés avec `disabled`
- Message "sera activée avec les données serveur" mais données déjà disponibles

**Impact** : Fonctionnalité annoncée mais non implémentée.

**Recommandation** : 
- Soit implémenter la pagination (si beaucoup de membres)
- Soit retirer les boutons si pagination non nécessaire

**Référence** : `src/app/(dashboard)/parametres/_components/team-content.tsx:445-452`

---

## 📊 Tableau Récapitulatif

| Sévérité | Count | Issues |
|----------|-------|--------|
| 🔴 CRITIQUE | 3 | Pas de tests, Schéma Zod incohérent, Contrainte unique manquante |
| 🟡 HAUTE | 5 | Logique utilisateur existant incorrecte, Token non hashé, Pas de rate limiting, Session non créée serveur-side, Gestion erreur incomplète |
| 🟠 MOYENNE | 4 | Boutons sans handlers, Magic number, Pas de logging |
| 🟢 BASSE | 3 | Accessibilité, Code dupliqué, Pagination |

---

## ✅ Points Positifs

1. **Architecture propre** : Séparation claire entre routers, schémas, et composants UI
2. **Sécurité RBAC** : Protection correcte avec `canManageGrid` sur toutes les routes sensibles
3. **UX cohérente** : Interface utilisateur alignée avec le reste de l'application
4. **Validation Zod** : Schémas bien structurés (malgré problème CR-2)
5. **Gestion d'état** : Utilisation correcte de React Query pour les données
6. **Transactions** : Utilisation de transactions Prisma pour éviter race conditions (malgré problème CR-3)

---

## 🎯 Recommandations Prioritaires

1. **CRITIQUE** : Créer des tests pour tous les routers et la page d'acceptation
2. **CRITIQUE** : Corriger le schéma Zod `acceptInvitationInputSchema` (retirer `.optional()`)
3. **CRITIQUE** : Ajouter contrainte unique sur `(tenantId, email)` dans Prisma schema
4. **HAUTE** : Corriger la logique pour utilisateur existant dans même tenant
5. **HAUTE** : Hasher les tokens d'invitation avant stockage en DB
6. **HAUTE** : Ajouter rate limiting sur `createInvitation`
7. **HAUTE** : Créer session serveur-side dans `acceptInvitation`
8. **MOYENNE** : Implémenter ou désactiver les boutons non fonctionnels
9. **MOYENNE** : Ajouter logging pour actions critiques
10. **BASSE** : Améliorer accessibilité avec attributs ARIA

---

## 📝 Conclusion

L'implémentation de la story 1-7 est **fonctionnelle** mais présente **plusieurs problèmes critiques** qui doivent être corrigés avant de considérer la story comme complète :

- **Tests manquants** : Aucune validation automatique du code
- **Problèmes de sécurité** : Token non hashé, pas de rate limiting
- **Incohérences** : Schéma Zod vs code métier, logique utilisateur existant confuse
- **Fonctionnalités incomplètes** : Boutons sans handlers, pagination désactivée

**Recommandation finale** : **Statut → in-progress** jusqu'à résolution des issues CRITIQUE et HAUTE.

---

**Reviewer** : Adversarial Code Review (AI)  
**Date** : 2026-02-05
