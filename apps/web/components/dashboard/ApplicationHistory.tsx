import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { APPLICATIONS, type JobApplication } from "@/lib/dashboard/sample-data";
import { ApplicationRow } from "./ApplicationRow";

export function ApplicationHistory({
  applications = APPLICATIONS,
  limit,
  showHeader = true,
}: {
  applications?: JobApplication[];
  limit?: number;
  showHeader?: boolean;
}) {
  const rows = limit ? applications.slice(0, limit) : applications;

  return (
    <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
      {showHeader && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink">
              Recent applications
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted">
              The tailored resume used for each is one click away
            </p>
          </div>
          {limit && (
            <Link
              href={{ pathname: "/dashboard/applications" }}
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-800"
            >
              See all <ExternalLink className="size-3.5" />
            </Link>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {rows.map((application) => (
          <ApplicationRow key={application.id} application={application} />
        ))}
      </div>
    </section>
  );
}
