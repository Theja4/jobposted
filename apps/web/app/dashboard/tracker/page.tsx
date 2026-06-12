import type { Metadata } from "next";
import { KanbanSquare } from "lucide-react";

export const metadata: Metadata = { title: "Job tracker" };

const COLUMNS = ["Saved", "Applied", "Interviewing", "Offer"];

export default function TrackerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-ink">Job tracker</h1>
        <p className="mt-1 text-sm font-semibold text-muted">
          A board for every role you&apos;re pursuing — syncs with Rezoomed.
        </p>
      </div>

      <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-8">
        {/* Empty-state hero */}
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="grid size-16 place-items-center rounded-3xl bg-[linear-gradient(150deg,#2f7df4,#1f50c0)] text-white shadow-[0_18px_40px_-16px_rgba(31,100,224,0.6)]">
            <KanbanSquare className="size-7" />
          </span>
          <h2 className="mt-5 text-xl font-extrabold tracking-[-0.02em] text-ink">
            Your tracker is coming soon
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted">
            Drag roles across stages, add notes, and keep interview dates in one place. It will
            sync automatically with your Rezoomed pipeline.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 text-xs font-black text-brand-700 ring-1 ring-inset ring-brand-100">
            In development
          </span>
        </div>

        {/* Faded board preview for shape */}
        <div aria-hidden className="mt-4 grid gap-4 opacity-40 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col} className="rounded-2xl bg-white/60 p-3 ring-1 ring-inset ring-white">
              <p className="px-1 pb-2 text-xs font-black tracking-wide text-muted uppercase">
                {col}
              </p>
              <div className="space-y-2">
                <div className="h-16 rounded-xl bg-white/80" />
                <div className="h-16 rounded-xl bg-white/80" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
