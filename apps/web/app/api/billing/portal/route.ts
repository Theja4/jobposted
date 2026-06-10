import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCreemPortalSession } from "@/lib/payments/creem";

export const runtime = "nodejs";

/** Open the Creem customer portal so the user can manage / cancel their subscription. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("external_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = sub?.external_customer_id as string | undefined;
  if (!customerId) {
    return NextResponse.json({ ok: false, error: "No active subscription." }, { status: 404 });
  }

  const result = await createCreemPortalSession(customerId);
  if (result.error || !result.url) {
    return NextResponse.json({ ok: false, error: result.error ?? "Portal failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
