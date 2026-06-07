import { cn } from "@/lib/cn";
import { SITE_NAME } from "@/lib/site";

/** Brand wordmark: a check-in-circle mark + "JobPosted". */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight", className)}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="26" height="26" rx="7" className="fill-brand-600" />
        <path
          d="M7 13.4l3.4 3.4L19 8.2"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-ink">{SITE_NAME}</span>
    </span>
  );
}
