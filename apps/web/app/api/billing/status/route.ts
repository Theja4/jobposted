import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUsageStatus } from "@/lib/billing/limits";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const usage = await getUsageStatus(supabase, user.id);
    return NextResponse.json({ ok: true, usage });
  } catch (error) {
    console.error("billing status failed", error);
    return NextResponse.json({ ok: false, error: "billing_status_failed" }, { status: 500 });
  }
}
