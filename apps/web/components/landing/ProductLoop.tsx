import { Check, FileText, ListChecks, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const STAGES = [
  { icon: ListChecks, label: "Queued" },
  { icon: Sparkles, label: "Tailored" },
  { icon: FileText, label: "Form filled" },
  { icon: Check, label: "You confirm" },
];

/**
 * A stylized 10-second product loop (design doc §7.1): queue → tailored resume → filled form
 * → you confirm. Static, CSS-only — no JS, no jank.
 */
export function ProductLoop() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-100 via-brand-50 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl bg-white shadow-xl shadow-brand-900/10 ring-1 ring-zinc-200/70">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b border-zinc-100 px-4 py-3">
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="size-2.5 rounded-full bg-zinc-200" />
          <span className="ml-3 text-xs font-medium text-zinc-400">Review queue</span>
        </div>

        {/* stage chips */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          {STAGES.map((s, i) => (
            <div
              key={s.label}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                i === 3
                  ? "bg-brand-600 text-white"
                  : "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100",
              )}
            >
              <s.icon className="size-3" strokeWidth={2.5} />
              {s.label}
            </div>
          ))}
        </div>

        {/* application card */}
        <div className="px-4 pb-4">
          <div className="rounded-xl border border-zinc-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Senior Backend Engineer</p>
                <p className="text-xs text-muted">Acme Robotics · Remote (US)</p>
              </div>
              <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                94% match
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-muted">
              <p className="flex items-center gap-1.5">
                <Check className="size-3.5 text-brand-600" strokeWidth={3} />
                Resume tailored to this role (Backend / Go variant)
              </p>
              <p className="flex items-center gap-1.5">
                <Check className="size-3.5 text-brand-600" strokeWidth={3} />
                12 fields filled · 2 questions drafted in your voice
              </p>
              <p className="flex items-center gap-1.5">
                <Check className="size-3.5 text-brand-600" strokeWidth={3} />
                Pre-submit screenshot ready for review
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 text-sm font-semibold text-white">
                <span className="size-1.5 animate-pulse rounded-full bg-white/90" />
                Confirm &amp; submit
              </span>
              <span className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-muted ring-1 ring-inset ring-zinc-200">
                Edit
              </span>
            </div>
          </div>

          <p className="mt-3 text-center text-[11px] text-zinc-400">
            Nothing is submitted until you press confirm.
          </p>
        </div>
      </div>
    </div>
  );
}
