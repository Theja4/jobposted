import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import { requireProApi } from "@/lib/billing/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function utcDayRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    key: start.toISOString().slice(0, 10),
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;

  const day = utcDayRange();
  const { data, error } = await supabase
    .from("applications")
    .update({ status: "queued" })
    .eq("user_id", user.id)
    .eq("apply_path", "server")
    .in("status", ["ready_for_review", "filled"])
    .gte("created_at", day.start)
    .lt("created_at", day.end)
    .select("id");

  if (error) {
    await reportError("queue release failed", error, { userId: user.id });
    return NextResponse.json({ ok: false, error: "release_failed" }, { status: 500 });
  }

  const { error: acknowledgeError } = await supabase
    .from("queue_acknowledgements")
    .upsert({ user_id: user.id, ack_date: day.key }, { onConflict: "user_id,ack_date" });

  if (acknowledgeError) {
    await reportError("queue release acknowledgement failed", acknowledgeError, { userId: user.id });
    return NextResponse.json({ ok: false, error: "ack_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    queued: Array.isArray(data) ? data.length : 0,
    acknowledgedOn: day.key,
  });
}
