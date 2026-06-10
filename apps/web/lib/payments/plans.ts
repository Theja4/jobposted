import { PLANS, type Plan } from "@jobposted/shared";

/** Billing view of a plan: shared price/limit + the Creem product id from env. */
export interface PlanBilling {
  plan: Plan;
  name: string;
  priceUsd: number;
  dailyLimit: number;
  creemProductId: string | undefined;
}

export function planBilling(plan: Plan): PlanBilling {
  const info = PLANS[plan];
  const creemProductId =
    plan === "starter_20"
      ? process.env.CREEM_STARTER_PRODUCT_ID
      : process.env.CREEM_PRO_PRODUCT_ID;
  return { plan, name: info.name, priceUsd: info.priceUsd, dailyLimit: info.dailyLimit, creemProductId };
}

/** Map a Creem product id back to a plan (used by the webhook). */
export function planFromCreemProductId(productId: string | null | undefined): Plan | null {
  if (!productId) return null;
  if (productId === process.env.CREEM_STARTER_PRODUCT_ID) return "starter_20";
  if (productId === process.env.CREEM_PRO_PRODUCT_ID) return "pro_50";
  return null;
}

/** True once Creem checkout is fully configured (graceful "coming soon" otherwise). */
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.CREEM_API_KEY &&
      process.env.CREEM_STARTER_PRODUCT_ID &&
      process.env.CREEM_PRO_PRODUCT_ID,
  );
}
