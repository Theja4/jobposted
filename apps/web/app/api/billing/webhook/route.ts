import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  BILLING_PLANS,
  normalizeBillingStatus,
  parsePlan,
  type BillingPlanId,
} from "@/lib/billing/plans";

export const runtime = "nodejs";

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function idFrom(value: unknown) {
  if (typeof value === "string") return value.trim();
  const record = rec(value);
  return str(record.id);
}

function planFromCreemProduct(value: unknown): BillingPlanId | null {
  const productId = idFrom(value);
  if (!productId) return null;
  if (productId === process.env.CREEM_STARTER_20_PRODUCT_ID) return "starter_20";
  if (productId === process.env.CREEM_PRO_50_PRODUCT_ID) return "pro_50";
  return null;
}

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

function normalizedEvent(payload: unknown) {
  const root = rec(payload);
  const data = rec(root.object ?? root.data ?? root.subscription ?? root);
  const subscription = rec(data.subscription);
  const order = rec(data.order);
  const product = data.product ?? subscription.product;
  const metadata = {
    ...rec(root.metadata),
    ...rec(data.metadata),
    ...rec(subscription.metadata),
  };
  const plan =
    parsePlan(data.plan) ??
    parsePlan(data.plan_id) ??
    parsePlan(subscription.plan) ??
    parsePlan(subscription.plan_id) ??
    parsePlan(metadata.plan) ??
    parsePlan(metadata.plan_id) ??
    planFromCreemProduct(product);
  const userId =
    str(data.user_id) ||
    str(data.userId) ||
    str(data.client_reference_id) ||
    str(data.clientReferenceId) ||
    str(metadata.user_id) ||
    str(metadata.userId) ||
    str(metadata.client_reference_id) ||
    str(metadata.clientReferenceId) ||
    str(metadata.referenceId) ||
    str(metadata.internal_customer_id);
  const eventType = str(root.eventType) || str(root.type);
  const status =
    eventType === "subscription.canceled" || eventType === "subscription.expired"
      ? "canceled"
      : normalizeBillingStatus(data.status ?? subscription.status ?? order.status ?? eventType);
  const customer = data.customer ?? subscription.customer ?? order.customer;
  const subscriptionId = data.subscription ?? subscription;

  return {
    userId,
    plan,
    status,
    provider: str(root.provider) || str(data.provider) || "creem",
    providerCustomerId: str(data.customer_id) || str(data.customerId) || idFrom(customer),
    providerSubscriptionId:
      str(data.subscription_id) ||
      str(data.subscriptionId) ||
      idFrom(subscriptionId) ||
      str(data.id),
    currentPeriodEnd:
      str(data.current_period_end) ||
      str(data.currentPeriodEnd) ||
      str(data.current_period_end_date) ||
      str(data.currentPeriodEndDate) ||
      str(subscription.current_period_end_date) ||
      str(subscription.currentPeriodEndDate) ||
      null,
  };
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
  const event = normalizedEvent(payload);
  if (!event.userId || !event.plan) {
    return NextResponse.json({ ok: false, error: "missing_user_or_plan" }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "service_role_not_configured" }, { status: 503 });
  }

  const plan = event.plan as BillingPlanId;
  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: event.userId,
      provider: event.provider,
      plan,
      daily_limit: BILLING_PLANS[plan].dailyLimit,
      status: event.status,
      provider_customer_id: event.providerCustomerId || null,
      provider_subscription_id: event.providerSubscriptionId || null,
      current_period_end: event.currentPeriodEnd,
      renews_at: event.currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("billing webhook upsert failed", error);
    return NextResponse.json({ ok: false, error: "webhook_save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
