import crypto from "crypto";
import { hash } from "bcrypt";

import { env } from "~/env";
import { db } from "~/server/db";

export const PASSWORD_RESET_TTL_MINUTES = 30;

/** SHA-256 suffit : le jeton a 256 bits d'entropie, bcrypt n'apporterait rien ici. */
export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function findUserForPasswordReset(email: string) {
  return db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, tenantId: true, passwordHash: true },
  });
}

/**
 * Émet un nouveau jeton et neutralise les précédents : un seul lien valable à la
 * fois, celui de la dernière demande.
 */
type IssuedToken = { token: string; expiresAt: Date };
type EmailRequest = { id: string; requestedAt: Date };
export function issuePasswordResetToken(userId: string): Promise<IssuedToken>;
export function issuePasswordResetToken(userId: string, request: EmailRequest): Promise<IssuedToken | null>;
export async function issuePasswordResetToken(userId: string, request?: EmailRequest): Promise<IssuedToken | null> {
  // Un retry retrouve le même secret sans jamais le stocker en clair en base ou en file.
  if (request && !env.ENCRYPTION_KEY) throw new Error("Reset signing secret missing");
  const token = request
    ? crypto.createHmac("sha256", Buffer.from(env.ENCRYPTION_KEY!, "hex")).update(`password-reset:${request.id}`).digest("hex")
    : crypto.randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(token);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const now = new Date();
    if (request) {
      const newer = await tx.passwordResetToken.findFirst({ where: { userId, OR: [
        { requestedAt: { gt: request.requestedAt } },
        { requestedAt: null, createdAt: { gt: request.requestedAt } },
      ] } });
      if (newer) return null;
      const existing = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (existing) return existing.usedAt || existing.expiresAt <= now ? null : { token, expiresAt: existing.expiresAt };
    }
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
    await tx.passwordResetToken.create({ data: { userId, tokenHash, expiresAt, requestedAt: request?.requestedAt ?? null } });
    return { token, expiresAt };
  });
}

export type ResetPasswordWithTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Consomme le jeton et remplace le mot de passe. L'incrément de `tokenVersion`
 * coupe toutes les sessions ouvertes : c'est le but quand on soupçonne un accès
 * perdu ou volé.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ResetPasswordWithTokenResult> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // Le hachage coûte : on le paie hors transaction, avant de réclamer le jeton.
  const passwordHash = await hash(newPassword, 10);

  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${record.userId} FOR UPDATE`;
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!claim.count) return false;
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() },
    });
    return true;
  });

  return claimed ? { ok: true, userId: record.userId } : { ok: false, reason: "used" };
}
