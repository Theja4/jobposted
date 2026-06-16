import {
  BILLING_PLANS,
  TRIAL_APPLICATIONS,
  TRIAL_DAILY_LIMIT,
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
  plan: BillingPlanId | "trial";
  status: BillingStatus;
  dailyLimit: number;
  todaySubmitted: number;
  totalSubmitted: number;
  trialRemaining: number;
  canSubmit: boolean;
  reason: "ok" | "trial_exhausted" | "daily_limit_reached" | "subscription_inactive";
};

function normalizedStatus(value: SubscriptionSnapshot | null): BillingStatus {
  const status = value?.status;
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled") {
    return status;
  }
  return value ? "canceled" : "trialing";
}

export function computeUsageStatus(input: UsageInput): UsageStatus {
  const subscription = input.subscription;
  const status = normalizedStatus(subscription);
  const plan = subscription?.plan && BILLING_PLANS[subscription.plan] ? subscription.plan : "trial";
  const planLimit = plan === "trial" ? TRIAL_DAILY_LIMIT : BILLING_PLANS[plan].dailyLimit;
  const dailyLimit = subscription?.dailyLimit ?? planLimit;
  const trialUsed = Math.max(input.totalSubmitted, subscription?.trialApplicationsUsed ?? 0);
  const trialRemaining = Math.max(0, TRIAL_APPLICATIONS - trialUsed);

  if (status !== "active" && status !== "trialing") {
    return {
      plan,
      status,
      dailyLimit,
      todaySubmitted: input.todaySubmitted,
      totalSubmitted: input.totalSubmitted,
      trialRemaining,
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
      trialRemaining,
      canSubmit: false,
      reason: "daily_limit_reached",
    };
  }

  if (plan === "trial" && trialRemaining <= 0) {
    return {
      plan,
      status,
      dailyLimit,
      todaySubmitted: input.todaySubmitted,
      totalSubmitted: input.totalSubmitted,
      trialRemaining,
      canSubmit: false,
      reason: "trial_exhausted",
    };
  }

  return {
    plan,
    status,
    dailyLimit,
    todaySubmitted: input.todaySubmitted,
    totalSubmitted: input.totalSubmitted,
    trialRemaining,
    canSubmit: true,
    reason: "ok",
  };
}
