import { randomUUID } from "node:crypto";
import { boss, ensureBossReady, QUEUE } from '~/server/workers/queues';
import { findUserForPasswordReset, issuePasswordResetToken } from './password-reset';
import { sendPasswordResetEmail } from './password-reset-email';

export type PasswordResetRequest = { id: string; email: string; requestedAt: string };

/** Même publication pour toute adresse ; aucune recherche de compte dans la requête HTTP. */
export async function enqueuePasswordReset(email: string): Promise<void> {
  await ensureBossReady();
  const id = await boss.send(QUEUE.PASSWORD_RESET_EMAIL, { id: randomUUID(), email, requestedAt: new Date().toISOString() });
  if (!id) throw new Error('Password reset request not queued');
}

export async function deliverPasswordReset(request: PasswordResetRequest): Promise<void> {
  // Une ancienne demande ne doit pas invalider les liens récents après une longue panne.
  if (Date.now() - Date.parse(request.requestedAt) > 30 * 60_000) return;
  const user = await findUserForPasswordReset(request.email);
  if (!user?.passwordHash) return;
  const issued = await issuePasswordResetToken(user.id, { id: request.id, requestedAt: new Date(request.requestedAt) });
  if (!issued) return; // Une demande plus récente ou une consommation a remplacé ce lien.
  const result = await sendPasswordResetEmail(user.email, issued.token);
  if (!result.ok) throw new Error('Password reset email delivery failed');
}

export async function startPasswordResetEmailWorker(): Promise<void> {
  await boss.work<PasswordResetRequest>(QUEUE.PASSWORD_RESET_EMAIL, { localConcurrency: 1 }, async jobs => {
    for (const job of jobs) await deliverPasswordReset(job.data);
  });
}
