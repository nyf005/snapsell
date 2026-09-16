# Validation de l’analyse et corrections — 16 septembre 2026

Périmètre : confronter les affirmations fournies au code présent, corriger les défauts fonctionnels établis et vérifier les parcours concernés. Il ne s’agit pas d’une certification exhaustive du dépôt. Aucun service de production n’a été modifié.

## Résultats par constat

| Point de l’analyse | Validation et traitement |
| --- | --- |
| 1. Suppression en cascade des commandes | Confirmé. Suppression automatique d’un article épuisé retirée ; suppression catalogue refusée s’il possède des réservations ; migration des trois relations article/session → réservation vers `NO ACTION`. Les commandes et preuves restent consultables. |
| 2. Token Meta chiffré envoyé tel quel | Confirmé pour sync et unsync. Déchiffrement avant l’appel ; test avec un véritable token chiffré. Aucun appel Meta réel pendant les tests. |
| 3. Collisions d’idempotence de l’outbox | Confirmé. Identifiants distincts et stables par réservation/rappel, expiration, promotion et demande d’acompte. Le test utilise la vraie outbox PostgreSQL et conserve le message initial, le rappel et l’expiration. |
| 4. Fuites de stock | Confirmées. Expiration : quantité réelle, variante et parent. Annulation WhatsApp : libération transactionnelle de toutes les réservations actives. Annulation commande et expiration acompte : restitution transactionnelle une seule fois. Remplacement des variantes protégé contre les réservations directes et les commandes existantes, sur dashboard et WhatsApp vendeur. |
| 5. Bot coupé sur code inconnu/question | Confirmé. Une erreur de code ou une question sans réponse ne met plus la conversation en pause. La demande explicite d’un humain et les demandes de modification nécessitant son intervention conservent la reprise humaine. |
| 6. Mot de passe oublié | Fonctionnalité de réinitialisation automatique absente, mais l’interface actuelle l’annonce explicitement et propose l’assistance. Aucun faux formulaire de récupération ajouté. Un mécanisme sécurisé d’envoi et de consommation de jetons reste une fonctionnalité à développer. |
| 7. Acomptes | Confirmé. Une preuve pending empêche l’expiration. Dépôt de preuve, expiration et revue se synchronisent sur la commande. Rejet : preuve marquée rejected, commande toujours payable, délai rouvert. Rejeu d’une preuve dédupliqué. |
| 8. Plusieurs articles | Défaut de parcours confirmé, formulation « article systématiquement perdu » trop absolue. Adresse et récapitulation communes à toutes les réservations actives ; confirmation de chaque article avec son numéro. Le modèle reste une commande par réservation, pas une nouvelle commande multiligne. Les variantes du panier natif demandent un choix explicite. Autre défaut découvert : les schémas supprimaient le panier avant le worker ; les champs natifs et normalisés sont maintenant conservés. |
| 9. Confirmation contre expiration | Confirmé. Transition conditionnelle sur le statut et la date d’expiration dans la même transaction que le stock et la commande. Rejeu concurrent : même commande, un seul décrément. |
| 10. Paystack | Confirmé. Paiement et droits/crédits écrits dans une même transaction, verrou par référence contre les doublons concurrents, HTTP 500 si échec rejouable. Le cron d’expiration traite aussi `attention` et recontrôle l’échéance à l’écriture. |
| 11. Deux unités monétaires | Convention différente réelle, erreur automatique non démontrée. Conservation des abonnements en francs et du catalogue en centièmes ; conversions de saisie partagées dans `src/lib/money.ts`. Pas de migration monétaire arbitraire. |
| 12. Compteur quantity | Confirmé. Confirmation et restitution maintiennent quantity avec le stock restant. Correction dashboard : valeur absolue, sans delta calculé sur un compteur historique. Migration d’alignement des compteurs existants. |
| 13. Synchronisation Meta | Jetons, URL locale de secours et état de synchronisation corrigés. Modification catalogue/stock invalide la synchro ; les stocks épuisés sont aussi repris par la synchronisation. L’affirmation sur le prix XOF n’est pas suffisamment établie pour changer d’unité : l’exemple officiel du SDK Business utilise des centièmes pour ce champ, contrairement aux fichiers de flux. |
| 14. Session live inactive | Confirmé. Fermeture des lignes actives hors fenêtre avant création de la nouvelle session ; test PostgreSQL avec l’index unique réel. |
| 15. Webhook Meta en lot | Confirmé. Résolution du tenant pour chaque changement ; statuts traités même en présence de messages. Test mélangeant deux tenants et des statuts. Normalisation explicite du numéro à la frontière de persistance. L’adaptateur ajoutait déjà le `+` ; ce point ne prouve pas que tous les messages réels étaient rejetés auparavant. |
| 16. Boutons WhatsApp | Confirmé. `send_address` distinct de `send_proof` ; handlers pour catalogue et message à la boutique ; suivi affichant le vrai statut. Réservation après retry vérifiée avant d’annoncer le succès. |
| 17. Gros module et duplications | Dette de conception réelle. Confirmation bouton/« oui » regroupée, priorité FAQ rendue cohérente. Une décomposition complète du processeur reste un chantier distinct. |
| 18. Tests jamais exécutés | Affirmation non établie et incompatible avec la CI présente, qui lance les intégrations avec PostgreSQL. Les tests d’intégration ont été exécutés localement pour ce travail, sans utiliser `.env` ni une base réelle. |
| 19. Frontend/outillage | Retour après connexion corrigé, y compris la destination complète dans le layout. Nixpacks aligné sur Node 22. Taille des composants, cache des lectures et versionnement du client Prisma : dette technique, pas des pannes démontrées ; pas de réécriture générale. |

