# Plan de clôture de l’audit SnapSell

Date : 2026-09-28. Demande : examiner le code, planifier la suite et rendre la reprise possible après épuisement du quota.

## Point d’entrée de reprise

Lire `STATE.json`, puis ce document. Les tâches non terminées restent à faire, même après changement de conversation. Le fichier d’état est la source de vérité pour la prochaine action ; il ne dépend pas du contexte de discussion.

Le renouvellement du quota ne lance pas automatiquement une exécution. Dans cette tâche, demander « reprends l’audit ». Dans une nouvelle tâche : « Lis docs/security-audit/STATE.json et PLAN.md, puis reprends l’audit SnapSell à la prochaine étape non terminée. »

## Référence et travaux déjà réalisés

- Révision de référence : `ebadb8fe10c37e8a9ed75225d3e325f72257f70d`.
- Audit Codex Security initial : `72ea95b0-d4af-4919-887c-318545c0c012`, terminé avec couverture **partielle**. Ne pas le rouvrir ni modifier ses résultats scellés.
- Rapport initial : `/Users/fabricendri/.codex/state/plugins/codex-security/scans/SnapSell/ebadb8fe10c37e8a9ed75225d3e325f72257f70d_20260928T150158Z_a1xne47b/report.md`.
- Revue initiale : authentification/révocation, reset de mot de passe, principaux routers métier et isolation boutique/acheteur, médias privés/publics, signatures Meta/Paystack/QStash. Cela ne constitue pas une certification exhaustive de ces composants.
- Faille confirmée : acceptation publique d’une invitation permettant le rattachement forcé d’un compte OPS. Correction locale présente, non commitée et non déployée : `src/server/api/routers/invitations.ts`, son test, `src/app/(auth)/invite/accept/page.tsx` et son test UI.
- Vérifications de la correction : 52 tests serveur/schéma/révocation et 3 tests UI réussis ; `tsc --noEmit`, ESLint ciblé et `git diff --check` réussis. Le test OPS échouait avant correction et passe après. Pas de preuve d’intégration PostgreSQL réelle des courses concurrentes à ce stade.
- Des agents complémentaires avaient échoué pour manque de crédits. Leurs tâches ne sont pas considérées comme terminées.

## Examen préparatoire effectué pour ce plan

Ce relevé oriente les investigations ; ce n’est pas un nouveau rapport de vulnérabilités.

| Source examinée | Fait observé | Vérification restante |
| --- | --- | --- |
| `src/server/api/routers/settings.ts`, `setWhatsAppConfig` | Procédure manager + liste d’emails support ; unicité du numéro recherchée ; validation Meta conditionnée par la présence du numéro et du token | Autorité réelle de l’email non vérifié à l’inscription, branches avec valeurs nulles, accès aux tokens existants et impact entre boutiques |
| `src/server/api/routers/ops.ts`, `accounts.createPasswordResetLink` | Procédure OPS ; rejet des comptes sans tenant ; génération de lien et journalisation | Cohérence entre rôle et tenant, changement concurrent du compte cible, exposition du lien et permissions de chaque route OPS |
| `src/server/messaging/providers/meta/signup-attempt.ts` (lu intégralement) | Tentative liée au code/app, au tenant et aux paramètres ; jeton chiffré ; bail et validation dans la transaction finale | Appelants, expiration, rejeu, changements de configuration et tests de concurrence |
| `src/server/messaging/providers/meta/credentials.ts` (lu intégralement) | Vérification numéro/WABA avec le token fourni ; URL Graph fixe avec identifiants encodés | Tous les appelants, modes sans WABA, délais et redaction des erreurs |
| `src/server/messaging/providers/meta/embedded-signup.ts` (extraits) | Échange OAuth, contrôle is_valid/scopes, résolution WABA autorisé/numéro et abonnement de l’app | Lire intégralement les helpers, contrôler les hypothèses d’identité et les effets externes avant commit |
| `src/server/workers/outbox-recovery.ts` (lu intégralement) | Reprise limitée à 100 messages pending non publiés, bail expiré, arrêt au premier échec | Cohérence avec publication/envoi, duplications et état final |
| `src/server/api/routers/delivery.ts` (lu intégralement) | Chaque opération appelle le contrôle manager ; filtres tenant ; propriété de zone vérifiée avant transaction | Schémas, services, tests et transitions concurrentes ; ne pas conclure à une faille sur le seul usage de protectedProcedure |
| `src/server/api/routers/onboarding.ts` (lu intégralement) | Requêtes tenant ; token lu pour calculer un booléen, non retourné | Schéma de sortie et tests d’absence de fuite |
| `.github/workflows/ci.yml` (lu intégralement) | PostgreSQL local de test, lint/types/intégration/UI/E2E, permissions contents:read | Faisabilité locale de ces contrôles et couverture des scénarios de sécurité |

