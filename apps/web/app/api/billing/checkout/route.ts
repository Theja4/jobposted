import { NextResponse } from "next/server";
import type { Plan } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isBillingConfigured, planBilling } from "@/lib/payments/plans";
import { createCreemCheckout } from "@/lib/payments/creem";
import { getSiteUrl } from "@/lib/site";

export const runtime = "nodejs";

const VALID_PLANS: Plan[] = ["starter_20", "pro_50"];

/** Start a Creem checkout for the signed-in user (design doc §12). */
export async function POST(request: Request) {
  let plan: unknown;
  try {
    ({ plan } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (typeof plan !== "string" || !VALID_PLANS.includes(plan as Plan)) {
    return NextResponse.json({ ok: false, error: "Invalid plan" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Billing isn't set up yet." },
      { status: 503 },
    );
  }

  const billing = planBilling(plan as Plan);
  if (!billing.creemProductId) {
    return NextResponse.json({ ok: false, error: "Plan not available." }, { status: 503 });
  }

  const successUrl = `${getSiteUrl()}/dashboard/billing?status=success`;
  const result = await createCreemCheckout({
    productId: billing.creemProductId,
    userId: user.id,
    email: user.email,
    successUrl,
  });
  if (result.error || !result.url) {
    return NextResponse.json({ ok: false, error: result.error ?? "Checkout failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
