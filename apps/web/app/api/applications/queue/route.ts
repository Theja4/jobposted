import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntitlement } from "@/lib/billing/entitlement";

export const runtime = "nodejs";

/** Queue a job for application (status 'queued'). Idempotent on (user_id, job_id). */
export async function POST(request: Request) {
  let jobId: unknown;
  try {
    ({ jobId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (typeof jobId !== "string" || !jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Trial / plan gate (design doc §12). Trial users get 5 free applications, then must upgrade.
  const entitlement = await getEntitlement(user.id);
  if (!entitlement.canQueue) {
    return NextResponse.json(
      {
        ok: false,
        error: "trial_exhausted",
        message: `You've used all ${entitlement.trialLimit} free applications. Upgrade to keep applying.`,
        upgradeUrl: "/dashboard/billing",
      },
      { status: 402 },
    );
  }

  const { data: job } = await supabase.from("jobs").select("ats_type").eq("id", jobId).maybeSingle();
  if (!job) return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });

  const applyPath =
    job.ats_type === "linkedin" || job.ats_type === "workday" ? "extension" : "server";

  const { error } = await supabase.from("applications").upsert(
    { user_id: user.id, job_id: jobId, status: "queued", apply_path: applyPath },
    { onConflict: "user_id,job_id", ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
