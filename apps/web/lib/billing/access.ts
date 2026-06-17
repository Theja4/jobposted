import "server-only";

import { NextResponse } from "next/server";
import { normalizeBillingStatus } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaScopedClient = { from: (table: string) => any };

type SubscriptionStatusRow = {
  status: string | null;
};

export async function hasActiveSubscription(supabase: SchemaScopedClient, userId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  const row = (data ?? null) as SubscriptionStatusRow | null;
  return normalizeBillingStatus(row?.status) === "active";
}

export function proRequiredResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "subscription_required",
      message: "This feature requires an active JobPosted plan.",
    },
    { status: 402 },
  );
}

export async function requireProApi(supabase: SchemaScopedClient, userId: string) {
  return (await hasActiveSubscription(supabase, userId)) ? null : proRequiredResponse();
}
