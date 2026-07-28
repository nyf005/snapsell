# SnapSell Design System

## Direction

Interface produit claire et opérationnelle, pensée pour une vendeuse qui consulte rapidement son téléphone dans une pièce éclairée pendant un live, puis traite calmement ses commandes sur ordinateur. Le thème clair est prioritaire. Le mode sombre existant reste compatible.

La stratégie couleur est **Restrained** : neutres légèrement teintés de violet, surfaces calmes et accent violet réservé aux actions principales, à la sélection et au focus.

## Color

Les couleurs sont définies en OKLCH dans les tokens globaux.

- `background` : surface principale légèrement teintée.
- `surface` : contenu principal et panneaux.
- `surface-subtle` : navigation, filtres et regroupements secondaires.
- `foreground` : texte principal violet-noir, jamais noir pur.
- `muted-foreground` : texte secondaire avec contraste AA.
- `primary` : violet SnapSell, utilisé avec parcimonie.
- `success`, `warning`, `destructive`, `info` : rôles sémantiques avec fond, texte et bordure dédiés.
- Les statuts combinent toujours libellé, icône ou forme avec leur couleur.

## Typography

- Famille principale : Geist et fallback système.
- Manrope est réservée au logo et aux rares éléments de marque, jamais aux contrôles ou données.
- Échelle produit fixe : 12, 14, 16, 20, 24 et 30 px.
- Corps principal : 16 px sur mobile, interligne 1.5.
- Métadonnées : 14 px minimum lorsque l’information est utile à l’action.
- Titres courts, équilibrés et sans paragraphes introductifs redondants.
- Données numériques en chiffres tabulaires.

## Spacing and Layout

- Base 4 px, valeurs privilégiées : 4, 8, 12, 16, 24, 32 et 48 px.
- Largeur de contenu adaptée à la tâche, sans conteneur artificiel unique pour toutes les pages.
- Mobile first : contenu empilé, actions principales visibles, détails secondaires repliables.
- Desktop : sidebar, zones de travail larges et tableaux denses mais lisibles.
- Les cartes sont réservées aux regroupements actionnables ou comparables. Les sections utilisent d’abord espace, alignement et séparateurs.

## Navigation

- **Aujourd’hui** : tableau de bord.
- **Vendre** : live et catalogue.
- **Traiter** : commandes et preuves.
- **Gérer** : prix, livraison, WhatsApp, FAQ, équipe, abonnement et audit.
- Mobile : barre inférieure avec Aujourd’hui, Live, Commandes et Plus.
- Les routes et permissions existantes sont conservées.

## Components

### Page header

Titre, description courte facultative, puis actions principales. Sur mobile, les actions occupent toute la largeur si nécessaire.

### Buttons

Hauteur minimale de 40 px sur pointeur fin et 44 px sur écran tactile. Une seule action primaire par groupe. Les états hover, focus-visible, active, disabled et loading sont explicites.

### Status

Badges sobres avec texte lisible. Les états urgents utilisent un fond sémantique léger, jamais une simple couleur décorative.

### Tables

Desktop : tableau avec en-tête stable et actions alignées. Mobile : contenu transformé en lignes empilées ou cartes structurées, sans scroll horizontal pour les actions essentielles.

### Forms

Labels toujours visibles, aide placée près du champ, validation sous le champ et retour global après sauvegarde. Les options avancées utilisent des sections repliables.

### Feedback

Skeletons pour le chargement structurel. Messages de succès brefs. Erreurs selon la formule : ce qui s’est passé, pourquoi si connu, comment continuer.

## Motion

Transitions de 150 à 220 ms avec courbes ease-out. La motion signale sélection, révélation ou confirmation. Pas de chorégraphie au chargement des pages. `prefers-reduced-motion` désactive les mouvements non indispensables.

## UX Writing

Structure commune : état actuel, information essentielle, prochaine action.

### Terminologie canonique

Deux énumérations distinctes, qu'il ne faut pas mélanger — elles décrivent deux objets différents du schéma.

**États de réservation** (`ReservationStatus`, plus la file d'attente) :
Réservée · En file d’attente · Adresse reçue · Confirmée · Expirée

**États de commande** (`OrderStatus`) :
En attente d’acompte · Confirmée · En préparation · En livraison · Livrée · Annulée

Un état porte **le même mot partout** : badge, filtre, onglet, message WhatsApp. Les onglets d'une liste reprennent les libellés des badges, verbatim. Une seule exception est tolérée : un onglet de tri qui couvre **plusieurs** états à la fois (par exemple « À traiter ») — il n'a alors aucun équivalent en badge, ce qui le rend impossible à confondre avec un état.

### Vocabulaire du produit

Un mot par concept, sur le web comme sur WhatsApp. Le registre change (le robot dit « tu », le web dit « vous »), le mot non.

| Concept | Mot |
|---|---|
| l'objet vendu | article |
| la mise de côté | réservation · délai de réservation |
| l'argent versé d'avance | acompte |
| la photo envoyée par la cliente | preuve de paiement |
| la diffusion | live |
| l'attente | file d'attente |
| le stock permanent | catalogue |
| l'automatisation | l'assistant (web) · « je » (WhatsApp) |
| l'unité facturée | conversation client |
| l'application vendeur | tableau de bord |

### Genre

Les textes évitent de genrer les personnes, par **reformulation** — jamais par point médian.

Genre grammatical n'est pas genre social : *une personne*, *la clientèle*, *un numéro*, *une boutique* portent un genre fixe qui ne dit rien de l'humain désigné. La règle est d'éviter les mots dont le genre est **choisi pour coller à quelqu'un**, et les participes qui **s'accordent avec `vous`**.

Écrire « votre clientèle » plutôt que « vos clientes », « les vôtres » plutôt que « ceux de la vendeuse », « Vous avez reçu une invitation » plutôt que « Vous avez été invité ».

Les boutons utilisent un verbe et un objet : « Libérer la réservation », « Valider la preuve », « Enregistrer les prix ». Le jargon « fenêtre de conversation 24 h » n’apparaît que dans l’aide.
