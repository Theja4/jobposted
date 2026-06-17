"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarSearch, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { type JobApplication } from "@/lib/dashboard/sample-data";
import { ApplicationRow } from "./ApplicationRow";
import { DateRangePicker, type DateRange } from "./DateRangePicker";

type ApplicationsBrowserProps = {
  applications?: JobApplication[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: string;
  dateFrom: string | null;
  dateTo: string | null;
};

function parseDateParam(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toDateParam(value: Date | null) {
  if (!value) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (const value of sorted) {
    const previous = out[out.length - 1];
    if (typeof previous === "number" && value - previous > 1) out.push("gap");
    out.push(value);
  }
  return out;
}

export function ApplicationsBrowser({
  applications = [],
  total,
  page,
  pageSize,
  totalPages,
  query,
  dateFrom,
  dateTo,
}: ApplicationsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftQuery, setDraftQuery] = useState(query);
  const range = useMemo<DateRange>(
    () => ({ from: parseDateParam(dateFrom), to: parseDateParam(dateTo) }),
    [dateFrom, dateTo],
  );

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  function updateParams(patch: Record<string, string | number | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || (key === "page" && value === 1)) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Parameters<typeof router.push>[0]);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({ q: draftQuery.trim(), page: 1 });
  }

  function setDateRange(nextRange: DateRange) {
    updateParams({
      from: toDateParam(nextRange.from),
      to: toDateParam(nextRange.to),
      page: 1,
    });
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min((page - 1) * pageSize + applications.length, total);
  const hasFilters = Boolean(query || dateFrom || dateTo);

  return (
    <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
      <form onSubmit={submitSearch} className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-10 flex-1 items-center gap-2.5 rounded-full bg-white px-4 text-sm shadow-[0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)] transition-[background-color,box-shadow] focus-within:shadow-[0_0_0_3px_rgba(31,100,224,0.18),0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)]">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            type="search"
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            placeholder="Search role, company, status"
            className="w-full bg-transparent text-ink outline-none placeholder:text-muted/80 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {draftQuery && (
            <button
              type="button"
              onClick={() => {
                setDraftQuery("");
                updateParams({ q: null, page: 1 });
              }}
              aria-label="Clear search"
              className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker value={range} onChange={setDateRange} />
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-sm font-black text-white shadow-[0_14px_30px_-18px_rgba(31,100,224,0.7)] transition-[background-color,box-shadow] hover:bg-brand-700"
          >
            <Search className="size-4" />
            Search
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-col gap-1 text-sm font-semibold text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing <span className="font-extrabold text-ink">{from}</span>
          {total > 0 && (
            <>
              {" - "}
              <span className="font-extrabold text-ink">{to}</span>
            </>
          )}{" "}
          of <span className="font-extrabold text-ink">{total}</span>{" "}
          {total === 1 ? "application" : "applications"}
        </p>
        <p className="text-xs font-bold text-muted">{pageSize} per page</p>
      </div>

      {hasFilters && (
        <p className="mb-4 text-xs font-bold text-muted">
          {query && (
            <>
              Matching <span className="text-ink">“{query}”</span>
            </>
          )}
          {(dateFrom || dateTo) && (
            <>
              {query ? " · " : ""}
              {dateFrom ?? "Any date"} to {dateTo ?? "now"}
            </>
          )}
        </p>
      )}

      {applications.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-white text-muted shadow-[0_12px_24px_-18px_rgba(15,23,42,0.42),0_2px_8px_-7px_rgba(15,23,42,0.18)]">
            <CalendarSearch className="size-5" />
          </span>
          <p className="mt-4 text-base font-extrabold text-ink">No matching applications</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Try a broader search or date range.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {applications.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Application history pages"
          className="mt-5 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-white/80 p-2 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.42)]"
        >
          <button
            type="button"
            onClick={() => updateParams({ page: Math.max(1, page - 1) })}
            disabled={page <= 1}
            aria-label="Previous page"
            className="grid size-9 place-items-center rounded-xl bg-white text-ink shadow-[0_10px_20px_-17px_rgba(15,23,42,0.45)] transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-45"
          >
            <ChevronLeft className="size-4" />
          </button>
          {pageWindow(page, totalPages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-sm font-black text-muted">
                ...
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => updateParams({ page: item })}
                aria-current={item === page ? "page" : undefined}
                className={`grid h-9 min-w-[2.25rem] place-items-center rounded-xl px-2 text-sm font-black transition-[background-color,color,box-shadow] ${
                  item === page
                    ? "bg-brand-600 text-white shadow-[0_12px_24px_-16px_rgba(31,100,224,0.58)]"
                    : "bg-white text-ink shadow-[0_10px_20px_-17px_rgba(15,23,42,0.45)] hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => updateParams({ page: Math.min(totalPages, page + 1) })}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="grid size-9 place-items-center rounded-xl bg-white text-ink shadow-[0_10px_20px_-17px_rgba(15,23,42,0.45)] transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-45"
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </section>
  );
}
