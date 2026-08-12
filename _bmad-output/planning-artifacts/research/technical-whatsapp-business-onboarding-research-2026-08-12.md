---
stepsCompleted: [1]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Simplification de la connexion WhatsApp Business dans SnapSell'
research_goals: 'Identifier les parcours officiels Meta qui réduisent les difficultés d’onboarding, avec une attention prioritaire aux vendeurs dont le numéro est déjà utilisé dans l’application WhatsApp Business, puis recommander le meilleur parcours pour SnapSell sans coder.'
user_name: 'Fabrice'
date: '2026-08-12'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-08-12
**Author:** Fabrice
**Research Type:** technical

---

## Research Overview

[Research overview and methodology will be appended here]

## Technical Research Scope Confirmation

**Research Topic:** Simplification de la connexion WhatsApp Business dans SnapSell
**Research Goals:** Identifier les parcours officiels Meta qui réduisent les difficultés d’onboarding, avec une attention prioritaire aux vendeurs dont le numéro est déjà utilisé dans l’application WhatsApp Business, puis recommander le meilleur parcours pour SnapSell sans coder.

**Technical Research Scope:**

- Architecture Analysis - design patterns, frameworks, system architecture
- Implementation Approaches - development methodologies, coding patterns
- Technology Stack - languages, frameworks, tools, platforms
- Integration Patterns - APIs, protocols, interoperability
- Performance Considerations - scalability, optimization, patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-08-12

---

<!-- Content will be appended sequentially through research workflow steps -->

## Technology Stack Analysis

### Programming Languages

Le parcours actuel est une intégration web TypeScript/React côté interface, avec des appels serveur vers la Graph API Meta. Pour ce cas d’usage, le langage n’est pas le facteur limitant : le contrat déterminant est celui du SDK JavaScript Facebook pour lancer Embedded Signup, puis celui de la Graph API pour échanger le code, gérer les actifs WhatsApp et recevoir les webhooks.

_Technologie actuelle : TypeScript, React/Next.js et appels HTTP Graph API._
_Adéquation : bonne ; aucune réécriture de socle n’est justifiée pour simplifier l’onboarding._
_Confiance : élevée, vérifiée dans le dépôt SnapSell._

### Development Frameworks and Libraries

SnapSell intègre déjà le SDK JavaScript Facebook et lance `FB.login()` avec un `config_id`, un retour OAuth de type `code` et `sessionInfoVersion: "3"`. C’est le mécanisme attendu pour Embedded Signup. La collection officielle Meta présente Embedded Signup comme la solution d’onboarding pour les Solution Partners, Tech Providers et Tech Partners, intégrable dans leur propre portail client.

Le point différenciant observé dans SnapSell est `featureType: ""`, qui sélectionne le parcours standard. La documentation Meta du parcours dédié aux utilisateurs de l’application WhatsApp Business demande au contraire `featureType: "whatsapp_business_app_onboarding"`. SnapSell ne lance donc actuellement pas le flux Coexistence adapté au cas majoritaire décrit par le test terrain.

_Framework principal : Facebook JavaScript SDK + Facebook Login for Business / Embedded Signup._
_Maturité : solution officielle Meta ; le socle est correct mais la variante d’onboarding doit correspondre au type de numéro._
_Source : https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup_
_Source : https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/_

### Database and Storage Technologies

SnapSell stocke par boutique le WABA ID, le Phone Number ID, le numéro commercial et un jeton chiffré. Ce modèle est compatible avec une architecture multi-tenant Cloud API et peut également représenter une connexion Coexistence, puisque le numéro reste un numéro Cloud API du point de vue des appels serveur.

Le stockage n’est donc pas la source principale de friction. Il faudra cependant conserver un état explicite du mode de connexion (standard ou Coexistence) si l’UX, le diagnostic ou certaines limites produit doivent différer.

_Stockage actuel : identifiants Meta et jeton par tenant._
_Adéquation : globalement compatible avec les deux modes._
_Confiance : élevée pour la structure actuelle ; à confirmer pour les métadonnées spécifiques exposées par Meta._

### Development Tools and Platforms

La plateforme cible reste Meta Business Messaging : WhatsApp Cloud API pour les messages, WhatsApp Business Management API pour les actifs et Embedded Signup pour l’autorisation. La collection officielle Meta précise qu’une mise en production d’Embedded Signup exige une App Review et l’Advanced Access aux permissions de gestion nécessaires.

SnapSell ne devrait pas demander aux vendeuses de manipuler WABA ID, Phone Number ID ou jeton. La saisie manuelle existante doit rester un outil de support interne ou de dépannage exceptionnel, pas un parcours d’onboarding.

_Plateformes : Meta Business Messaging, Graph API, WhatsApp Cloud API et Business Management API._
_Prérequis : application Meta configurée, configuration Embedded Signup et permissions avancées validées._
_Source : https://www.postman.com/meta/whatsapp-business-platform/overview_
_Source : https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup_

### Cloud Infrastructure and Deployment

Cloud API est hébergée par Meta ; SnapSell conserve seulement son interface, son backend, ses secrets et son endpoint webhook. La collection officielle impose HTTPS et indique qu’après Embedded Signup il faut intégrer les opérations nécessaires : récupérer les actifs partagés, enregistrer le numéro lorsque le flux l’exige et abonner l’application au WABA.

Le parcours actuel utilise Graph API `v21.0` en dur. Ce choix n’empêche pas Coexistence à lui seul, mais une vérification et une politique de montée de version sont nécessaires, car l’onboarding dépend fortement du contrat Meta courant.

_Infrastructure : Cloud API Meta + backend et webhooks SnapSell._
_Point d’attention : version Graph API figée et complétude des opérations post-onboarding._
_Source : https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup_
_Source : https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-75e65a16-c157-4877-a02a-87315efaf48e_

### Technology Adoption Trends

Le sens de l’écosystème est clair : Cloud API remplace l’ancien modèle on-premises, et Embedded Signup est l’interface officielle d’onboarding des clients d’un fournisseur technologique. Pour les petites vendeuses déjà établies dans l’application mobile, la variante WhatsApp Business App Onboarding — couramment appelée Coexistence — répond au principal obstacle du parcours standard : ne pas devoir abandonner le numéro, l’application et les habitudes existantes.

Le choix à évaluer n’est donc pas « Cloud API ou autre technologie », mais « Embedded Signup standard pour un nouveau numéro » versus « Embedded Signup Coexistence pour un numéro déjà actif dans WhatsApp Business », avec éventuellement un BSP comme accélérateur opérationnel.

_Tendance dominante : Cloud API directe et onboarding embarqué._
_Évolution clé : prise en charge officielle des numéros déjà utilisés dans WhatsApp Business via un flux spécialisé._
_Source : https://www.postman.com/meta/whatsapp-business-platform/overview_