## Autres remarques de l’analyse

- Les prix négatifs étaient acceptés par le schéma catalogue. Ils sont refusés, et les montants catalogue, grille et livraison sont bornés par la capacité d’un `Int` PostgreSQL. Aucun plafond commercial arbitraire n’a été inventé.
- Les nouveaux codes et modifications de code du dashboard suivent le contrat lettres + chiffres. Les codes historiques libres ne sont pas renommés automatiquement : leur changement doit conserver la correspondance avec les supports de vente existants.
- Le plus long préfixe tarifaire reste intentionnel : `AB12` utilise `AB` plutôt que `A` si les deux existent.
- Le garde de vocabulaire est déjà actif. Son commentaire périmé a été corrigé. Correction après contre-vérification : le guide Epic 2 affirmait à tort que personne ne consommait `outbox-send` sans QStash. Hors production, `scripts/start-worker.ts` démarre bien `startOutboxSenderWorker()` lorsque la configuration QStash est incomplète, et celui-ci consomme `QUEUE.OUTBOX_SEND`. Les passages concernés du guide et le commentaire de démarrage ont été corrigés. En production, QStash reste requis. La conclusion initiale « contradiction non confirmée » était erronée.
- Le nettoyage des objets R2 non référencés reste à concevoir avec la rétention des images et preuves. Aucune purge automatique ajoutée : des images peuvent être partagées ou utiles à l’historique commercial. La conservation des commandes ne doit pas être remplacée par une perte de leurs pièces.
- La taille des composants, les enums stockés en String et l’uniformisation du tutoiement ne constituent pas, seuls, des bugs fonctionnels démontrés.

## Contraintes de données et déploiement

Migration préparée : `prisma/migrations/20260916030000_preserve_order_history/migration.sql`. D’abord validée sur les bases locales de test, puis appliquée le 16 septembre 2026 à la base Neon configurée, sur demande explicite de migration, commit et push. Elle protège les réservations contre la suppression indirecte et aligne `quantity` sur `available_qty`.

Un article lié à l’historique reste présent, même épuisé. Réutiliser son code par suppression n’est plus permis ; une éventuelle fonctionnalité d’archivage avec réutilisation des codes devra préserver les références commerciales.

Les données déjà supprimées par l’ancienne cascade ne peuvent pas être recréées par ce correctif. Les compteurs `reserved_qty` déjà incohérents demandent un rapprochement avec les réservations réelles avant toute réparation de production.

Les tests isolent les services externes : pas de paiement, de message WhatsApp ni de suppression de média envoyé depuis ce travail. La livraison effective chez Meta et Paystack reste à vérifier dans leurs environnements de test après déploiement de la migration et du code.

## Sources pour le point Meta/prix

Exemple officiel Meta Business SDK : https://github.com/facebook/facebook-python-business-sdk/blob/main/examples/dpa-update/dpa_update.py — conversion vers un entier en centièmes avant l’écriture du champ `price`. Cette source ne suffit pas, à elle seule, à établir une exception spécifique à XOF ; le facteur 100 n’a donc pas été changé sans preuve.

## Vérifications

- Suite complète Vitest avec intégrations PostgreSQL : **115 fichiers, 1 375 tests réussis**, aucun test ignoré (`RUN_INTEGRATION_TESTS=true npx vitest run --maxWorkers=1`, avec `DATABASE_URL` pointant explicitement vers la base temporaire).
- Tests UI : **31 fichiers, 289 tests réussis**.
- Playwright : **36 scénarios réussis**, ordinateur et mobile, dont le retour après connexion vers une URL avec filtres. Chaque scénario dispose de son tenant et de son compte pour éviter les interférences et respecter la limitation des tentatives de connexion.
- Après la dernière modification conservant les boutons de confirmation WhatsApp : **127 tests worker** et les **14 régressions PostgreSQL** ont été relancés avec succès.
- Build de test, validation Prisma, vérification TypeScript, lint et `git diff --check` : réussis.
- Migration appliquée avec succès sur les bases PostgreSQL locales temporaires. Les tests navigateur et les intégrations utilisent des bases séparées pour isoler les messages en attente. Après validation et sur demande explicite : migration appliquée à la base Neon configurée le 16 septembre 2026 ; `prisma migrate status` confirme les 59 migrations à jour. Client Prisma régénéré. Le déploiement applicatif reste distinct du push Git.
