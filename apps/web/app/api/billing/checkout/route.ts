import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { planFor, type BillingPlanId } from "@/lib/billing/plans";

export const runtime = "nodejs";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { plan?: BillingPlanId } | null;
  const plan = planFor(body?.plan);
  if (!plan) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  const configuredUrl = process.env[plan.checkoutEnv];
  if (!configuredUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "checkout_not_configured",
        message: `${plan.checkoutEnv} is not configured.`,
      },
      { status: 503 },
    );
  }

  const url = new URL(configuredUrl);
  url.searchParams.set("client_reference_id", user.id);
  url.searchParams.set("user_id", user.id);
  url.searchParams.set("plan", plan.id);
  url.searchParams.set("success_url", `${siteUrl()}/dashboard?checkout=success`);
  url.searchParams.set("cancel_url", `${siteUrl()}/dashboard?checkout=cancelled`);

  return NextResponse.json({ ok: true, url: url.toString(), plan: plan.id });
}
