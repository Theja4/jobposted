"use client";

import { useMemo, useState } from "react";
import { CalendarSearch, Search, X } from "lucide-react";
import { APPLICATIONS, type JobApplication } from "@/lib/dashboard/sample-data";
import { searchApplications } from "@/lib/dashboard/search";
import { ApplicationRow } from "./ApplicationRow";
import { DateRangePicker, toDateKey, type DateRange } from "./DateRangePicker";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function ApplicationsBrowser({ applications = APPLICATIONS }: { applications?: JobApplication[] }) {
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [query, setQuery] = useState("");

  // Built once: O(1) "does this day have applications?" lookups for the calendar.
  const availableDays = useMemo(
    () => new Set(applications.map((a) => toDateKey(new Date(a.appliedOn)))),
    [applications],
  );

  const rows = useMemo(() => {
    const fromT = range.from ? startOfDay(range.from) : null;
    const toT = range.to ? startOfDay(range.to) : null;
    // Date filter first (cheap), then ranked fuzzy search over what's left.
    const inRange = applications.filter((a) => {
      const t = startOfDay(new Date(a.appliedOn));
      if (fromT !== null && t < fromT) return false;
      if (toT !== null && t > toT) return false;
      return true;
    });
    return searchApplications(inRange, query);
  }, [applications, range, query]);

  return (
    <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-10 flex-1 items-center gap-2.5 rounded-full bg-white/70 px-4 text-sm ring-1 ring-inset ring-white focus-within:ring-2 focus-within:ring-brand-500">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by role, company, status…  (typos are fine)"
            className="w-full bg-transparent text-ink outline-none placeholder:text-muted/80 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <DateRangePicker value={range} onChange={setRange} availableDays={availableDays} />
      </div>

      <p className="mb-4 text-sm font-semibold text-muted">
        <span className="font-extrabold text-ink">{rows.length}</span>{" "}
        {rows.length === 1 ? "application" : "applications"}
        {query && (
          <>
            {" "}
            for <span className="font-bold text-ink">“{query}”</span>
          </>
        )}
        {(range.from || range.to) && " in range"}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/70 text-muted ring-1 ring-inset ring-white">
            <CalendarSearch className="size-5" />
          </span>
          <p className="mt-4 text-base font-extrabold text-ink">No matching applications</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Try a different search or date range — search is typo-tolerant, so spelling doesn&apos;t
            have to be perfect.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}
    </section>
  );
}
