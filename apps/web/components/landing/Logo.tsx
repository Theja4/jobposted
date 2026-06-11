import Image from "next/image";
import { cn } from "@/lib/cn";
import { SITE_NAME } from "@/lib/site";

const BRAND_SPLIT_INDEX = SITE_NAME.indexOf("Posted");

/** Brand wordmark: J + paper-plane mark with "JobPosted". */
export function Logo({ className }: { className?: string }) {
  const prefix = BRAND_SPLIT_INDEX > -1 ? SITE_NAME.slice(0, BRAND_SPLIT_INDEX) : SITE_NAME;
  const suffix = BRAND_SPLIT_INDEX > -1 ? SITE_NAME.slice(BRAND_SPLIT_INDEX) : "";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-extrabold tracking-[-0.02em]",
        className,
      )}
    >
      <Image
        src="/brand/jobposted-mark.png"
        alt=""
        width={640}
        height={602}
        aria-hidden="true"
        className="h-[2.25em] w-[2.4em] shrink-0 object-contain"
      />
      <span className="leading-none text-ink">
        {prefix}
        {suffix && <span className="text-brand-700">{suffix}</span>}
      </span>
    </span>
  );
}
