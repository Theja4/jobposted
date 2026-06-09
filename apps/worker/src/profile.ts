import type { Profile, JobPreferences } from "@jobposted/shared";
import { db } from "./supabase";

/** Load a user's profile (camelCase) for field-matching. */
export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data: r } = await db()
    .from("profiles")
    .select(
      "id,full_name,email,phone,location,linkedin_url,portfolio_url,work_authorization,needs_sponsorship,relocation_ok,relocation_notes,salary_expectation_min,salary_expectation_max,salary_currency,notice_period_days,preferences,onboarded_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    location: r.location,
    linkedinUrl: r.linkedin_url,
    portfolioUrl: r.portfolio_url,
    workAuthorization: r.work_authorization ?? null,
    needsSponsorship: r.needs_sponsorship,
    relocationOk: r.relocation_ok,
    relocationNotes: r.relocation_notes,
    salaryExpectationMin: r.salary_expectation_min,
    salaryExpectationMax: r.salary_expectation_max,
    salaryCurrency: r.salary_currency,
    noticePeriodDays: r.notice_period_days,
    preferences: (r.preferences as JobPreferences | null) ?? null,
    onboardedAt: r.onboarded_at,
  };
}
