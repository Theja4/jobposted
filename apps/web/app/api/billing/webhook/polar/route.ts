import { NextResponse } from "next/server";
import { PLANS } from "@jobposted/shared";
import { verifyPolarWebhookSignature } from "@/lib/payments/polar";
import { planFromPolarProductId } from "@/lib/payments/plans";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Map a Polar event/status to our subscription status. */
function mapStatus(type: string, raw: string | null): string {
  if (/cancel|revoke/.test(type) || raw === "canceled" || raw === "revoked") return "canceled";
  if (raw === "past_due" || raw === "unpaid") return "past_due";
  return "active";
}

/**
 * Polar webhook (design doc §12). Verifies the signature, dedupes via processed_webhooks, and
 * upserts jobposted.subscriptions. Mirrors resumeplanet/app/api/polar/webhook.
 */
export async function POST(request: Request) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  const rawBody = await request.text();

  if (!secret || !verifyPolarWebhookSignature({ rawBody, headers: request.headers, secret })) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 500 });

  let event: Rec;
  try {
    event = rec(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  // Idempotency: a webhook-id is processed at most once.
  const eventId = request.headers.get("webhook-id");
  if (eventId) {
    const { error } = await admin
      .from("processed_webhooks")
      .insert({ provider: "polar", event_id: eventId });
    if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  }

  const type = str(event.type) ?? "";
  const data = rec(event.data);
  const metadata = rec(data.metadata);
  const customer = rec(data.customer);
  const product = rec(data.product);

  const userId =
    str(metadata.user_id) ??
    str(customer.external_id) ??
    str(data.external_customer_id) ??
    str(data.customer_external_id);
  const productId = str(data.product_id) ?? str(product.id);
  const plan = planFromPolarProductId(productId);

  // Only act on subscription/order lifecycle events that carry a user.
  if (userId && (type.startsWith("subscription.") || type === "order.paid")) {
    const row: Rec = {
      user_id: userId,
      provider: "polar",
      status: mapStatus(type, str(data.status)),
      external_subscription_id: str(data.id) ?? str(data.subscription_id),
      external_customer_id: str(data.customer_id) ?? str(customer.id),
      current_period_end: str(data.current_period_end) ?? str(data.ends_at),
    };
    if (plan) {
      row.plan = plan;
      row.daily_limit = PLANS[plan].dailyLimit;
    }
    const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (error) {
      console.error("[polar webhook] upsert failed", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
