import { NextResponse } from "next/server";
import { saveOnboardingConfiguration } from "@/lib/onboarding/configuration-save";
import { sanitizeOnboardingConfig } from "@/lib/onboarding/model";
import { reportError } from "@/lib/observability/report";
import { requireProApi } from "@/lib/billing/access";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const proGate = await requireProApi(supabase, user.id);
  if (proGate) return proGate;

  const body = (await request.json().catch(() => null)) as { tailorResume?: unknown } | null;
  if (typeof body?.tailorResume !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_tailoring_preference" }, { status: 400 });
  }

  const { data: onboardingRow } = await supabase
    .from("onboarding_configurations")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboarding = sanitizeOnboardingConfig(rec(onboardingRow).data, user.email ?? "");
  onboarding.final.tailorResume = body.tailorResume;

  const configClient = getServiceRoleClient() ?? supabase;
  const result = await saveOnboardingConfiguration(configClient, {
    userId: user.id,
    config: onboarding,
  });
  if (!result.ok) {
    await reportError("tailoring preference save failed", result.error, { userId: user.id });
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tailorResume: onboarding.final.tailorResume });
}
