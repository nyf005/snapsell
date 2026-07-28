# SnapSell

Checkout WhatsApp pour le live commerce. Les codes annoncés pendant un live (« A12 ! ») deviennent des réservations puis des commandes structurées, sans tri manuel après le live.

Stack [T3](https://create.t3.gg/) : Next.js 15 (App Router), tRPC v11, Prisma 7, Tailwind 4, NextAuth v5. Node 22, **npm**.

---

## Architecture en bref

Trois runtimes, chacun avec un rôle précis :

| Runtime | Rôle |
|---|---|
| **Vercel** | App Next.js, dashboard, tRPC, webhook Meta entrant, callbacks QStash |
| **Railway** (`webhook-worker`) | Process long-running : consomme la queue pg-boss + exécute les 5 crons métier |
| **Upstash QStash** | Envoi des messages sortants (retries, backoff, DLQ) |

```
Client WhatsApp
      │
      ▼
Meta Cloud API ──▶ POST /api/webhooks/meta          (Vercel, < 1 s)
                        │  vérif signature → resolve tenant
                        │  → persist MessageIn → boss.send()
                        ▼
                  queue pg-boss  (dans Postgres/Neon)
                        │
                        ▼
                  worker Railway                     (métier complet)
                        │  réservations, commandes, variantes, IA, médias
                        ▼
                  writeToOutbox() ──▶ QStash ──▶ /api/qstash/outbox-send
                                                        │
                                                        ▼
                                                  Meta Cloud API ──▶ Client
```

**Points non évidents :**
- La queue vit **dans Postgres** (pg-boss), pas dans Redis. Vercel et Railway doivent partager la même `DATABASE_URL`, et celle-ci doit être l'URL Neon **directe** (non-pooler) — PgBouncer casse les advisory locks.
- Redis (Upstash REST) ne sert **qu'au rate limiting tRPC**.
- Les credentials WhatsApp sont **par tenant, en base** (chiffrés AES-256-GCM), pas en variables d'environnement.
- Les crons tournent sur Railway via `boss.schedule()`. `vercel.json` ne doit **pas** contenir de clé `crons` — les routes `/api/cron/*` sont des fallbacks ops manuels, et les activer en parallèle exécuterait chaque job deux fois.

## Démarrage

**1. Variables d'environnement** — copier `.env.example` vers `.env`. La liste faisant foi est [`src/env.js`](src/env.js).

```bash
cp .env.example .env
```

**2. Base de données** — Postgres (Neon en prod, local en dev) :

```bash
npm run db:migrate
```

**3. Client Prisma** — après tout changement de schéma :

```bash
npm run db:generate
```

**4. Lancer l'app** (terminal 1) :

```bash
npm run dev
```

**5. Lancer le worker** (terminal 2) — sans lui, les messages entrants sont reçus mais jamais traités :

```bash
npm run dev:worker
```

## Commandes

```bash
npm test
```
```bash
npm run test:ui
```
```bash
npm run typecheck
```
```bash
npm run db:studio
```

Les tests sont **co-localisés** (`*.test.ts` à côté du code). Les tests d'intégration exigent `RUN_INTEGRATION_TESTS=true`.

## Documentation

| Document | Contenu |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Déploiement Vercel + Railway, variables d'environnement, troubleshooting |
| [TESTING-EPIC-2.md](TESTING-EPIC-2.md) | Guide de test du pipeline WhatsApp (webhook, routing, outbox, STOP) |
| [architecture.md](_bmad-output/planning-artifacts/architecture.md) | Décisions d'architecture et historique des migrations |
| [src/server/workers/README.md](src/server/workers/README.md) | Worker, queues pg-boss, crons |
| [PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md) | Positionnement produit et design system |
| [docs/](docs/) | Conventions, plans d'implémentation, stratégie |

## Pièges connus

- **Messages sortants bloqués en `pending`** — `QSTASH_TOKEN` ou `NEXT_PUBLIC_APP_URL` manque. `enqueueOutboxSend()` bascule alors silencieusement sur une queue pg-boss sans consommateur.
- **`ENCRYPTION_KEY` doit être identique** entre Vercel et Railway, sinon les tokens Meta sont indéchiffrables.
- **Ne jamais traiter un vendeur comme un client** — le routing par `seller_phones` est critique, sous peine d'auto-réservations.
