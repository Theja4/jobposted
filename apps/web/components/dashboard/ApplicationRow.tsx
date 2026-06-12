import { STATUS_META, type JobApplication } from "@/lib/dashboard/sample-data";
import { ViewResumeButton } from "./ResumeViewer";
import { cn } from "@/lib/cn";

export function formatApplicationDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatusPill({ status }: { status: JobApplication["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function ApplicationRow({ application }: { application: JobApplication }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-white/70 px-4 py-3.5 ring-1 ring-inset ring-white transition-colors hover:bg-white">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(150deg,#dceaff,#9fcbff)] text-sm font-black text-brand-800">
        {application.company.slice(0, 1)}
      </span>

      <div className="min-w-[12rem] flex-1">
        <p className="truncate text-sm font-extrabold text-ink">{application.role}</p>
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

      <ViewResumeButton application={application} />
    </div>
  );
}
