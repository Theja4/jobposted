import "server-only";

/** Payment providers. Creem is the merchant of record; Razorpay (India) is a future add. */
export type PaymentProvider = "creem" | "razorpay";

/**
 * Geo → provider. India will route to Razorpay once it's wired; until then all checkouts use
 * Creem. The split lives here so adding Razorpay is a one-line change.
 */
export function chooseProvider(_countryCode?: string | null): PaymentProvider {
  return "creem";
}
