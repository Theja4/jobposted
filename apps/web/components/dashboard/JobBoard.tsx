"use client";

import { useMemo, useState } from "react";
import { Search, X, MapPin, Briefcase, Sparkles, ArrowUpRight } from "lucide-react";
import { JOBS, type JobListing, type Workplace } from "@/lib/dashboard/sample-data";
import { searchJobs, queryTokens } from "@/lib/dashboard/search";
import { cn } from "@/lib/cn";

const WORKPLACE_FILTERS: ("All" | Workplace)[] = ["All", "Remote", "Hybrid", "On-site"];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap any occurrence of the query tokens so matches are visible in results. */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  const usable = tokens.filter((t) => t.length >= 2);
  if (usable.length === 0) return <>{text}</>;

  const re = new RegExp(`(${usable.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) && usable.some((t) => part.toLowerCase() === t.toLowerCase()) ? (
          <mark key={i} className="rounded bg-[#fff0bf] px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function relativeDate(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function JobCard({ job, tokens }: { job: JobListing; tokens: string[] }) {
  return (
    <article className="liquid-glass group flex flex-col rounded-[1.5rem] p-5 transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(150deg,#dceaff,#9fcbff)] text-base font-black text-brand-800">
          {job.company.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-extrabold text-ink">
            <Highlight text={job.title} tokens={tokens} />
          </h3>
          <p className="truncate text-sm font-semibold text-muted">
            <Highlight text={job.company} tokens={tokens} />
          </p>
        </div>
        {job.featured && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-black text-brand-700 ring-1 ring-inset ring-brand-100">
            <Sparkles className="size-3" />
            Top fit
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" />
          {job.location}
        </span>
        <span className="inline-flex items-center gap-1">
          <Briefcase className="size-3.5" />
          {job.type}
        </span>
        <span>{job.salary}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {job.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold text-ink/70 ring-1 ring-inset ring-white"
          >
            <Highlight text={tag} tokens={tokens} />
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-3">
        <div className="flex items-center gap-2 text-xs font-bold text-muted">
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
            {job.matchScore}% match
          </span>
          <span>· {relativeDate(job.postedOn)}</span>
        </div>
        <a
          href="#"
          className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-black text-white shadow-[0_10px_22px_-10px_rgba(31,100,224,0.6)] transition-colors hover:bg-brand-700"
        >
          Apply
          <ArrowUpRight className="size-3.5" />
        </a>
      </div>
    </article>
  );
}

export function JobBoard() {
  const [query, setQuery] = useState("");
  const [workplace, setWorkplace] = useState<"All" | Workplace>("All");

  const tokens = useMemo(() => queryTokens(query), [query]);

  const results = useMemo(() => {
    const base = workplace === "All" ? JOBS : JOBS.filter((j) => j.workplace === workplace);
    return searchJobs(base, query);
  }, [query, workplace]);

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="liquid-glass rounded-[1.5rem] p-4 sm:p-5">
        <label className="flex h-12 items-center gap-2.5 rounded-full bg-white/80 px-4 ring-1 ring-inset ring-white focus-within:ring-2 focus-within:ring-brand-500">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles, companies, skills, locations…  (typos are fine)"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/80"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {WORKPLACE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setWorkplace(option)}
              aria-pressed={workplace === option}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors duration-150",
                workplace === option
                  ? "bg-ink text-white shadow-[0_6px_14px_rgba(7,26,51,0.22)]"
                  : "bg-white/70 text-muted ring-1 ring-inset ring-white hover:text-ink",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <p className="px-1 text-sm font-semibold text-muted">
        {results.length} {results.length === 1 ? "role" : "roles"}
        {query ? (
          <>
            {" "}
            for <span className="font-bold text-ink">“{query}”</span>
          </>
        ) : (
          " available"
        )}
      </p>

      {results.length === 0 ? (
        <div className="liquid-glass flex flex-col items-center rounded-[1.5rem] px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/70 text-muted ring-1 ring-inset ring-white">
            <Search className="size-5" />
          </span>
          <p className="mt-4 text-base font-extrabold text-ink">No roles match your search</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Try fewer or broader terms — search is typo-tolerant, so spelling doesn&apos;t have to be
            perfect.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((job) => (
            <JobCard key={job.id} job={job} tokens={tokens} />
          ))}
        </div>
      )}
    </div>
  );
}
