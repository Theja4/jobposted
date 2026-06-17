import {
  BILLING_PLANS,
  CURRENT_BILLING_PLAN_ID,
  normalizeBillingStatus,
  type BillingPlanId,
  type BillingStatus,
} from "./plans";

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

function normalizedStatus(value: SubscriptionSnapshot | null): BillingStatus {
  return value ? normalizeBillingStatus(value.status) : "canceled";
}

export function computeUsageStatus(input: UsageInput): UsageStatus {
  const subscription = input.subscription;
  const status = normalizedStatus(subscription);
  const plan = subscription?.plan && BILLING_PLANS[subscription.plan] ? subscription.plan : CURRENT_BILLING_PLAN_ID;
  const planLimit = BILLING_PLANS[plan].dailyLimit;
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
