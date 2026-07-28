/**
 * Erreurs applicatives portant une clé de message utilisateur.
 *
 * Le client ne peut afficher un texte d'erreur que si sa clé est enregistrée dans
 * `errorCopy` (src/lib/copy/glossary.ts). C'est une liste blanche par construction :
 * une erreur inattendue tombe sur un message générique et ne peut rien divulguer.
 *
 * Usage :
 *   throw appError("FORBIDDEN", "session.forbidden");
 *   throw appError("BAD_GATEWAY", "whatsapp.metaRefused", { cause: metaErr });
 *
 * Le `message` reste renseigné pour les logs et Sentry ; il n'est pas destiné à l'affichage.
 */

import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";

import { errorCopy } from "~/lib/copy/glossary";

export type UserErrorKey = keyof typeof errorCopy;

/**
 * Construit une TRPCError transportant `userKey` jusqu'au client.
 *
 * @param code    Code tRPC standard (FORBIDDEN, BAD_REQUEST, …).
 * @param userKey Clé enregistrée dans `errorCopy`.
 * @param opts.cause      Erreur d'origine, conservée pour les logs / Sentry.
 * @param opts.logMessage Message technique pour les logs, non affiché.
 */
export function appError(
  code: TRPC_ERROR_CODE_KEY,
  userKey: string,
  opts?: { cause?: unknown; logMessage?: string },
): TRPCError {
  const error = new TRPCError({
    code,
    message: opts?.logMessage ?? userKey,
    cause: opts?.cause,
  });
  // Lu par errorFormatter (src/server/api/trpc.ts) et exposé dans data.userKey.
  (error as TRPCError & { userKey?: string }).userKey = userKey;
  return error;
}

/** Extrait la clé utilisateur d'une erreur, si elle en porte une. */
export function getUserKey(error: unknown): string | null {
  const key = (error as { userKey?: unknown } | null)?.userKey;
  return typeof key === "string" ? key : null;
}
