/**
 * Déclare que ce processus est le worker pg-boss.
 *
 * Le rôle décide de qui porte la maintenance de pg-boss (migration du schéma,
 * supervision, planification des crons) — cf. `src/server/workers/queues.ts`.
 *
 * On le pose ici plutôt que de compter sur la variable d'environnement de la
 * plateforme : oublier de la cocher sur Railway donnerait un worker qui consomme
 * les jobs sans jamais planifier les crons ni superviser les jobs bloqués, et
 * l'oubli ne se verrait pas — tout aurait l'air de fonctionner jusqu'à ce qu'on
 * remarque que les réservations n'expirent plus.
 *
 * Une valeur explicitement fournie par la plateforme reste prioritaire, pour
 * garder la main en cas de besoin.
 *
 * ⚠️ À importer AVANT `~/server/workers/queues` : les imports d'un module ES
 * s'exécutent dans l'ordre où ils sont déclarés, et `queues` lit le rôle au
 * moment de construire l'instance PgBoss.
 */
process.env.PG_BOSS_ROLE ??= "worker";
