import Link from "next/link";
import { CalendarSearch, ExternalLink } from "lucide-react";
import { type JobApplication } from "@/lib/dashboard/sample-data";
import { ApplicationRow } from "./ApplicationRow";

export function ApplicationHistory({
  applications = [],
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
              Only applications sent by JobPosted appear here
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

      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/70 text-muted ring-1 ring-inset ring-white">
            <CalendarSearch className="size-5" />
          </span>
          <p className="mt-4 text-base font-extrabold text-ink">No JobPosted applications yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Manual tracker entries and extension captures stay in Tracker, not application history.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}
    </section>
  );
}
