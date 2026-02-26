# Meta Provider - Embedded Signup Sandbox

Ce dossier contient l'implementation Meta Cloud API et les tests associes au flow Embedded Signup.

## Test d'integration Embedded Signup (Story 12.4)

Fichier test:
- `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`

Ce test est volontairement conditionnel et ne s'execute que si:
- `RUN_INTEGRATION_TESTS=true`
- `DATABASE_URL` est defini
- `META_APP_ID` est defini
- `META_APP_SECRET` est defini

## Prerequis environment

Variables minimales:
- `DATABASE_URL`
- `META_APP_ID`
- `META_APP_SECRET`
- `RUN_INTEGRATION_TESTS=true`

Notes:
- En sandbox (pre-TP/BSP), le test couvre le flux backend E2E avec reponses Meta simulees (code OAuth -> exchange -> stockage tenant).
- Le test ne depend pas d'un navigateur ni d'un vrai popup Meta.

## Commandes

Lancer uniquement ce test:

```bash
RUN_INTEGRATION_TESTS=true npm run test -- src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts
```

Lancer les non-regressions associees a la story 12.4:

```bash
npm run test -- src/server/api/routers/settings.test.ts
npm run test:ui -- src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx
npm run lint
```

## Limites et guardrails

- Sandbox only: ce test sert de garde-fou integration avant validation reel provider.
- Le flow popup UI est simule via un `code` OAuth de test transmis au backend.
- Les cas d'erreur verifies incluent:
  - token/code expire
  - permissions insuffisantes (scopes)
  - WABA suspendu/inexploitable (resolution impossible)
