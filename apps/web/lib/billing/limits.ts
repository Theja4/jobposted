import "server-only";

import { computeUsageStatus, type UsageStatus } from "./usage";
import { parsePlan, type BillingPlanId, type BillingStatus } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaScopedClient = { from: (table: string) => any; rpc?: (fn: string, args?: Record<string, unknown>) => any };

type SubscriptionRow = {
  plan: string | null;
  status: string | null;
  daily_limit: number | null;
  trial_applications_used: number | null;
};

type UsageSnapshotRow = SubscriptionRow & {
  total_submitted: number | null;
  today_submitted: number | null;
};

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function countApplications(
  supabase: SchemaScopedClient,
  userId: string,
  range?: { gte: string; lt: string },
) {
  let query = supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("apply_path", "server")
    .not("submitted_at", "is", null);
  if (range) {
    query = query.gte("submitted_at", range.gte).lt("submitted_at", range.lt);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getUsageStatus(
  supabase: SchemaScopedClient,
  userId: string,
  now = new Date(),
): Promise<UsageStatus> {
  const dayStart = startOfUtcDay(now);
  const nextDay = new Date(dayStart);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  if (typeof supabase.rpc === "function") {
    const { data, error } = await supabase
      .rpc("application_usage_snapshot", {
        p_user_id: userId,
        p_usage_date: dayStart.toISOString().slice(0, 10),
      })
      .maybeSingle();

    if (!error && data) {
      const row = data as UsageSnapshotRow;
      const hasSubscription = Boolean(row.plan || row.status || row.daily_limit || row.trial_applications_used);
      return computeUsageStatus({
        subscription: hasSubscription
          ? {
              plan: parsePlan(row.plan) as BillingPlanId | null,
              status: row.status as BillingStatus | null,
              dailyLimit: row.daily_limit,
              trialApplicationsUsed: row.trial_applications_used,
            }
          : null,
        totalSubmitted: row.total_submitted ?? 0,
        todaySubmitted: row.today_submitted ?? 0,
      });
    }
  }

  const [{ data: subscription }, totalSubmitted, todaySubmitted] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
    countApplications(supabase, userId),
    countApplications(supabase, userId, {
      gte: dayStart.toISOString(),
      lt: nextDay.toISOString(),
    }),
  ]);

  const row = (subscription ?? null) as SubscriptionRow | null;
  return computeUsageStatus({
    subscription: row
      ? {
          plan: parsePlan(row.plan) as BillingPlanId | null,
          status: row.status as BillingStatus | null,
          dailyLimit: row.daily_limit,
          trialApplicationsUsed: row.trial_applications_used,
        }
      : null,
    totalSubmitted,
    todaySubmitted,
  });
}

export function usageLimitMessage(status: UsageStatus) {
  if (status.reason === "daily_limit_reached") {
    return `Daily application limit reached (${status.todaySubmitted}/${status.dailyLimit}).`;
  }
  if (status.reason === "trial_exhausted") {
    return "Your 5 free applications are used. Choose a plan to keep applying.";
  }
  if (status.reason === "subscription_inactive") {
    return "Your subscription is not active. Choose a plan to keep applying.";
  }
  return "Application limit reached.";
}