## Lots à exécuter dans l’ordre

### A — Autorisations support, OPS et configuration (priorité 1)

Sources : routers `settings`, `ops`, `ops-whatsapp`, `onboarding`, `delivery` et schémas/tests associés ; `src/lib/support-access.ts`, `rbac.ts`, authentification et reset comme dépendances.

Tracer chaque entrée jusqu’à l’écriture ou à la restitution sensible. Comparer utilisateur anonyme, AGENT, MANAGER/OWNER, OPS et deux boutiques. Déterminer si un email inscrit sans vérification peut conférer une autorité support utile à un attaquant ; établir l’impact avant de rapporter. Vérifier que les secrets ne sortent pas dans les réponses/erreurs/journaux.

Sortie : contrôles vérifiés, candidats étayés et questions non résolues, avec références exactes. Tests ciblés des refus et d’un parcours légitime. Ne pas convertir une observation en faille sans chemin attaquant démontré.

### B — Connexion Meta et synchronisation (priorité 1)

Sources : `embedded-signup.ts`, `signup-attempt.ts`, `credentials.ts`, `adapter.ts`, `coexistence-handlers.ts`, `coexistence-sync-request.ts`, worker `coexistence-sync.ts`, routes Meta/settings/OPS comme appelants.

Vérifier appartenance app/WABA/numéro, rattachement unique au tenant, rejeu OAuth, expiration des baux, token chiffré, sélection des messages entrants et authenticité de l’expéditeur. Inspecter les effets externes et les écritures lors d’un échec partiel. Tester avec réponses Meta simulées ; ne pas modifier un compte Meta réel.

### C — Workers, messages sortants et tâches planifiées (priorité 1)

Sources : `queues.ts`, `outbox-sender.ts`, `outbox-recovery.ts`, `health.ts`, publication/outbox/politique d’envoi/opt-out ; workers crédits, abonnements, expiration, clôture et synchronisation catalogue ; routes QStash/cron.

Vérifier autorité du job, identité tenant/destinataire, claims atomiques, rejeu, concurrence, opt-out, limites et effet d’une panne. Séparer un problème de fiabilité d’une vulnérabilité exploitable. Contrôler les modes production et développement depuis la configuration effectivement consommée.

### D — Facturation, quotas et concurrence (priorité 2)

Sources : `subscription.ts`, `payment/paystack.ts`, webhook Paystack, routes payment, `credits/service.ts`, `subscription/usage.ts`, workers de renouvellement et schéma Prisma.

Tracer montants/devises/plans/crédits depuis l’entrée jusqu’au solde ; vérifier l’origine des métadonnées, idempotence et permissions. Tester deux traitements concurrents sur une base locale dédiée. Inclure les courses du correctif invitations : invitation consommée/expirée et compte promu OPS ou réaffecté avant écriture. Un mock seul ne démontre pas le rollback de PostgreSQL.

### E — Dépendances, secrets et déploiement décrit (priorité 2)

