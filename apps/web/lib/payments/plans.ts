import { PLANS, type Plan } from "@jobposted/shared";

/** Billing view of a plan: shared price/limit + the provider product id from env. */
export interface PlanBilling {
  plan: Plan;
  name: string;
  priceUsd: number;
  dailyLimit: number;
  polarProductId: string | undefined;
}

export function planBilling(plan: Plan): PlanBilling {
  const info = PLANS[plan];
  const polarProductId =
    plan === "starter_20"
      ? process.env.POLAR_STARTER_PRODUCT_ID
      : process.env.POLAR_PRO_PRODUCT_ID;
  return { plan, name: info.name, priceUsd: info.priceUsd, dailyLimit: info.dailyLimit, polarProductId };
}

/** Map a Polar product id back to a plan (used by the webhook). */
export function planFromPolarProductId(productId: string | null | undefined): Plan | null {
  if (!productId) return null;
  if (productId === process.env.POLAR_STARTER_PRODUCT_ID) return "starter_20";
  if (productId === process.env.POLAR_PRO_PRODUCT_ID) return "pro_50";
  return null;
}

/** True once Polar checkout is fully configured (graceful "coming soon" otherwise). */
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.POLAR_ACCESS_TOKEN &&
      process.env.POLAR_STARTER_PRODUCT_ID &&
      process.env.POLAR_PRO_PRODUCT_ID,
  );
}
