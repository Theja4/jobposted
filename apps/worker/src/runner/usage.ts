export type BillingPlanId = "jobposted_20";
export type BillingStatus = "trialing" | "active" | "past_due" | "canceled";

export type SubscriptionSnapshot = {
  plan: BillingPlanId | null;
  status: BillingStatus | string | null;
  dailyLimit: number | null;
  trialApplicationsUsed?: number | null;
};

export type UsageInput = {
  subscription: SubscriptionSnapshot | null;
  totalSubmitted: number;
  todaySubmitted: number;
};

export type UsageStatus = {
  plan: BillingPlanId;
  status: BillingStatus;
  dailyLimit: number;
  todaySubmitted: number;
  totalSubmitted: number;
  canSubmit: boolean;
  reason: "ok" | "daily_limit_reached" | "subscription_inactive";
};

export const CURRENT_BILLING_PLAN_ID: BillingPlanId = "jobposted_20";
const PLAN_DAILY_LIMITS: Record<BillingPlanId, number> = { jobposted_20: 20 };

export function parsePlan(value: unknown): BillingPlanId | null {
  if (value === "jobposted_20" || value === "starter_20" || value === "pro_50") return CURRENT_BILLING_PLAN_ID;
  return null;
}

function normalizedStatus(value: SubscriptionSnapshot | null): BillingStatus {
  const status = typeof value?.status === "string" ? value.status.trim().toLowerCase() : "";
  if (status === "active" || status === "paid" || status === "completed") return "active";
  if (status === "trialing" || status === "trial") return "trialing";
  if (status === "past_due" || status === "past-due" || status === "failed") return "past_due";
  if (status === "canceled" || status === "cancelled" || status === "deleted") return "canceled";
  return "canceled";
}

export function computeUsageStatus(input: UsageInput): UsageStatus {
  const subscription = input.subscription;
  const status = normalizedStatus(subscription);
  const plan = subscription?.plan && PLAN_DAILY_LIMITS[subscription.plan] ? subscription.plan : CURRENT_BILLING_PLAN_ID;
  const planLimit = PLAN_DAILY_LIMITS[plan];
  const dailyLimit = planLimit;

  if (status !== "active") {
    return {
      plan,
      status,
      dailyLimit,
      todaySubmitted: input.todaySubmitted,
      totalSubmitted: input.totalSubmitted,
      canSubmit: false,
      reason: "subscription_inactive",
    };
  }

  if (input.todaySubmitted >= dailyLimit) {
    return {
      plan,
      status,
      dailyLimit,
      todaySubmitted: input.todaySubmitted,
      totalSubmitted: input.totalSubmitted,
      canSubmit: false,
      reason: "daily_limit_reached",
    };
  }

  return {
    plan,
    status,
    dailyLimit,
    todaySubmitted: input.todaySubmitted,
    totalSubmitted: input.totalSubmitted,
    canSubmit: true,
    reason: "ok",
  };
}
