import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Entitlement } from "@/lib/billing/entitlement";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Trial/usage banner (design doc §23.1, §23.7) — ties the daily meter to billing. */
export function UsageBanner({ entitlement }: { entitlement: Entitlement }) {
  if (!entitlement.isTrial) return null; // subscribers see the quota meter on the queue instead

  const left = Math.max(0, entitlement.trialLimit - entitlement.trialUsed);
  const exhausted = left === 0;

  return (
    <div
      className={cn(
        "mb-6 flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
        exhausted
          ? "border-amber-200 bg-amber-50"
          : "border-brand-100 bg-brand-50",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Sparkles className={cn("mt-0.5 size-5 shrink-0", exhausted ? "text-amber-600" : "text-brand-600")} />
        <div>
          <p className={cn("text-sm font-semibold", exhausted ? "text-amber-900" : "text-brand-800")}>
            {exhausted
              ? "You've used all your free applications"
              : `${left} of ${entitlement.trialLimit} free applications left`}
          </p>
          <p className={cn("text-xs", exhausted ? "text-amber-700" : "text-brand-700")}>
            {exhausted
              ? "Upgrade to keep applying — Starter $19/mo or Pro $49/mo."
              : "Your first 5 applications are free. No card required."}
          </p>
        </div>
      </div>
      <Link href="/dashboard/billing" className={buttonClasses("primary", "sm", "shrink-0")}>
        {exhausted ? "Upgrade now" : "View plans"}
      </Link>
    </div>
  );
}
