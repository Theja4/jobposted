import "server-only";

import crypto from "node:crypto";

/**
 * Polar integration — SDK-free (crypto + fetch), ported from resumeplanet/lib/polar.ts.
 * Webhook signatures follow the Standard Webhooks spec (the same scheme Polar/Svix use).
 */

function polarApiBase(): string {
  return process.env.POLAR_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.polar.sh"
    : "https://api.polar.sh";
}

export interface CheckoutResult {
  url?: string;
  error?: string;
}

/** Create a hosted Polar checkout. `metadata.user_id` links the webhook back to the user. */
export async function createPolarCheckout(params: {
  productId: string;
  userId: string;
  email?: string | null;
  successUrl: string;
}): Promise<CheckoutResult> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return { error: "Billing is not configured yet." };

  try {
    const res = await fetch(`${polarApiBase()}/v1/checkouts/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        products: [params.productId],
        success_url: params.successUrl,
        customer_email: params.email ?? undefined,
        external_customer_id: params.userId,
        metadata: { user_id: params.userId },
      }),
    });
    if (!res.ok) {
      console.error("[polar] checkout failed", res.status, await res.text());
      return { error: "Couldn't start checkout. Try again." };
    }
    const data = (await res.json()) as { url?: string };
    return data.url ? { url: data.url } : { error: "No checkout URL returned." };
  } catch (err) {
    console.error("[polar] checkout error", err);
    return { error: "Couldn't reach the payment provider." };
  }
}

/** Open a Polar customer-portal session so the user can manage / cancel. */
export async function createPolarPortalSession(customerId: string): Promise<CheckoutResult> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return { error: "Billing is not configured yet." };
  try {
    const res = await fetch(`${polarApiBase()}/v1/customer-sessions/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    });
    if (!res.ok) return { error: "Couldn't open the billing portal." };
    const data = (await res.json()) as { customer_portal_url?: string };
    return data.customer_portal_url ? { url: data.customer_portal_url } : { error: "No portal URL." };
  } catch {
    return { error: "Couldn't reach the payment provider." };
  }
}

/**
 * Verify a Polar webhook (Standard Webhooks): HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * with the base64-decoded secret; compare timing-safe against any `v1,<sig>` in the header.
 */
export function verifyPolarWebhookSignature(params: {
  rawBody: string;
  headers: Headers;
  secret: string;
}): boolean {
  const { rawBody, headers, secret } = params;
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  let key: Buffer;
  try {
    const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    key = Buffer.from(raw, "base64");
  } catch {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return signatureHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

/** Build a Standard-Webhooks signature header (used in tests + reference). */
export function signPolarPayload(secret: string, id: string, timestamp: string, body: string): string {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(raw, "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${sig}`;
}
