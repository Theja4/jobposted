import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BILLING_REGIONS,
  CURRENT_BILLING_PLAN_ID,
  billingRegionForCountry,
  parseTenure,
  planFor,
  type BillingPlanId,
  type BillingTenure,
} from "@/lib/billing/plans";
import {
  creemApiBase,
  creemApiKey,
  creemProductIdForCheckout,
  readCreemUrl,
} from "@/lib/billing/creem";
import { absoluteUrl } from "@/lib/site";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    plan?: BillingPlanId;
    tenure?: BillingTenure;
  } | null;
  const plan = planFor(body?.plan ?? CURRENT_BILLING_PLAN_ID);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }
  const tenure = parseTenure(body?.tenure) ?? "monthly";
  const countryCode = request.headers.get("x-vercel-ip-country");
  const region = billingRegionForCountry(countryCode);

  const successUrl = absoluteUrl(`/checkout/success?plan=${plan.id}&tenure=${tenure}`);
  const cancelUrl = absoluteUrl("/dashboard?checkout=cancelled");
  const apiKey = creemApiKey();
  const productId = creemProductIdForCheckout({ plan, tenure, countryCode });
  const legacyCheckoutUrl =
    tenure === "monthly"
      ? process.env[plan.checkoutEnv]?.trim()
      : process.env.CHECKOUT_QUARTERLY_URL?.trim();

  if (apiKey && productId) {
    const requestId = `jobposted:${user.id}:${plan.id}:${tenure}:${randomUUID()}`;
    const response = await fetch(`${creemApiBase()}/v1/checkouts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        product_id: productId,
        request_id: requestId,
        units: 1,
        success_url: successUrl,
        customer: user.email ? { email: user.email } : undefined,
        metadata: {
          user_id: user.id,
          userId: user.id,
          client_reference_id: user.id,
          internal_customer_id: user.id,
          plan: plan.id,
          plan_id: plan.id,
          tenure,
          billing_interval: tenure,
          country_code: countryCode?.toUpperCase() || "",
          pricing_region: region,
          currency_code: BILLING_REGIONS[region].currencyCode,
          request_id: requestId,
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      console.error("creem checkout create failed", {
        status: response.status,
        payload,
        plan: plan.id,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "checkout_create_failed",
          message: "Could not create a checkout session. Please try again.",
        },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
      );
    }

    const url = readCreemUrl(payload);
    if (!url) {
      return NextResponse.json({ ok: false, error: "checkout_url_missing" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, url, plan: plan.id });
  }

  if (!legacyCheckoutUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "checkout_not_configured",
        message: `${tenure} checkout is not configured.`,
      },
      { status: 503 },
    );
  }

  const url = new URL(legacyCheckoutUrl);
  url.searchParams.set("client_reference_id", user.id);
  url.searchParams.set("user_id", user.id);
  url.searchParams.set("plan", plan.id);
  url.searchParams.set("tenure", tenure);
  url.searchParams.set("success_url", successUrl);
  url.searchParams.set("cancel_url", cancelUrl);

  return NextResponse.json({ ok: true, url: url.toString(), plan: plan.id });
}
