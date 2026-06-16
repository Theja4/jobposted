import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import type { ApplicationMode } from "@/lib/dashboard/applications";

/** Dashboard prompt mirroring the DB-backed queue state, per application mode. */
export function AckBanner({
  acknowledged,
  mode = "auto",
  todayCount = 0,
}: {
  acknowledged: boolean;
  mode?: ApplicationMode;
  todayCount?: number;
}) {
  const review = mode === "review";

  if (!review) {
    return null;
  }

  if (acknowledged) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-inset ring-emerald-200/70">
        <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
        <p className="flex-1 text-sm font-bold text-emerald-900">
          Today's review batch is queued for the worker.
        </p>
        <Link
          href={{ pathname: "/dashboard/queue" }}
          className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:text-emerald-800"
        >
          View queue <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl p-5 text-white"
      style={{ background: "linear-gradient(135deg,#1f64e0,#11408f)" }}
    >
      <AlertCircle className="size-6 shrink-0 text-[#cfe2ff]" />
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm font-extrabold sm:text-base">
          {todayCount} applications are ready for your review.
        </p>
        <p className="mt-0.5 text-sm text-white/80">
          Review the batch and queue it with one click. Nothing is submitted until you do.
        </p>
      </div>
      <Link
        href={{ pathname: "/dashboard/queue" }}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-black text-brand-800 shadow-[0_12px_28px_rgba(7,26,51,0.25)] transition-transform duration-150 hover:-translate-y-0.5"
      >
        Review & queue
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
