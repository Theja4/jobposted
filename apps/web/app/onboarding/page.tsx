import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export const metadata: Metadata = {
  title: "Get started",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.onboarded_at) redirect("/dashboard");

  const initialName =
    profile?.full_name ??
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ??
    "";

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 sm:py-16">
      <OnboardingWizard email={user.email ?? ""} initialName={initialName} />
    </main>
  );
}
