import { cn } from "@/lib/cn";

/**
 * Daily quota meter (design doc §23.1): honest "X of cap applied today" plus how many relevant
 * roles were found. Turns the hidden cap into a visible, fixable number.
 */
export function QuotaMeter({
  appliedToday,
  cap,
  planLabel,
  relevantToday,
}: {
  appliedToday: number;
  cap: number;
  planLabel: string;
  relevantToday: number;
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((appliedToday / cap) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">
          Today: {appliedToday} of {cap} applied
        </p>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
          {planLabel}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn("h-full rounded-full bg-brand-600 transition-[width] duration-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-muted">
        We found <strong className="text-ink">{relevantToday}</strong> relevant new role
        {relevantToday === 1 ? "" : "s"} matching your filters.{" "}
        {relevantToday < cap && "Widen your titles or locations to unlock more."}
      </p>
    </div>
  );
}
