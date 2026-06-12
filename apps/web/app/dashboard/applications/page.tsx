import type { Metadata } from "next";
import { ApplicationsBrowser } from "@/components/dashboard/ApplicationsBrowser";
import { getDashboardApplications } from "@/lib/dashboard/applications";

export const metadata: Metadata = { title: "Job application history" };

export default async function ApplicationsPage() {
  const applications = await getDashboardApplications();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">
          Job application history
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          {applications.length} applications · filter by date, and open the exact tailored resume
          used for each.
        </p>
      </div>

      <ApplicationsBrowser applications={applications} />
    </div>
  );
}