Sources : `package-lock.json`, `package.json`, `next.config.js`, `src/env.js`, `DEPLOYMENT.md`, scripts runtime/worker/chiffrement, CI et configuration de déploiement présente dans le dépôt.

Identifier les versions verrouillées, consulter les avis officiels actuels et confirmer l’applicabilité des CVE (prod/dev, configuration, chemin utilisé). Un `npm audit` éventuel contacte le registre : ne pas le présenter comme un contrôle offline. Aucun `npm audit fix` automatique. Vérifier exposition des secrets, logs, anciens tokens en clair, CSP/cookies et confiance aux en-têtes proxy. Ne jamais recopier les valeurs de `.env` dans les notes.

### F — Configuration déployée et validation pratique (conditionnel aux accès)

Lecture seule des paramètres accessibles : révision déployée, NODE_ENV, signatures, protections de débit, droits DB/R2, confidentialité des preuves, destinations des logs et secrets configurés (présence/état seulement).

Préparer un environnement de test isolé avec deux boutiques et les différents rôles. Tester accès croisés, révocation, invitations, médias, signatures invalides, rejeux et facturation simulée. Pas de test de charge, de paiement réel ou de mutation de production implicite. Si un accès manque, documenter précisément lequel ; terminer les lots indépendants.

### G — Réconciliation et rapport final

Comparer l’inventaire du dépôt aux fichiers effectivement examinés, identifier les sources restantes et les exclusions justifiées, revoir les fichiers modifiés depuis leur inspection. Publier les failles validées et contrôles vérifiés avec preuves, sévérité, prérequis et remédiation. Utiliser le workflow Codex Security pour un nouvel audit formel ; conserver le lien avec le rapport initial sans le réécrire.

L’audit ne peut être dit clôturé que si chaque lot a une disposition explicite, les candidats sont validés/rejetés ou marqués non résolus, les corrections ont leurs vérifications pertinentes, et les limites de production sont clairement distinguées des résultats sur le code.

## Protocole de sauvegarde et reprise

1. Avant chaque lot, enregistrer dans `STATE.json` son statut `in_progress`, la prochaine action concrète, la révision et les fichiers locaux à préserver.
2. Après chaque groupe cohérent de fichiers ou résultat de test, sauvegarder immédiatement les faits, les limites et l’étape suivante. Ne pas attendre un avertissement de quota : une interruption peut être immédiate.
3. Utiliser des lots courts et une seule investigation active par défaut. Ne déléguer que si le workflow appliqué l’exige ; ne pas compter un agent lancé comme travail terminé. Sauvegarder ses résultats avant synthèse.
4. Pour un audit formel, les checkpoints/preuves passent par les outils de stockage du plugin. Ce plan conserve les liens et l’avancement, sans remplacer le rapport canonique.
5. À la reprise, vérifier `git status`, HEAD et les empreintes de `STATE.json`. Si un fichier a changé, réexaminer le contrôle concerné ; ne pas jeter les modifications locales ni relancer tout l’audit inutilement.
6. Ne jamais inscrire un test non exécuté comme réussi. Les journaux temporaires de la session précédente peuvent disparaître : les commandes et résultats essentiels doivent être persistés.
7. Aucun commit, déploiement ou modification de production n’est nécessaire pour créer ce plan. La demande actuelle porte sur la préparation ; prochaine exécution : lot A.

## Commandes de référence

```sh
git status --short
git rev-parse HEAD
npx vitest run src/server/api/routers/invitations.test.ts src/server/api/routers/invitations.schema.test.ts src/server/auth-revocation.test.ts
npx vitest run --config vitest.config.ui.ts 'src/app/(auth)/invite/accept/page.ui.test.tsx'
npm run typecheck
git diff --check
```

Pour les intégrations : uniquement une base locale dont le nom finit par `_test`, conformément à `vitest.setup.env.ts`. Les commandes CI sont des références à adapter à cette base, pas une autorisation de lancer les migrations sur la base de développement/production.
