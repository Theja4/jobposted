import { ExternalLink } from "lucide-react";
import { STATUS_META, type JobApplication } from "@/lib/dashboard/sample-data";
import { ViewResumeButton } from "./ResumeViewer";
import { cn } from "@/lib/cn";
import { CompanyAvatar } from "./CompanyAvatar";

export function formatApplicationDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusPill({ status }: { status: JobApplication["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function ApplicationRow({ application }: { application: JobApplication }) {
  const jobUrl = application.jobUrl ?? "";
  const clickable = Boolean(jobUrl);

  return (
    <div
      title={clickable ? "Open job posting" : undefined}
      className={cn(
        "group relative flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-white/88 px-4 py-3.5 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.48),0_8px_18px_-18px_rgba(15,23,42,0.18)] transition-[background-color,box-shadow,transform] hover:bg-white hover:shadow-[0_20px_40px_-30px_rgba(31,100,224,0.34),0_8px_18px_-18px_rgba(15,23,42,0.2)]",
        clickable && "cursor-pointer hover:-translate-y-0.5",
      )}
    >
      {clickable && (
        <a
          href={jobUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open job posting for ${application.role} at ${application.company}`}
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
      )}
      <CompanyAvatar
        company={application.company}
        logoUrl={application.companyLogoUrl}
      />

      <div className="min-w-[12rem] flex-1">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-extrabold text-ink">
          <span className="truncate">{application.role}</span>
          {clickable && (
            <ExternalLink
              className="size-3.5 shrink-0 text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
          )}
        </p>
        <p className="truncate text-xs font-semibold text-muted">
          {application.company} · {application.location}
        </p>
      </div>

      <div className="hidden w-20 text-center sm:block">
        <p className="text-sm font-black text-ink">{application.matchScore}%</p>
        <p className="text-[10px] font-bold tracking-wide text-muted uppercase">match</p>
      </div>

      <StatusPill status={application.status} />

      <span className="w-16 text-right text-xs font-bold text-muted">
        {formatApplicationDate(application.appliedOn)}
      </span>

      <span className="relative z-20">
        <ViewResumeButton application={application} />
      </span>
    </div>
  );
}
