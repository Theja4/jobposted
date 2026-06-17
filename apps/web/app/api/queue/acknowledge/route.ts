import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report";
import { requireProApi } from "@/lib/billing/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Acknowledge today's prepared batch. */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;

  const { error } = await supabase
    .from("queue_acknowledgements")
    .upsert({ user_id: user.id, ack_date: utcDate() }, { onConflict: "user_id,ack_date" });

  if (error) {
    await reportError("queue acknowledge failed", error, { userId: user.id });
    return NextResponse.json({ ok: false, error: "ack_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, acknowledgedOn: utcDate() });
}

/** Whether the signed-in user has acknowledged today. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, acknowledged: false }, { status: 401 });
  }
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;
  const { data } = await supabase
    .from("queue_acknowledgements")
    .select("id")
    .eq("user_id", user.id)
    .eq("ack_date", utcDate())
    .maybeSingle();
  return NextResponse.json({ ok: true, acknowledged: Boolean(data) });
}
