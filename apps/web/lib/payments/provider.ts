import "server-only";

/** Payment providers. Razorpay (India) is deferred — everything routes to Polar for now. */
export type PaymentProvider = "polar" | "razorpay";

/**
 * Geo → provider. India will route to Razorpay once it's wired; until then all checkouts use
 * Polar. The split lives here so adding Razorpay is a one-line change.
 */
export function chooseProvider(_countryCode?: string | null): PaymentProvider {
  return "polar";
}
