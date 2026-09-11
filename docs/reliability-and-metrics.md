# Fiabilité et mesures de SnapSell

## Publication et envoi

Chaque MessageOut est enregistré avant la publication vers QStash. `publishedAt`
distingue un message réellement publié d’un message seulement persisté. Le worker
reprend chaque minute jusqu’à 100 messages non publiés de plus de 30 secondes,
du plus ancien au plus récent. Un échec interrompt le lot jusqu’au prochain passage.
Le bail de publication de deux minutes évite les publications concurrentes et permet
une reprise après arrêt du process. L’identifiant de déduplication QStash est celui
du MessageOut. Une fenêtre d’incertitude réseau peut toujours provoquer une nouvelle
publication : les callbacks sont donc également protégés par un bail d’envoi en base.

Le bail d’envoi de cinq minutes est partagé par les callbacks QStash et le consommateur
local. Les requêtes d’envoi Meta ont une limite de 30 secondes. Un message terminal
(sent, blocked, suppressed) n’est jamais renvoyé lors d’un rejeu. `sentAt` indique
l’acceptation par Meta, **pas une preuve de lecture ou de livraison au téléphone**.

Aucun système avec un appel Meta externe et une écriture PostgreSQL distincte ne garantit
un envoi exactement une fois : un arrêt après acceptation par Meta mais avant l’écriture
de `sent` reste ambigu. Les verrous empêchent les doubles envois concurrents normaux,
pas cette fenêtre distribuée. Une reprise de messages anciens doit tenir compte de
l’état actuel des commandes et de la fenêtre autorisée par WhatsApp.

Les échecs définitifs QStash utilisent le callback officiel `sourceBody` en base64.
Les incidents sont dédupliqués par MessageOut dans DeadLetterJob. Une publication initiale
qui n’atteint pas QStash est gérée par le worker de reprise, pas par cette DLQ.

Source : [callbacks QStash](https://upstash.com/docs/qstash/features/callbacks).

## Supervision

- Heartbeat écrit après une consommation de la tâche de reprise, chaque minute.
- `/api/healthz` : 503 après 3 minutes sans heartbeat, ou 5 minutes d’attente dans l’outbox.
- Alerte Sentry sur les retards d’outbox, au plus une par 15 minutes par process, si configuré.
- Un moniteur HTTP externe est nécessaire pour détecter un worker complètement arrêté.
- Les exceptions fatales et les échecs de nettoyage sortent avec le code 1 ; SIGTERM/SIGINT
  normaux sortent avec le code 0. Un nettoyage bloqué est interrompu après 35 secondes.

## Indicateurs dans le dashboard des propriétaires et managers

Toutes les requêtes sont filtrées par la boutique issue de la session, jamais par un
identifiant client fourni. La période affichée est de 30 jours, sauf le premier succès.

| Indicateur | Définition |
|---|---|
| Conversion | Réservations créées dans les 30 jours ayant une commande / toutes les réservations de cette cohorte. Les commandes ensuite annulées restent comptées. |
| Intervention humaine | Fenêtres de conversation mesurées ouvertes dans les 30 jours, transmises au moins une fois / fenêtres mesurées ouvertes dans les 30 jours. |
| Premier succès | Temps entre création du compte boutique et premier MessageOut de type `order_confirmation` accepté par Meta. |
| Préparation après live | Médiane entre fermeture du live et première transition `in_delivery` postérieure, pour les lives fermés dans les 30 jours et commandes avec traces présentes. |

Les conversations sont comptées une fois par fenêtre de crédits, dans la transaction
qui crée cette fenêtre. Les métriques conservent un identifiant aléatoire et un booléen,
sans numéro ni contenu de conversation. Elles sont purgées après 90 jours. Une donnée
historique absente n’est pas reconstituée arbitrairement et s’affiche comme non mesurée.
Les commandes sans session live ou sans événements nécessaires ne participent pas à
la médiane ; le nombre d’observations est visible.

## Vérification et déploiement

Les migrations se vérifient sur une base neuve : plusieurs colonnes historiques
manquaient avant le rattrapage additif. Ne pas supprimer les indexes partiels de
réservation ou de liste d’attente que Prisma ne représente pas dans son schéma.

Les tests utilisent une base locale suffixée `_test`. Aucun `.env` réel n’est chargé
par Vitest ; le serveur navigateur neutralise les variables applicatives avant de
lancer Next. Les services Meta et QStash sont simulés dans les intégrations.

Le workflow GitHub exécute lint, TypeScript, migrations, intégrations, tests UI, build
et navigateur mobile/desktop. Pour activer ces protections sur le dépôt distant,
pousser le workflow et rendre le job `verify` obligatoire dans les règles de branche.

Avant mise en service : appliquer les migrations, déployer l’application et le worker,
puis vérifier `/api/healthz` et un envoi de recette. Ces opérations de production ne
sont pas exécutées par la suite de tests locale.

## Dépendances

Les correctifs compatibles ont été appliqués. Deux overrides sont ciblés sur l’outillage
Prisma : `@prisma/config → deepmerge-ts 8.0.0` et `prisma → mysql2 ^3.23.1`.
La configuration Prisma de ce dépôt utilise des objets simples, pas les Maps dont la
fusion a changé dans deepmerge-ts 8. Valider génération, migrations et build lors de
la suppression future de ces overrides après correction des dépendances amont.

## Résultats de validation — 11 septembre 2026

- 109 fichiers de tests serveur/intégration : **1 284 tests réussis**, aucun ignoré.
- 29 fichiers de tests UI : **278 tests réussis**.
- Chromium : **6 parcours réussis**, répartis entre mobile et ordinateur.
- Build de production, vérification TypeScript et ESLint : réussis.
- Audit npm après les mises à jour : **0 vulnérabilité signalée**.
- Migrations appliquées sur PostgreSQL 15 temporaire ; aucun champ manquant après
  comparaison avec Prisma. Les deux indexes partiels métier supplémentaires sont conservés.
- Démarrage du vrai worker local : queues initialisées, heartbeat écrit, arrêt SIGTERM code 0.

Le workflow CI est prêt dans le dépôt ; son exécution hébergée et les règles de branche
ne sont pas activées par ces opérations locales. Aucun déploiement ni migration sur la
base de production n’a été exécuté. La base temporaire a été arrêtée après validation.
