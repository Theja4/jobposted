import { cn } from "@/lib/cn";
import { SITE_NAME } from "@/lib/site";

/** Brand wordmark: a confirmed-queue mark + "JobPosted". */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-bold tracking-tight", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="8" className="fill-brand-600" />
        <path d="M8 9.5h8.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 14h5.5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.72" />
        <path
          d="M16.2 17.1l2.1 2.1 4-4.45"
          stroke="white"
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-ink">{SITE_NAME}</span>
    </span>
  );
}
