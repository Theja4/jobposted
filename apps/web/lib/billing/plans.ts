export type BillingPlanId = "starter_20" | "pro_50";

export type BillingStatus = "trialing" | "active" | "past_due" | "canceled";

export type BillingPlan = {
  id: BillingPlanId;
  label: string;
  dailyLimit: number;
  checkoutEnv: string;
};

export const TRIAL_APPLICATIONS = 5;
export const TRIAL_DAILY_LIMIT = 5;

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  starter_20: {
    id: "starter_20",
    label: "Starter",
    dailyLimit: 20,
    checkoutEnv: "CHECKOUT_STARTER_20_URL",
  },
  pro_50: {
    id: "pro_50",
    label: "Pro",
    dailyLimit: 50,
    checkoutEnv: "CHECKOUT_PRO_50_URL",
  },
};

export function parsePlan(value: unknown): BillingPlanId | null {
  return value === "starter_20" || value === "pro_50" ? value : null;
}

export function planFor(value: unknown): BillingPlan | null {
  const plan = parsePlan(value);
  return plan ? BILLING_PLANS[plan] : null;
}

export function normalizeBillingStatus(value: unknown): BillingStatus {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status === "active" || status === "paid" || status === "completed") return "active";
  if (status === "trialing" || status === "trial") return "trialing";
  if (status === "past_due" || status === "past-due" || status === "failed") return "past_due";
  if (status === "canceled" || status === "cancelled" || status === "deleted") return "canceled";
  return "canceled";
}
