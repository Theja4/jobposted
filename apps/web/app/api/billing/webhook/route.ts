import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  JOBPOSTED_SHARED_PROFILE_PROVIDER,
  isRezoomedProfileProEntitled,
} from "@/lib/billing/entitlements";
import { normalizedBillingWebhookEvent } from "@/lib/billing/webhook";
import {
  BILLING_PLANS,
  normalizeBillingStatus,
  type BillingPlanId,
} from "@/lib/billing/plans";

export const runtime = "nodejs";

function verifySignature(rawBody: string, signature: string | null): { ok: true } | { ok: false; error: string; status: number } {
  const secret = process.env.BILLING_WEBHOOK_SECRET || process.env.CREEM_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, error: "webhook_secret_missing", status: 503 };
  }
  if (!signature) return { ok: false, error: "missing_signature", status: 401 };
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  const ok =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
  return ok ? { ok: true } : { ok: false, error: "bad_signature", status: 401 };
}

type NormalizedBillingEvent = ReturnType<typeof normalizedBillingWebhookEvent>;

async function authEmailForUser(supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>, userId: string) {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

async function syncSharedProfileSubscription(
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  event: NormalizedBillingEvent,
) {
  const publicProfiles = supabase.schema("public").from("profiles");
  const { data: existing, error: readError } = await publicProfiles
    .select("id,email,plan,subscription_status,current_period_end,payment_provider")
    .eq("id", event.userId)
    .maybeSingle();

  if (readError) return readError;

  const existingProfile = (existing ?? null) as {
    id?: string | null;
    email?: string | null;
    plan?: string | null;
    subscription_status?: string | null;
    current_period_end?: string | null;
    payment_provider?: string | null;
  } | null;
  const eventIsActive = normalizeBillingStatus(event.status) === "active";

  if (eventIsActive) {
    if (
      isRezoomedProfileProEntitled(existingProfile) &&
      existingProfile?.payment_provider !== JOBPOSTED_SHARED_PROFILE_PROVIDER
    ) {
      return null;
    }

    const payload: Record<string, unknown> = {
      id: event.userId,
      plan: "pro",
      subscription_status: event.status,
      payment_provider: JOBPOSTED_SHARED_PROFILE_PROVIDER,
      current_period_end: event.currentPeriodEnd,
    };

    if (!existingProfile?.id) {
      payload.email = await authEmailForUser(supabase, event.userId);
    }

    const { error } = await publicProfiles.upsert(payload, { onConflict: "id" });
    return error ?? null;
  }

  if (existingProfile?.payment_provider !== JOBPOSTED_SHARED_PROFILE_PROVIDER) {
    return null;
  }

  const { error } = await publicProfiles
    .update({
      plan: "free",
      subscription_status: event.status,
      payment_provider: null,
      current_period_end: event.currentPeriodEnd,
    })
    .eq("id", event.userId);
  return error ?? null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-jobposted-signature") ||
    request.headers.get("x-webhook-signature") ||
    request.headers.get("creem-signature") ||
    request.headers.get("x-polar-signature") ||
    request.headers.get("x-razorpay-signature");

  const signatureResult = verifySignature(rawBody, signature);
  if (!signatureResult.ok) {
    return NextResponse.json(
      { ok: false, error: signatureResult.error },
      { status: signatureResult.status },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const event = normalizedBillingWebhookEvent(payload);
  if (!event.userId || !event.plan) {
    return NextResponse.json({ ok: false, error: "missing_user_or_plan" }, { status: 400 });
  }
  if (!event.eventOccurredAt) {
    return NextResponse.json({ ok: false, error: "missing_event_timestamp" }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "service_role_not_configured" }, { status: 503 });
  }

  const plan = event.plan as BillingPlanId;
  const { data: subscriptionApplied, error } = await supabase.rpc("upsert_subscription_from_webhook", {
    p_user_id: event.userId,
    p_provider: event.provider,
    p_plan: plan,
    p_daily_limit: BILLING_PLANS[plan].dailyLimit,
    p_status: event.status,
    p_provider_customer_id: event.providerCustomerId || null,
    p_provider_subscription_id: event.providerSubscriptionId || null,
    p_current_period_end: event.currentPeriodEnd,
    p_billing_event_at: event.eventOccurredAt,
  });

  if (error) {
    console.error("billing webhook upsert failed", error);
    return NextResponse.json({ ok: false, error: "webhook_save_failed" }, { status: 500 });
  }

  if (!subscriptionApplied) {
    return NextResponse.json({
      ok: true,
      skipped: "stale_billing_event",
    });
  }

  const sharedProfileError = await syncSharedProfileSubscription(supabase, event);
  if (sharedProfileError) {
    console.error("shared billing profile sync failed", sharedProfileError);
    return NextResponse.json({ ok: false, error: "shared_profile_sync_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
