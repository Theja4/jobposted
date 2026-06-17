import type { Metadata } from "next";
import { Clock3 } from "lucide-react";
import { ApplicationsBrowser } from "@/components/dashboard/ApplicationsBrowser";
import { ProFeatureGate } from "@/components/dashboard/ProFeatureGate";
import { hasActiveSubscription } from "@/lib/billing/access";
import { getDashboardApplicationsPage } from "@/lib/dashboard/applications";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Job application history" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !(await hasActiveSubscription(supabase, user.id))) {
    return (
      <ProFeatureGate
        icon={Clock3}
        title="History unlocks with Pro"
        description="Once JobPosted prepares applications for you, this page keeps the sent and review-ready work in one place."
        detail="Manual roles and job-board saves still live in Tracker."
      />
    );
  }
  const page = await getDashboardApplicationsPage(await searchParams);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">
          Job application history
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          {page.total} JobPosted applications · manual tracker entries and extension
          captures stay in Tracker.
        </p>
      </div>

      <ApplicationsBrowser {...page} />
    </div>
  );
}
