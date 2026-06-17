"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Stable per-day key. Parent and picker MUST key identically, so this is shared. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
function inRange(d: Date, from: Date, to: Date) {
  const t = startOfDay(d).getTime();
  return t >= startOfDay(from).getTime() && t <= startOfDay(to).getTime();
}
function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Days of the displayed month, padded with leading nulls to the week grid. */
function monthDays(view: Date): (Date | null)[] {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  return cells;
}

export function DateRangePicker({
  value,
  onChange,
  availableDays,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Date-keys (via toDateKey) that have data. Days absent from it render disabled/grey. */
  availableDays?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfDay(value.to ?? value.from ?? new Date()));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(day: Date) {
    const { from, to } = value;
    if (!from || (from && to)) {
      onChange({ from: day, to: null });
    } else if (day < from) {
      onChange({ from: day, to: from });
    } else {
      onChange({ from, to: day });
    }
  }

  function preset(days: number) {
    const to = startOfDay(new Date());
    const from = startOfDay(new Date());
    from.setDate(from.getDate() - (days - 1));
    onChange({ from, to });
    setView(to);
  }

  const label =
    value.from && value.to
      ? `${fmt(value.from)} – ${fmt(value.to)}`
      : value.from
        ? `${fmt(value.from)} – …`
        : "All dates";

  const active = Boolean(value.from || value.to);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-[background-color,color,box-shadow]",
          active
            ? "bg-brand-600 text-white shadow-[0_10px_22px_-10px_rgba(31,100,224,0.6)]"
            : "bg-white text-ink shadow-[0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)] hover:bg-brand-50 hover:text-brand-700",
        )}
      >
        <Calendar className="size-4" />
        {label}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear dates"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onChange({ from: null, to: null });
              }
            }}
            className="ml-1 grid size-5 place-items-center rounded-full bg-white/25 hover:bg-white/40"
          >
            <X className="size-3" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[19rem] rounded-2xl bg-white p-4 shadow-[0_24px_60px_rgba(7,26,51,0.18)]">
          {/* Presets */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { label: "7 days", days: 7 },
              { label: "30 days", days: 30 },
              { label: "90 days", days: 90 },
            ].map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => preset(p.days)}
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-100"
              >
                Last {p.label}
              </button>
            ))}
          </div>

          {/* Month header */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
              className="grid size-8 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-sm font-extrabold text-ink">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
              className="grid size-8 place-items-center rounded-full text-muted hover:bg-black/5 hover:text-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-[11px] font-black text-muted">
                {d}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthDays(view).map((day, i) => {
              if (!day) return <span key={i} />;

              // O(1) lookup — days without applications are dimmed and unselectable.
              const hasData = !availableDays || availableDays.has(toDateKey(day));
              if (!hasData) {
                return (
                  <span
                    key={i}
                    aria-disabled
                    className="grid size-9 cursor-default place-items-center rounded-lg text-sm font-bold text-ink/20"
                  >
                    {day.getDate()}
                  </span>
                );
              }

              const isFrom = value.from && sameDay(day, value.from);
              const isTo = value.to && sameDay(day, value.to);
              const isEdge = isFrom || isTo;
              const within =
                value.from && value.to && inRange(day, value.from, value.to) && !isEdge;
              const isToday = sameDay(day, new Date());
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    "grid size-9 place-items-center rounded-lg text-sm font-bold transition-colors",
                    isEdge && "bg-brand-600 text-white",
                    within && "bg-brand-100 text-brand-800",
                    !isEdge && !within && "text-ink hover:bg-brand-50",
                    isToday && !isEdge && "shadow-[0_0_0_3px_rgba(31,100,224,0.16)]",
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {availableDays && (
            <p className="mt-3 rounded-xl bg-zinc-50/80 px-3 py-2 text-[11px] font-semibold text-muted shadow-[0_8px_18px_-16px_rgba(15,23,42,0.34)]">
              Dimmed dates have no applications.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
