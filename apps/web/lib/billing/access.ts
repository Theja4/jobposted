import "server-only";

import { NextResponse } from "next/server";
import { getBundledProEntitlement, type SchemaScopedClient } from "./entitlements";

export async function hasActiveSubscription(supabase: SchemaScopedClient, userId: string) {
  return (await getBundledProEntitlement(supabase, userId)).active;
}

export function proRequiredResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "subscription_required",
      message: "This feature requires an active Pro plan.",
    },
    { status: 402 },
  );
}

export async function requireProApi(supabase: SchemaScopedClient, userId: string) {
  return (await hasActiveSubscription(supabase, userId)) ? null : proRequiredResponse();
}
