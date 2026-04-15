/**
 * Story 7A.2: Service Paystack — init transactions, verify webhooks, manage subscriptions.
 *
 * Paystack API: REST, base https://api.paystack.co/, Auth Bearer {SECRET_KEY}.
 * Aucune dépendance NPM — appels fetch natifs.
 */

import { createHmac, timingSafeEqual } from "crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getSecretKey()}`,
    "Content-Type": "application/json",
  };
}

// --------------- Types ---------------

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackSubscriptionResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    status: string;
    subscription_code: string;
    email_token: string;
    next_payment_date: string;
    plan: {
      plan_code: string;
      name: string;
    };
    authorization: {
      authorization_code: string;
      last4: string;
      channel: string;
    };
    customer: {
      customer_code: string;
      email: string;
    };
  };
}

export interface PaystackChargeAuthResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
  };
}

export interface PaystackManageLinkResponse {
  status: boolean;
  message: string;
  data: {
    link: string;
  };
}

// --------------- API Functions ---------------

/**
 * Initialize a transaction with a Paystack plan code.
 * Used for first subscription — Paystack auto-creates the recurring subscription.
 * @param amountSubunits - Amount in currency subunits (e.g. XOF: FCFA × 100). Required so Paystack validates; plan amount in dashboard must also be in subunits.
 */
export async function initializeTransaction(
  email: string,
  planCode: string,
  metadata: Record<string, unknown>,
  callbackUrl: string,
  amountSubunits: number,
  currency: string = "XOF",
): Promise<PaystackInitResponse> {
  const amount = Math.round(Number(amountSubunits));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error(`Invalid amount for Paystack: must be a positive integer (got ${amountSubunits})`);
  }
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email,
      plan: planCode,
      amount,
      currency,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paystack initializeTransaction failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<PaystackInitResponse>;
}

/**
 * Initialize a one-time transaction (no recurring plan).
 * Used for credit pack purchases.
 */
export async function initializeOneTimeTransaction(
  email: string,
  amountSubunits: number,
  metadata: Record<string, unknown>,
  callbackUrl: string,
  currency: string = "XOF",
): Promise<PaystackInitResponse> {
  const amount = Math.round(Number(amountSubunits));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error(`Invalid amount for Paystack: must be a positive integer (got ${amountSubunits})`);
  }
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email,
      amount,
      currency,
      callback_url: callbackUrl,
      metadata,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paystack initializeOneTimeTransaction failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<PaystackInitResponse>;
}

/**
 * Verify webhook signature (HMAC SHA-512).
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const hash = createHmac("sha512", getSecretKey())
    .update(rawBody)
    .digest("hex");
  // Timing-safe comparison to prevent timing attacks on payment webhooks
  const hashBuf = Buffer.from(hash, "hex");
  const sigBuf = Buffer.from(signature, "hex");
  if (hashBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(hashBuf, sigBuf);
}

/**
 * Get subscription details by subscription code.
 */
export async function getSubscription(
  subscriptionCode: string,
): Promise<PaystackSubscriptionResponse> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/subscription/${subscriptionCode}`,
    { headers: headers() },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paystack getSubscription failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<PaystackSubscriptionResponse>;
}

/**
 * Disable (cancel) a subscription. Paystack won't charge next cycle.
 */
export async function disableSubscription(
  code: string,
  token: string,
): Promise<{ status: boolean; message: string }> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/subscription/disable`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ code, token }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paystack disableSubscription failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<{ status: boolean; message: string }>;
}

/**
 * Generate a manage subscription link (update card page).
 */
export async function generateManageLink(
  subscriptionCode: string,
): Promise<PaystackManageLinkResponse> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/subscription/${subscriptionCode}/manage/link`,
    { headers: headers() },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paystack generateManageLink failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<PaystackManageLinkResponse>;
}

/**
 * Charge an authorization (recurring charge on stored card).
 * Used for overage billing at end of cycle.
 *
 * @param authorizationCode - Card authorization from first payment
 * @param email - Customer email
 * @param amount - Amount in kobo/pesewas (centimes)
 */
export async function chargeAuthorization(
  authorizationCode: string,
  email: string,
  amount: number,
): Promise<PaystackChargeAuthResponse> {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/charge_authorization`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        authorization_code: authorizationCode,
        email,
        amount,
        currency: "XOF",
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paystack chargeAuthorization failed: ${response.status} ${text}`);
  }

  return response.json() as Promise<PaystackChargeAuthResponse>;
}
