"use server";

import { revalidatePath } from "next/cache";
import type { JobPreferences, WorkAuthorization } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProfilePayload {
  fullName: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  workAuthorization: WorkAuthorization | "";
  needsSponsorship: boolean;
  relocationOk: boolean;
  relocationNotes: string;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  salaryCurrency: string;
  noticePeriodDays: number | null;
  preferences: JobPreferences;
}

type Result = { ok: boolean; error?: string };

function toRow(p: ProfilePayload, email: string | null) {
  return {
    email,
    full_name: p.fullName || null,
    phone: p.phone || null,
    location: p.location || null,
    linkedin_url: p.linkedinUrl || null,
    portfolio_url: p.portfolioUrl || null,
    work_authorization: p.workAuthorization || null,
    needs_sponsorship: p.needsSponsorship,
    relocation_ok: p.relocationOk,
    relocation_notes: p.relocationNotes || null,
    salary_expectation_min: p.salaryExpectationMin,
    salary_expectation_max: p.salaryExpectationMax,
    salary_currency: p.salaryCurrency || null,
    notice_period_days: p.noticePeriodDays,
    preferences: p.preferences,
  };
}

/** Persist the wizard and mark onboarding complete (sets onboarded_at). */
export async function completeOnboarding(
  payload: ProfilePayload,
  eeoConsent: boolean,
): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, ...toRow(payload, user.email ?? null), onboarded_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) return { ok: false, error: error.message };

  // EEO: record CONSENT only (design doc §8.2). No demographic values are stored until the
  // encrypted-blob (Supabase Vault) path is wired.
  if (eeoConsent) {
    await supabase
      .from("sensitive_self_id")
      .upsert(
        { user_id: user.id, consent_given_at: new Date().toISOString(), consent_version: "v1" },
        { onConflict: "user_id" },
      );
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Update profile + preferences from the settings page (leaves onboarded_at untouched). */
export async function updateProfile(payload: ProfilePayload): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update(toRow(payload, user.email ?? null))
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
