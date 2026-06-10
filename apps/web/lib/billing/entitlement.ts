import "server-only";

import { TRIAL_APPLICATION_LIMIT, type Plan } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Entitlement {
  /** trial = no active paid sub; otherwise the subscription status. */
  status: "trial" | "active" | "past_due" | "canceled";
  plan: Plan | null;
  isTrial: boolean;
  trialUsed: number; // total applications (counts toward the 5-app trial)
  trialLimit: number;
  dailyLimit: number; // applies once subscribed
  submittedToday: number;
  /** Whether the user may queue another application right now. */
  canQueue: boolean;
  reason: "trial_exhausted" | null;
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Compute a user's apply entitlement (design doc §12, §23.7). Trial users get
 * TRIAL_APPLICATION_LIMIT total applications free; subscribers are gated by their plan's daily
 * limit (enforced at submit time by the worker). Reads the user's own rows (RLS).
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const supabase = await createSupabaseServerClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan, daily_limit, status")
    .eq("user_id", userId)
    .maybeSingle();

  const { count: totalApps } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: submittedToday } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("submitted_at", startOfTodayISO());

  const trialUsed = totalApps ?? 0;
  const today = submittedToday ?? 0;
  const plan = (sub?.plan as Plan | undefined) ?? null;
  const isActive = sub?.status === "active";

  if (isActive) {
    return {
      status: "active",
      plan,
      isTrial: false,
      trialUsed,
      trialLimit: TRIAL_APPLICATION_LIMIT,
      dailyLimit: sub?.daily_limit ?? 0,
      submittedToday: today,
      canQueue: true,
      reason: null,
    };
  }

  const canQueue = trialUsed < TRIAL_APPLICATION_LIMIT;
  return {
    status: (sub?.status as Entitlement["status"]) ?? "trial",
    plan,
    isTrial: true,
    trialUsed,
    trialLimit: TRIAL_APPLICATION_LIMIT,
    dailyLimit: sub?.daily_limit ?? 0,
    submittedToday: today,
    canQueue,
    reason: canQueue ? null : "trial_exhausted",
  };
}
