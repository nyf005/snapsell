import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "~/env";

/**
 * Comparaison à durée constante de deux chaînes.
 *
 * `!==` s'arrête au premier caractère qui diffère : son temps d'exécution dit
 * donc combien de caractères de tête sont corrects, et le secret se reconstruit
 * de proche en proche. Le webhook Meta et celui de Paystack se comparent déjà
 * ainsi ; seul le secret des crons ne le faisait pas, alors qu'il commande
 * l'exécution des tâches métier.
 *
 * Les longueurs sont comparées d'abord, `timingSafeEqual` exigeant des tampons
 * de même taille. Cette fuite-là est sans portée : connaître la longueur d'un
 * secret ne réduit pas sa recherche de façon exploitable.
 */
function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireCronAuthorization(request: Request): NextResponse | null {
  if (!env.CRON_SECRET) {
    return new NextResponse("Cron secret not configured", { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !safeEquals(authHeader, `Bearer ${env.CRON_SECRET}`)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return null;
}
