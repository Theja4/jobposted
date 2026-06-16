import { NextResponse } from "next/server";
import { sanitizeOnboardingConfig } from "@/lib/onboarding/model";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

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

  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = body?.mode === "review" ? "review" : body?.mode === "auto" ? "auto" : null;
  if (!mode) {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        application_mode: mode,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) {
    if (isMissingApplicationModeColumn(error)) {
      const { error: fallbackError } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? null,
        },
        { onConflict: "id" },
      );
      if (fallbackError) {
        console.error("application_mode profile fallback failed", fallbackError);
        return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
      }
    } else {
      console.error("application_mode update failed", error);
      return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
    }
  }

  const savedProfileMode = rec(profile).application_mode;
  if (savedProfileMode && savedProfileMode !== mode) {
    console.error("application_mode verification failed", { expected: mode, actual: savedProfileMode });
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  const { data: onboardingRow } = await supabase
    .from("onboarding_configurations")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboarding = sanitizeOnboardingConfig(rec(onboardingRow).data, user.email ?? "");
  onboarding.final.applicationMode = mode;

  const { error: onboardingError } = await supabase.from("onboarding_configurations").upsert(
    {
      user_id: user.id,
      data: onboarding,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (onboardingError) {
    console.error("onboarding application_mode mirror failed", onboardingError);
  }

  return NextResponse.json({ ok: true, mode });
}
