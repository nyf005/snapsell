# Worker SnapSell (Railway) — consommateur pg-boss et crons métier.
#
# Pourquoi un Dockerfile plutôt que Nixpacks
# ------------------------------------------
# Nixpacks déclare un `ARG` puis un `ENV` pour *chaque* variable du service. Tous
# les secrets se retrouvaient donc cuits dans la configuration de l'image :
# `ENCRYPTION_KEY` (qui déchiffre les jetons Meta de toutes les boutiques),
# `AUTH_SECRET` (qui permet de forger une session), `QSTASH_TOKEN`, les clés R2 —
# et `DATABASE_URL`, mot de passe compris, que le linter de Docker ne signalait
# même pas, ne repérant que les noms contenant KEY, SECRET ou TOKEN.
#
# Une valeur posée en `ENV` reste lisible dans l'image (`docker history`) et
# survit à toute exportation. Or ce build n'a besoin d'aucun secret : il installe
# des dépendances et lance `prisma generate`, vérifié sans `DATABASE_URL`.
#
# Ici, aucun `ARG` de secret. Railway les injecte au démarrage du conteneur,
# c'est-à-dire à l'endroit prévu pour eux.

FROM node:22-slim

# Prisma 7 charge un moteur lié à OpenSSL ; `ca-certificates` est requis pour
# `sslmode=verify-full` sur Neon, sans quoi la validation du certificat échoue.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Les dépendances d'abord, dans leur propre couche : elle n'est réinstallée que
# si les manifestes changent, pas à chaque modification de code.
COPY package.json package-lock.json ./

# `--ignore-scripts` : le `postinstall` lance `prisma generate`, qui a besoin du
# schéma — pas encore copié à ce stade. On génère explicitement plus bas.
#
# Pas de `--omit=dev` : le worker démarre via `tsx`, qui est une devDependency.
RUN npm ci --ignore-scripts

COPY . .

# Génère le client Prisma pour la plateforme de l'image (cible native), et non
# celle de la machine de développement.
RUN npm run db:generate

# Après l'installation seulement : posé avant, npm aurait sauté les
# devDependencies, dont `tsx`.
ENV NODE_ENV=production

# L'image officielle fournit l'utilisateur `node`. Le worker n'écrit rien sur le
# disque et n'a aucune raison de tourner en root.
USER node

CMD ["npm", "run", "worker:start"]
