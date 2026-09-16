# Contre-vérification des six chantiers — 16 septembre 2026

> Mise à jour : les cinq constats ci-dessous ont depuis été corrigés et vérifiés. Voir [le rapport de correction](2026-09-16-corrections-six-chantiers.md). Le texte suivant conserve les observations avant correction.

## Verdict

Les six chantiers sont présents dans les modifications locales au-dessus de `bab1d1b`. Je ne valide pas leur livraison en l’état : deux défauts de suppression R2 et trois écarts dans le flux de récupération restent à traiter. Aucune correction applicative, migration Neon, publication, commit ou push effectué pendant cette revue.

## Vérifications exécutées

- TypeScript et lint : réussis.
- Unitaires : 1 289 réussis, 125 intégrations ignorées dans ce mode.
- Suite avec PostgreSQL : 1 414 réussis, 121 fichiers. Ce total inclut les unitaires ; il ne représente pas 1 414 tests d’intégration supplémentaires.
- UI : 289 réussis, 31 fichiers.
- Build de test et Playwright : réussis, 36 scénarios ordinateur/mobile.
- Migration des jetons : appliquée seulement aux deux bases locales temporaires dédiées.
- Génération Prisma sans client préexistant, dans `/tmp/snapsell-codegen-audit`, sans `DATABASE_URL` : réussie.
- Deux contre-tests supplémentaires échouent et démontrent des cas non couverts par les suites existantes : émission concurrente de liens et suppression R2 avec clé étrangère. Les contre-tests ont été retirés de la découverte des suites et conservés dans `/tmp`.

## Constats à corriger

### 1. P1 — Une clé de stockage fournie par une boutique peut faire supprimer un objet d’une autre boutique

`src/server/api/routers/catalogue.schema.ts:11,21` accepte une chaîne arbitraire pour `mediaStorageKey`. Le routeur catalogue la persiste sans vérification d’appartenance (`catalogue.ts:110,169`). Le nouveau `DELETE /api/catalogue/[itemId]/photo` vérifie le propriétaire de la fiche, mais transmet sa clé à `deleteR2ObjectBestEffort` (`route.ts:204`), qui exécute `DeleteObjectCommand` sans contrôle du tenant (`r2-client.ts:42–46`). La suppression de fiche présente la même faiblesse.

Un utilisateur autorisé à modifier son catalogue et connaissant une clé étrangère peut l’attacher à sa propre fiche puis demander la suppression. Le droit sur la fiche ne prouve pas le droit sur l’objet. Le contre-test valide l’acceptation de la clé par le schéma et constate son passage au destructeur simulé ; aucun appel R2 réel n’est effectué.

Correction attendue : clés attribuées/validées côté serveur, appartenance du média vérifiée avant détachement et suppression, défense dans le service de suppression. Ne pas se contenter de vérifier le tenant de la fiche.

### 2. P1 — Les objets partagés sont supprimés sans vérifier leurs autres références

`catalogue.ts:231–234` assimile l’absence de réservations sur une fiche à l’absence de toute référence au média. Ce n’est pas vrai : `promoteSessionToCatalogue.ts:174–183` copie la clé du LiveItem dans le CatalogueItem sans enlever la référence source. Retirer la photo ou supprimer cette fiche catalogue peut donc supprimer la photo encore utilisée par le live et son historique. La route de retrait de photo n’examine pas non plus l’historique de la fiche.

Correction attendue : vérifier les références catalogue, live et pièces historiques avant suppression, avec une stratégie qui évite les courses entre ajout de référence et suppression. Le mode best-effort traite les erreurs du fournisseur, pas la sûreté de la décision de supprimer.

### 3. P2 — Plusieurs liens restent utilisables après des demandes simultanées

`password-reset.ts:31–39` invalide puis crée dans une transaction, sans sérialisation par utilisateur. Des transactions simultanées peuvent chacune créer un jeton après leur invalidation des anciennes lignes. Un contre-test PostgreSQL avec trois émissions simultanées a observé **deux jetons actifs puis deux réinitialisations successives réussies**. Le changement de mot de passe ne neutralise pas les autres jetons actifs.

