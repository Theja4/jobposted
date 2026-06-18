import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeBillingStatus } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SchemaScopedClient = {
  from: (table: string) => any;
  schema?: (schema: string) => SchemaScopedClient;
};

export const JOBPOSTED_SHARED_PROFILE_PROVIDER = "jobposted";

type JobPostedSubscriptionRow = {
  plan?: string | null;
  status?: string | null;
};

type RezoomedProfileBillingRow = {
  plan?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
  payment_provider?: string | null;
};

export type BundledProSource = "jobposted" | "rezoomed";

export type BundledProEntitlement = {
  active: boolean;
  source: BundledProSource | null;
  plan: string | null;
  status: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function periodStillOpen(value: unknown) {
  const periodEnd = text(value);
  if (!periodEnd) return true;
  const time = Date.parse(periodEnd);
  return Number.isNaN(time) || time > Date.now();
}

export function isRezoomedProfileProEntitled(row: RezoomedProfileBillingRow | null | undefined) {
  if (!row) return false;
  const plan = text(row.plan).toLowerCase();
  const status = text(row.subscription_status).toLowerCase();
  if (plan !== "pro") return false;
  if (normalizeBillingStatus(status) === "active") return true;
  if (status === "manual_grant") return true;
  if (status === "comp_grace_30d") return periodStillOpen(row.current_period_end);
  return false;
}

async function readJobPostedSubscription(
  supabase: SchemaScopedClient,
  userId: string,
): Promise<JobPostedSubscriptionRow | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan,status")
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as JobPostedSubscriptionRow | null;
}

function publicSchemaClient(supabase: SchemaScopedClient): SchemaScopedClient | null {
  const serviceClient = getServiceRoleClient();
  if (typeof serviceClient?.schema === "function") {
    return serviceClient.schema("public") as unknown as SchemaScopedClient;
  }
  if (typeof supabase.schema === "function") return supabase.schema("public");
  return null;
}

export async function readRezoomedProfileBilling(
  supabase: SchemaScopedClient,
  userId: string,
): Promise<RezoomedProfileBillingRow | null> {
  const publicClient = publicSchemaClient(supabase);
  if (!publicClient) return null;
  const { data, error } = await publicClient
    .from("profiles")
    .select("plan,subscription_status,current_period_end,payment_provider")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as RezoomedProfileBillingRow | null;
}

export async function getBundledProEntitlement(
  supabase: SchemaScopedClient,
  userId: string,
): Promise<BundledProEntitlement> {
  const jobPostedSubscription = await readJobPostedSubscription(supabase, userId);
  if (normalizeBillingStatus(jobPostedSubscription?.status) === "active") {
    return {
      active: true,
      source: "jobposted",
      plan: jobPostedSubscription?.plan ?? null,
      status: jobPostedSubscription?.status ?? null,
    };
  }

  const rezoomedProfile = await readRezoomedProfileBilling(supabase, userId);
  if (isRezoomedProfileProEntitled(rezoomedProfile)) {
    return {
      active: true,
      source: "rezoomed",
      plan: rezoomedProfile?.plan ?? null,
      status: rezoomedProfile?.subscription_status ?? null,
    };
  }

  return {
    active: false,
    source: null,
    plan: rezoomedProfile?.plan ?? jobPostedSubscription?.plan ?? null,
    status: rezoomedProfile?.subscription_status ?? jobPostedSubscription?.status ?? null,
  };
}
