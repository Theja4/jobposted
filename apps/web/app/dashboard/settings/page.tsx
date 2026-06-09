import { EMPTY_PREFERENCES } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowToProfile, PROFILE_COLUMNS } from "@/lib/feed";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import type { ProfilePayload } from "@/lib/actions/onboarding";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user!.id)
    .single();
  const p = profileRow ? rowToProfile(profileRow) : null;

  const initial: ProfilePayload = {
    fullName: p?.fullName ?? "",
    phone: p?.phone ?? "",
    location: p?.location ?? "",
    linkedinUrl: p?.linkedinUrl ?? "",
    portfolioUrl: p?.portfolioUrl ?? "",
    workAuthorization: p?.workAuthorization ?? "",
    needsSponsorship: p?.needsSponsorship ?? false,
    relocationOk: p?.relocationOk ?? false,
    relocationNotes: p?.relocationNotes ?? "",
    salaryExpectationMin: p?.salaryExpectationMin ?? null,
    salaryExpectationMax: p?.salaryExpectationMax ?? null,
    salaryCurrency: p?.salaryCurrency ?? "USD",
    noticePeriodDays: p?.noticePeriodDays ?? null,
    preferences: p?.preferences ?? { ...EMPTY_PREFERENCES },
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Update your profile and what you&apos;re looking for.</p>
      </header>
      <SettingsForm initial={initial} email={user!.email ?? ""} />
    </div>
  );
}
