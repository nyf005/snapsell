# Corrections des six chantiers — 16 septembre 2026

Résultat : **fixed** pour les cinq défauts confirmés dans la contre-vérification. Après les vérifications locales, livraison autorisée le 16 septembre 2026 : les deux migrations ont été appliquées à Neon et `prisma migrate status` confirme les 61 migrations à jour. Les variables Resend sont absentes en production Vercel ; le relais assistance utilise `nyf.dev@gmail.com`.

## Invariants rétablis

1. **Propriété des objets R2.** Les mutations catalogue refusent `mediaStorageKey` fourni par le client. La suppression reçoit le tenant et la fiche, vérifie une clé appartenant exactement à cette fiche et refuse les clés étrangères, héritées ou mal formées. Les uploads serveur créent des clés uniques pour éviter qu’une suppression retardée efface un nouvel upload.
2. **Photos partagées et historique.** Avant de supprimer R2, le service contrôle les références catalogue, live, preuves et réservations de la fiche. Un verrou consultatif PostgreSQL coordonne la suppression avec les copies catalogue/live. Les écritures de ces références utilisent la transaction qui porte le verrou : elles ne peuvent pas se poursuivre après son expiration ou son annulation. La suppression en stockage reste best-effort et bornée ; une panne ne bloque pas le retrait de la fiche/photo. Les médias hérités sont conservés. Ce travail n’est pas une purge des anciens orphelins.
3. **Réinitialisation concurrente.** Émission et consommation verrouillent la même ligne utilisateur. Le jeton est réclamé atomiquement avec contrôle d’expiration après bcrypt ; une consommation réussie invalide les autres jetons actifs. Les émissions simultanées ne laissent qu’un lien valable.
4. **Réponse publique indépendante du compte.** La requête met toute adresse acceptée dans `password-reset-email` sans consulter le compte ni appeler Resend. Le worker recherche le compte et envoie, avec cinq reprises. Les pannes de file produisent la même erreur pour toute adresse. Les pannes du fournisseur n’affectent pas la réponse publique. Chaque demande porte une identité et une date ; les reprises retrouvent le même jeton par HMAC avec `ENCRYPTION_KEY`, sans stockage du jeton en clair dans la file ou en base. `requested_at` empêche un ancien job de remplacer un lien plus récent. Les demandes consommées ou dépassées ne sont pas réémises.
5. **Révocation immédiate.** Chaque callback de session compare `tokenVersion` à la base, sans délai d’une heure. Une session sans version est refusée. La version utilisée lors de la vérification du mot de passe est conservée au login, pour empêcher une connexion avec l’ancien mot de passe de récupérer la nouvelle version lors d’un reset concurrent.

La restriction OPS reste active ; les jetons support restent aléatoires, hachés et à usage unique. Le flux normal de connexion, l’upload de photo, le partage vers les lives et le traitement des commandes sont conservés.

## Principaux fichiers

- `src/server/account/password-reset.ts`, `password-reset-delivery.ts` et leurs tests : sérialisation, reprises et file durable.
- `src/server/auth.ts`, `src/server/auth-revocation.test.ts`, `src/server/api/routers/auth.ts` : révocation et frontière HTTP.
- `src/server/media/r2-client.ts`, ses tests unitaires et PostgreSQL, route photo, schémas catalogue : propriétaire et références.
- `src/server/api/routers/live.ts`, `src/server/live-item/createLiveItem.ts`, `src/server/catalogue/promoteSessionToCatalogue.ts` : copies atomiques sous verrou.
- `src/server/workers/queues.ts`, `scripts/start-worker.ts` : création et consommation de la file email.
- `e2e/dashboard.spec.ts` : récupération complète, nouvelle connexion, rejet immédiat de l’ancienne session et refus du lien déjà utilisé.
- `prisma/migrations/20260916140000_password_reset_request_order/migration.sql` : date de demande permettant d’ordonner les reprises. S’ajoute à la migration des jetons encore locale.
- `DEPLOYMENT.md`, `.env.example` : ordre de déploiement et configuration des deux services.

## Validation, dans l’ordre

### Syntaxe et types

`npm run typecheck`, `npm run lint`, `git diff --check` : réussis.

### Déclencheurs de sécurité et comportements légitimes

- Tests PostgreSQL : trois émissions simultanées ne laissent qu’un jeton actif et une seule réinitialisation réussit ; deux consommations du même jeton ne réussissent qu’une fois.
- Une reprise conserve son jeton ; une reprise ancienne ne remplace pas une demande plus récente ; une demande consommée n’est pas réémise.
- R2 : clés étrangères et variantes de clés refusées ; aucun appel au stockage. Objet référencé par un live conservé. Objet propre et sans référence supprimé via stockage simulé.
- Copie concurrente et suppression coordonnées sur PostgreSQL réel. L’annulation de la transaction annule aussi la création via le helper de production `createLiveItem`.
- Sessions : version révoquée, version absente et login concurrent avec ancien mot de passe refusés ; version actuelle acceptée.
- File pg-boss réelle : demande persistée puis consommée par le worker enregistré, email simulé ; aucun secret de réinitialisation dans les données du job.

Une revue indépendante a identifié le risque d’écriture hors transaction et celui de reprise d’un ancien email ; les deux ont été corrigés, puis vérifiés par les régressions ci-dessus.

### Suites et parcours

- `RUN_INTEGRATION_TESTS=true npx vitest run --maxWorkers=1` sur base temporaire : **1 428 tests, 125 fichiers, tous réussis**.
- Nouveau test de file réelle, exécuté séparément après ajout : **1 test réussi** (`password-reset-queue.integration.test.ts`). Soit **1 429 tests distincts vérifiés**.
- `npm run test:ui` : **289 tests réussis**.
- `npm run build:test` : réussi.
- Playwright : **36 scénarios existants réussis**. Les deux nouveaux scénarios récupération/révocation ont d’abord rencontré un sélecteur ambigu (alerte formulaire et annonceur Next.js). Après correction du sélecteur uniquement, leur relance réussit sur ordinateur et mobile : **38 scénarios validés au total**.
- Les migrations ont été appliquées uniquement aux deux bases locales dédiées ; aucun service externe réel sollicité.

Logs : `/tmp/fix-final-full.log`, `/tmp/fix-queue.log`, `/tmp/fix-final-ui.log`, `/tmp/fix-final-build.log`, `/tmp/fix-final-e2e.log`, `/tmp/fix-reset-e2e.log`, `/tmp/fix-security-integration.log`.

## Avant activation en production

Appliquer les deux migrations locales des jetons et de l’ordre des demandes, déployer le code et démarrer le worker, puis configurer Resend et l’URL publique sur les deux services suivant `DEPLOYMENT.md`. Vérifier un envoi réel sur un compte de contrôle. Les migrations ont ensuite été appliquées lors de la livraison autorisée. Resend reste volontairement désactivé ; son activation et la vérification d’un envoi réel sont différées.

Pour Meta, le commentaire a été corrigé : l’exemple officiel utilise des centièmes, mais aucune confirmation spécifique XOF en sandbox n’a été obtenue. Aucun changement d’unité ni appel authentifié à Meta effectué.
