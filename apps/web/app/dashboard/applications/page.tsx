import type { Metadata } from "next";
import { ApplicationsBrowser } from "@/components/dashboard/ApplicationsBrowser";
import { getDashboardApplicationsPage } from "@/lib/dashboard/applications";

export const metadata: Metadata = { title: "Job application history" };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
