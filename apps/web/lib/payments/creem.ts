import "server-only";

import crypto from "node:crypto";

/**
 * Creem integration — merchant-of-record, SDK-free (crypto + fetch).
 *   Checkout: POST {base}/checkouts  (x-api-key) → { checkout_url }
 *   Webhooks: header `creem-signature` = HMAC-SHA256(secret, rawBody) in hex
 *   Portal:   POST {base}/customers/billing → customer portal link
 */

function creemApiBase(): string {
  return process.env.CREEM_ENVIRONMENT === "test"
    ? "https://test-api.creem.io/v1"
    : "https://api.creem.io/v1";
}

export interface CheckoutResult {
  url?: string;
  error?: string;
}

/** Create a hosted Creem checkout. `metadata.user_id` links the webhook back to the user. */
export async function createCreemCheckout(params: {
  productId: string;
  userId: string;
  email?: string | null;
  successUrl: string;
}): Promise<CheckoutResult> {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) return { error: "Billing is not configured yet." };

  try {
    const res = await fetch(`${creemApiBase()}/checkouts`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: params.productId,
        success_url: params.successUrl,
        request_id: params.userId,
        ...(params.email ? { customer: { email: params.email } } : {}),
        metadata: { user_id: params.userId },
      }),
    });
    if (!res.ok) {
      console.error("[creem] checkout failed", res.status, await res.text());
      return { error: "Couldn't start checkout. Try again." };
    }
    const data = (await res.json()) as { checkout_url?: string };
    return data.checkout_url ? { url: data.checkout_url } : { error: "No checkout URL returned." };
  } catch (err) {
    console.error("[creem] checkout error", err);
    return { error: "Couldn't reach the payment provider." };
  }
}

/** Open the Creem customer portal so the user can manage / cancel. */
export async function createCreemPortalSession(customerId: string): Promise<CheckoutResult> {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) return { error: "Billing is not configured yet." };
  try {
    const res = await fetch(`${creemApiBase()}/customers/billing`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId }),
    });
    if (!res.ok) return { error: "Couldn't open the billing portal." };
    const data = (await res.json()) as { customer_portal_link?: string; url?: string };
    const url = data.customer_portal_link ?? data.url;
    return url ? { url } : { error: "No portal URL." };
  } catch {
    return { error: "Couldn't reach the payment provider." };
  }
}

/** Verify a Creem webhook: HMAC-SHA256 (hex) of the raw body vs the creem-signature header. */
export function verifyCreemWebhookSignature(params: {
  rawBody: string;
  signature: string | null;
  secret: string;
}): boolean {
  const { rawBody, signature, secret } = params;
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Compute a Creem-style signature (used in tests + reference). */
export function signCreemPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
