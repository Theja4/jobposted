import { NextResponse } from "next/server";
import {
  onboardingToProfilePayload,
  reusableAnswersFromOnboarding,
  sanitizeOnboardingConfig,
} from "@/lib/onboarding/model";
import { embedResumeContent, vectorToSql } from "@/lib/ai/embeddings";
import { reportError } from "@/lib/observability/report";
import { requireProApi } from "@/lib/billing/access";
import {
  bool,
  num,
  rec,
  resumeContentFromProfilePayload,
  str,
} from "@/lib/profile/resume-version";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isMissingApplicationModeColumn(error: unknown) {
  const record = rec(error);
  const text = [record.code, record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return (
    text.includes("application_mode") &&
    (text.includes("column") || text.includes("schema cache") || text.includes("pgrst204"))
  );
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;

  const body = await request.json().catch(() => null);
  const config = sanitizeOnboardingConfig(body, user.email ?? "");
  const profilePayload = onboardingToProfilePayload(config);
  const basics = rec(profilePayload.basics);
  const links = rec(profilePayload.links);
  const workAuth = rec(profilePayload.workAuth);
  const needsSponsorship = bool(workAuth.needsSponsorship);
  const now = new Date().toISOString();

  const profileRow: Record<string, unknown> = {
    id: user.id,
    full_name: str(basics.fullName) || null,
    email: str(basics.email) || user.email || null,
    phone: str(basics.phone) || null,
    location: str(basics.location) || null,
    linkedin_url: str(links.linkedin) || null,
    portfolio_url: str(links.portfolio) || null,
    work_authorization:
      needsSponsorship === true ? "needs_sponsorship" : needsSponsorship === false ? "authorized" : null,
    needs_sponsorship: needsSponsorship,
    relocation_ok: bool(workAuth.relocationOk),
    current_salary_min: num(workAuth.currentSalaryMin),
    current_salary_max: num(workAuth.currentSalaryMax),
    current_salary_currency: str(workAuth.currentSalaryCurrency) || null,
    salary_expectation_min: num(workAuth.salaryMin),
    salary_expectation_max: num(workAuth.salaryMax),
    salary_currency: str(workAuth.salaryCurrency) || null,
    notice_period_days: num(workAuth.noticePeriodDays),
    application_mode: config.final.applicationMode,
  };

  const { error: profileError } = await supabase.from("profiles").upsert(profileRow, { onConflict: "id" });
  if (profileError) {
    if (isMissingApplicationModeColumn(profileError)) {
      const profileRowWithoutMode = { ...profileRow };
      delete profileRowWithoutMode.application_mode;
      const { error: fallbackProfileError } = await supabase
        .from("profiles")
        .upsert(profileRowWithoutMode, { onConflict: "id" });
      if (fallbackProfileError) {
        await reportError("onboarding profile fallback upsert failed", fallbackProfileError, { userId: user.id });
        return NextResponse.json({ ok: false, error: "profile_save_failed" }, { status: 500 });
      }
    } else {
      await reportError("onboarding profile upsert failed", profileError, { userId: user.id });
      return NextResponse.json({ ok: false, error: "profile_save_failed" }, { status: 500 });
    }
  }

  const sourceDocument = config.profile.resumeSource ?? undefined;
  const content = resumeContentFromProfilePayload(profilePayload, sourceDocument);
  const hasResumeContent =
    content.name ||
    content.headline ||
    content.summary ||
    (content.skills?.length ?? 0) > 0 ||
    (content.experience?.length ?? 0) > 0 ||
    (content.education?.length ?? 0) > 0 ||
    sourceDocument;

  if (hasResumeContent) {
    const embedding = await embedResumeContent(content);
    const { data: version, error: versionError } = await supabase
      .from("resume_base_versions")
      .insert({
        user_id: user.id,
        content,
        storage_path: sourceDocument?.storagePath ?? null,
        source_document: sourceDocument ?? null,
        content_hash: sourceDocument?.contentHash ?? null,
        embedding: vectorToSql(embedding),
      })
      .select("id")
      .single();
    if (versionError) {
      await reportError("onboarding resume version insert failed", versionError, { userId: user.id });
      return NextResponse.json({ ok: false, error: "resume_save_failed" }, { status: 500 });
    }
    if (version?.id) {
      await supabase
        .from("profiles")
        .upsert(
          { id: user.id, email: user.email ?? null, active_resume_version_id: version.id },
          { onConflict: "id" },
        );
    }
    if (sourceDocument?.storagePath) {
      const { data: existingDocument } = await supabase
        .from("documents")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "base_resume")
        .eq("storage_path", sourceDocument.storagePath)
        .maybeSingle();
      if (!existingDocument?.id) {
        const { error: documentError } = await supabase.from("documents").insert({
          user_id: user.id,
          type: "base_resume",
          storage_path: sourceDocument.storagePath,
        });
        if (documentError) {
          await reportError("onboarding base resume document insert failed", documentError, { userId: user.id });
        }
      }
    }
  }

  const answers = reusableAnswersFromOnboarding(config);
  if (answers.length > 0) {
    const { error: answersError } = await supabase.from("profile_answers").upsert(
      answers.map((answer) => ({
        user_id: user.id,
        key: answer.key,
        prompt: answer.prompt,
        value: answer.value,
        source: "onboarding",
        updated_at: now,
      })),
      { onConflict: "user_id,key" },
    );
    if (answersError) {
      await reportError("onboarding profile answers upsert failed", answersError, { userId: user.id });
    }
  }

  const { error: configError } = await supabase.from("onboarding_configurations").upsert(
    {
      user_id: user.id,
      data: config,
      completed_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (configError) {
    await reportError("onboarding configuration upsert failed", configError, { userId: user.id });
    return NextResponse.json({ ok: false, error: "configuration_save_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    completedAt: now,
  });
}
