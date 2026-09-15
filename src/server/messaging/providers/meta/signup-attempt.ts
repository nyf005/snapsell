import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "../../../../../generated/prisma";
import { encrypt, decrypt } from "~/lib/crypto";
import { db } from "~/server/db";
import { appError } from "~/server/api/errors";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const ATTEMPT_TTL_MS = 15 * 60_000;
const LEASE_MS = 2 * 60_000;

export interface SignupCheckpoint {
  accessToken?: string;
  saveAccessToken: (token: string) => Promise<void>;
  complete: (tx: Prisma.TransactionClient, phoneNumberId: string) => Promise<void>;
}

/** A shared, fenced lease protects the whole connection, including its DB commit. */
export async function withSignupAttempt(
  input: { tenantId: string; appId: string; code: string; wabaId?: string; phoneNumberId?: string },
  connect: (checkpoint: SignupCheckpoint) => Promise<void>,
): Promise<void> {
  const now = new Date();
  const id = hash(JSON.stringify([input.appId.trim(), input.code.trim()]));
  const inputHash = hash(JSON.stringify([input.wabaId?.trim() ?? "", input.phoneNumberId?.trim() ?? ""]));
  // Expired checkpoints contain no reusable OAuth secret after this cleanup.
  await db.whatsAppSignupAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
  // INSERT ON CONFLICT avoids Prisma's read-then-create upsert race.
  await db.whatsAppSignupAttempt.createMany({
    data: [{ id, tenantId: input.tenantId, inputHash, expiresAt: new Date(now.getTime() + ATTEMPT_TTL_MS) }],
    skipDuplicates: true,
  });
  const attempt = await db.whatsAppSignupAttempt.findUniqueOrThrow({ where: { id } });
  if (attempt.tenantId !== input.tenantId || attempt.inputHash !== inputHash) {
    throw appError("BAD_REQUEST", "whatsapp.signupRestart");
  }
  if (attempt.completedAt) {
    const tenant = await db.tenant.findUnique({ where: { id: input.tenantId }, select: { metaPhoneNumberId: true } });
    if (tenant?.metaPhoneNumberId !== attempt.phoneNumberId) throw appError("BAD_REQUEST", "whatsapp.signupRestart");
    return; // Lost HTTP response: acknowledge without pausing or resetting sync again.
  }
  const leaseOwner = randomUUID();
  const claim = await db.whatsAppSignupAttempt.updateMany({
    where: { id, completedAt: null, expiresAt: { gt: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseOwner, leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (claim.count !== 1) throw appError("CONFLICT", "whatsapp.signupBusy");
  const owned = () => ({ id, leaseOwner, leaseUntil: { gt: new Date() }, expiresAt: { gt: new Date() } });
  try {
    // Read after acquiring: a previous worker may have saved the token meanwhile.
    const current = await db.whatsAppSignupAttempt.findUniqueOrThrow({ where: { id } });
    await connect({
      accessToken: current.encryptedToken ? decrypt(current.encryptedToken) : undefined,
      saveAccessToken: async token => {
        const saved = await db.whatsAppSignupAttempt.updateMany({ where: owned(), data: { encryptedToken: encrypt(token) } });
        if (saved.count !== 1) throw appError("CONFLICT", "whatsapp.signupRestart");
      },
      complete: async (tx, phoneNumberId) => {
        // The fence and tenant credentials commit together, or both roll back.
        const saved = await tx.whatsAppSignupAttempt.updateMany({
          where: owned(), data: { completedAt: new Date(), encryptedToken: null, phoneNumberId },
        });
        if (saved.count !== 1) throw appError("CONFLICT", "whatsapp.signupRestart");
      },
    });
  } finally {
    // Do not replace a successful commit/error with a cleanup failure. The lease expires.
    await db.whatsAppSignupAttempt.updateMany({ where: { id, leaseOwner }, data: { leaseUntil: null, leaseOwner: null } }).catch(() => undefined);
  }
}
