import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  bool,
  num,
  rec,
  resumeContentFromProfilePayload,
  str,
  type ProfilePayload,
} from "@/lib/profile/resume-version";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as ProfilePayload | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });

  const basics = rec(body.basics);
  const links = rec(body.links);
  const workAuth = rec(body.workAuth);

  const needsSponsorship = bool(workAuth.needsSponsorship);

  // 1) profile row (identity, contact, links, work auth, prefs)
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: str(basics.fullName) || null,
      email: str(basics.email) || user.email || null,
      phone: str(basics.phone) || null,
      location: str(basics.location) || null,
      linkedin_url: str(links.linkedin) || null,
      portfolio_url: str(links.portfolio) || null,
      work_authorization: needsSponsorship === true ? "needs_sponsorship" : needsSponsorship === false ? "authorized" : null,
      needs_sponsorship: needsSponsorship,
      relocation_ok: bool(workAuth.relocationOk),
      current_salary_min: num(workAuth.currentSalaryMin),
      current_salary_max: num(workAuth.currentSalaryMax),
      current_salary_currency: str(workAuth.currentSalaryCurrency) || null,
      salary_expectation_min: num(workAuth.salaryMin),
      salary_expectation_max: num(workAuth.salaryMax),
      salary_currency: str(workAuth.salaryCurrency) || null,
      notice_period_days: num(workAuth.noticePeriodDays),
    },
    { onConflict: "id" },
  );
  if (profileError) {
    console.error("profile upsert failed", profileError);
    return NextResponse.json({ ok: false, error: "profile_save_failed" }, { status: 500 });
  }

  // 2) new resume base version (structured resume = source of truth)
  const content = resumeContentFromProfilePayload(body);

  const { data: version, error: versionError } = await supabase
    .from("resume_base_versions")
    .insert({ user_id: user.id, content })
    .select("id")
    .single();
  if (versionError) {
    console.error("resume version insert failed", versionError);
    return NextResponse.json({ ok: false, error: "resume_save_failed" }, { status: 500 });
  }

  if (version?.id) {
    const { error: pointerError } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, email: user.email ?? null, active_resume_version_id: version.id },
        { onConflict: "id" },
      );
    if (pointerError) {
      console.error("resume active pointer update failed", pointerError);
      return NextResponse.json({ ok: false, error: "resume_pointer_save_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
