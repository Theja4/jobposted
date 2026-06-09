import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Confirm a parked application (design doc §10.4): flips ready_for_review → submitting. The
 * worker picks it up and submits. Owner + status guarded.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("applications")
    .update({ status: "submitting", claimed_at: null, failure_reason: null })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "ready_for_review")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Not found or not ready for review" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
