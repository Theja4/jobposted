import { NextResponse } from "next/server";
import { PLANS } from "@jobposted/shared";
import { verifyCreemWebhookSignature } from "@/lib/payments/creem";
import { planFromCreemProductId } from "@/lib/payments/plans";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
/** id field that may be a string or an object with an `id`. */
const idOf = (v: unknown): string | null => str(v) ?? str(rec(v).id);

function mapStatus(type: string, raw: string | null): string {
  if (/cancel|expire/.test(type) || raw === "canceled" || raw === "expired") return "canceled";
  if (/past_due/.test(type) || raw === "past_due" || raw === "unpaid") return "past_due";
  return "active";
}

/**
 * Creem webhook (design doc §12). Verifies the `creem-signature` HMAC, dedupes via
 * processed_webhooks, and upserts jobposted.subscriptions.
 */
export async function POST(request: Request) {
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  const rawBody = await request.text();
  const signature = request.headers.get("creem-signature");

  if (!secret || !verifyCreemWebhookSignature({ rawBody, signature, secret })) {
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

  // Idempotency on the event id.
  const eventId = str(event.id);
  if (eventId) {
    const { error } = await admin
      .from("processed_webhooks")
      .insert({ provider: "creem", event_id: eventId });
    if (error?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  }

  const type = str(event.eventType) ?? str(event.type) ?? "";
  const object = rec(event.object);
  const sub = rec(object.subscription); // checkout.completed nests the subscription
  const metadata = rec(object.metadata).user_id ? rec(object.metadata) : rec(sub.metadata);

  const userId = str(metadata.user_id) ?? str(object.request_id) ?? str(sub.request_id);
  const productId = idOf(object.product) ?? idOf(sub.product);
  const plan = planFromCreemProductId(productId);

  if (userId && (type.startsWith("subscription.") || type === "checkout.completed")) {
    const row: Rec = {
      user_id: userId,
      provider: "creem",
      status: mapStatus(type, str(object.status) ?? str(sub.status)),
      external_subscription_id: idOf(object.subscription) ?? str(object.id),
      external_customer_id: idOf(object.customer) ?? idOf(sub.customer),
      current_period_end: str(object.current_period_end_date) ?? str(sub.current_period_end_date),
    };
    if (plan) {
      row.plan = plan;
      row.daily_limit = PLANS[plan].dailyLimit;
    }
    const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
    if (error) {
      console.error("[creem webhook] upsert failed", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