Le test existant sur deux consommations du même jeton passe : c’est un autre scénario. Correction attendue : sérialiser les émissions par utilisateur et neutraliser les autres liens lors d’une réinitialisation réussie dans une transaction coordonnée. Vérifier aussi l’expiration au moment de la consommation atomique ; elle n’est actuellement vérifiée qu’avant bcrypt.

### 4. P2 — La réponse révèle l’existence d’un compte lorsque l’email échoue

`auth.ts:68–80` renvoie `INTERNAL_SERVER_ERROR` pour un compte existant lorsque Resend refuse l’envoi, et `{ ok: true }` pour une adresse inconnue. Une clé invalide, un quota épuisé ou une panne du fournisseur suffit. Les tests existants attestent chacun des deux comportements, mais ne les comparent pas en situation de panne. Même hors panne, l’appel réseau attendu uniquement pour un compte existant crée une différence de temps de réponse.

Correction attendue : réponse publique uniforme, erreurs fournisseur conservées dans la supervision interne ; découpler l’envoi du temps de réponse et prévoir une reprise fiable.

### 5. P2 — Les sessions ouvertes ne sont pas révoquées immédiatement

Le nouveau flux incrémente correctement `tokenVersion`, mais `src/server/auth.ts:143–156` ne compare sa valeur à la base qu’une fois par heure. Une session précédemment ouverte reste donc utilisable jusqu’au prochain contrôle, potentiellement presque une heure après la réinitialisation. Aucun contrôle additionnel de cette version n’est présent dans les middlewares tRPC. Ce mécanisme préexistait ; le nouveau flux ne remplit donc pas la promesse de couper les sessions dès la récupération du compte.

Correction attendue : vérifier la révocation sur les accès protégés avec une stratégie permettant une invalidation effective après récupération, puis tester une session obtenue avant la réinitialisation. Le test qui vérifie uniquement l’incrément du compteur ne suffit pas.

## Bilan par chantier

| Chantier | Conclusion |
|---|---|
| Réinitialisation | Flux, pages, migration, hash SHA-256, consommation unique d’un même jeton et restrictions OPS présents. Trois constats ci-dessus empêchent une validation sans réserve. |
| `isRenewal` / `attention` | Validé : état inclus dans le renouvellement et test assurant que `requireDeposit` n’est pas écrasé. |
| Prix Meta | Aucun changement de calcul, seulement un commentaire. L’exemple officiel utilise une conversion en centièmes. Je n’ai pas établi une preuve spécifique XOF ni effectué un essai sandbox ; « pour toute devise » reste plus fort que la preuve consultable. |
| `generated/` | Validé : retrait de l’index, règle ignore, postinstall et génération Docker cohérents ; génération isolée réussie. |
| Nettoyage R2 | Implémenté mais non validé : appartenance et références partagées non contrôlées. Ce n’est pas non plus un rattrapage des objets déjà orphelins. |
| Extraction du worker | Validée dans le périmètre annoncé : passage explicite du contexte aux deux modules, branches conservées, suites worker et intégrations vertes. |

Le relais OPS vérifie le rôle côté serveur et journalise les identifiants de l’opérateur et du compte, sans jeton dans ce log. La configuration Resend doit être activée et un envoi réel vérifié séparément ; aucune livraison d’email réelle testée ici.

## Preuves locales et source Meta

Logs : `/tmp/chantiers-unit.log`, `/tmp/chantiers-integration.log`, `/tmp/chantiers-ui.log`, `/tmp/chantiers-build.log`, `/tmp/chantiers-e2e.log`, `/tmp/chantiers-concurrency.log`, `/tmp/chantiers-r2.log`.

Contre-tests : `/tmp/chantiers-review.integration.test.ts`, `/tmp/chantiers-r2-review.test.ts` (à replacer sous `src` pour les lancer avec la configuration Vitest du projet).

Source primaire : https://github.com/facebook/facebook-python-business-sdk/blob/main/examples/dpa-update/dpa_update.py — conversion `int(float(new_price) * 100)`. La référence Graph Product Item a renvoyé HTTP 429 lors de cette revue ; pas de validation directe supplémentaire ni d’appel authentifié à Meta.
