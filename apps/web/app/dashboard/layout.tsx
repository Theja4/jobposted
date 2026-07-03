import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Settings2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasActiveSubscription } from "@/lib/billing/access";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

async function hasFinishedSetup(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data, error } = await supabase
    .from("onboarding_configurations")
    .select("completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data?.completed_at);
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/get-started?mode=signin" as Route);
  }

  const hasActivePlan = await hasActiveSubscription(supabase, user.id);
  const showSetupRibbon = hasActivePlan && !(await hasFinishedSetup(supabase, user.id));

  return (
    <div className="min-h-svh bg-panel">
      <DashboardNav hasActivePlan={hasActivePlan} />
      <main className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
        <div className="mx-auto w-full max-w-[88rem]">
          {showSetupRibbon && (
            <div className="mb-4 flex flex-col gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-brand-900 shadow-[0_10px_26px_-20px_rgba(31,100,224,0.45)] sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-700 shadow-[0_8px_16px_-14px_rgba(31,100,224,0.6)]">
                  <Settings2 className="size-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-extrabold leading-5">
                  Finish setup so the extension can reuse your resume, profile, and saved answers.
                </p>
              </div>
              <Link
                href="/dashboard/onboarding"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-black text-brand-700 shadow-[0_8px_16px_-14px_rgba(31,100,224,0.6)] transition-colors hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Go to setup
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
