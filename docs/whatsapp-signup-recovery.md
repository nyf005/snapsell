# Reprise de la connexion WhatsApp

## Comportement

Le parcours conserve une tentative de finalisation pendant 15 minutes dans `whatsapp_signup_attempts`. La clé est une empreinte SHA-256 du couple application Meta/code OAuth ; le code lui-même n'est pas enregistré. La tentative est liée à la boutique et aux identifiants choisis dans la fenêtre Meta.

Le jeton remis par Meta est chiffré avec la clé applicative et enregistré avant les vérifications suivantes. Si Meta ou l'enregistrement de la boutique échoue, le bouton **Réessayer la finalisation** réutilise ce jeton : il ne cherche pas à échanger une deuxième fois le code OAuth à usage unique. Le navigateur ne conserve le code que dans la mémoire du composant, pas dans le stockage local.

Un verrou en base de deux minutes empêche deux serveurs de finaliser la même tentative simultanément. Les écritures contrôlent l'identifiant et la date du verrou : un ancien serveur ne peut pas écraser le résultat après la reprise de son travail. La création de la tentative utilise `INSERT … ON CONFLICT` via Prisma `createMany(skipDuplicates)`.

La réussite de la tentative, les identifiants de la boutique et son numéro vendeur sont enregistrés dans la même transaction. Une réponse HTTP perdue peut être rejouée sans désactiver de nouveau l'assistant ni remettre à zéro la synchronisation. Le jeton intermédiaire est supprimé à la réussite ; les tentatives expirées sont supprimées lors des demandes de connexion suivantes.

Les permissions de gestion et de messagerie sont vérifiées ensemble. Lorsque Meta donne deux listes d'actifs non vides sans compte commun, la connexion est refusée au lieu de traiter cette absence d'intersection comme une autorisation générale.

## Actions proposées au vendeur

- Panne temporaire ou enregistrement incomplet : réessayer la finalisation.
- Tentative déjà en cours sur un autre serveur : patienter puis réessayer la finalisation.
- Session Meta expirée ou non réutilisable : ouvrir une nouvelle connexion, sans supprimer WhatsApp Business.
- Permissions manquantes : reconnecter en acceptant les autorisations.
- Mauvais compte sélectionné : relancer avec le compte et le numéro de la boutique.
- Numéro déjà lié à une autre boutique : vérifier le rattachement avec le support.
- Configuration serveur manquante : contacter le support, sans modifier le numéro.

## Limites explicites

Il n'est pas possible de rendre atomiques un appel Meta et une écriture PostgreSQL. Si Meta consomme le code mais que sa réponse est perdue avant la sauvegarde du jeton, une nouvelle session Meta est nécessaire. Même chose après expiration du checkpoint ou rechargement de la page qui perd le code conservé en mémoire. La connexion déjà enregistrée reste visible via la lecture de sa configuration.

La synchronisation Coexistence reste un travail distinct après validation des identifiants. Son échec ne doit pas faire annoncer l'échec d'une connexion déjà enregistrée. Les restrictions, droits et critères d'éligibilité décidés par Meta nécessitent toujours une validation avec un véritable compte extérieur.

## Livraison et tests

Appliquer `20260915193000_whatsapp_signup_recovery` avant de déployer l'application qui utilise ce mécanisme. La migration ajoute uniquement une table et son index ; elle n'altère pas les connexions existantes.

Les tests couvrent les erreurs Meta, la sauvegarde chiffrée, les reprises après rollback, les réponses perdues, l'isolation des boutiques, les courses de création, les verrous expirés et le bouton de reprise sans réouverture de la fenêtre Meta. Les tests d'intégration utilisent PostgreSQL local et une API Meta simulée.
