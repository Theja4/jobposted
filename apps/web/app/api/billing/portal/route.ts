import { NextResponse } from "next/server";
import { creemApiBase, readCreemUrl } from "@/lib/billing/creem";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "creem_api_key_missing",
        message: "Billing portal is not configured yet. Contact support for cancellation or billing help.",
      },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("provider_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "subscription_lookup_failed" }, { status: 500 });
  }

  const customerId =
    typeof subscription?.provider_customer_id === "string" ? subscription.provider_customer_id.trim() : "";

  if (!customerId) {
    return NextResponse.json(
      {
        ok: false,
        error: "customer_portal_unavailable",
        message: "Billing portal becomes available after your first paid checkout.",
      },
      { status: 404 },
    );
  }

  const response = await fetch(`${creemApiBase()}/v1/customers/billing`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ customer_id: customerId }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: "portal_create_failed", message: "Could not open billing portal." },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
    );
  }

  const url = readCreemUrl(payload);
  if (!url) {
    return NextResponse.json({ ok: false, error: "portal_url_missing" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, url });
}
