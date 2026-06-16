"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { type JobListing, type Workplace } from "@/lib/dashboard/sample-data";
import { cn } from "@/lib/cn";
import { TailorModal } from "./TailorModal";

const WORKPLACE_FILTERS: ("All" | Workplace)[] = ["All", "Remote", "Hybrid", "On-site"];

type JobSort = "recent" | "company" | "role" | "salary";
type DatePosted = "any" | "1d" | "7d" | "30d";
type JobTypeFilter = "All" | "full-time" | "part-time" | "contract" | "internship";
type SeniorityFilter = "All" | "entry" | "mid" | "senior" | "staff" | "leadership";

const SORT_OPTIONS: Array<{ value: JobSort; label: string }> = [
  { value: "recent", label: "Most recent" },
  { value: "company", label: "Company A-Z" },
  { value: "role", label: "Role A-Z" },
  { value: "salary", label: "Highest salary" },
];

const DATE_OPTIONS: Array<{ value: DatePosted; label: string }> = [
  { value: "any", label: "Any time" },
  { value: "1d", label: "Past 24 hours" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
];

const JOB_TYPE_OPTIONS: Array<{ value: JobTypeFilter; label: string }> = [
  { value: "All", label: "Any type" },
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
];

const SENIORITY_OPTIONS: Array<{ value: SeniorityFilter; label: string }> = [
  { value: "All", label: "Any seniority" },
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff / Principal" },
  { value: "leadership", label: "Manager / Director" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "Any ATS" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby" },
  { value: "workday", label: "Workday" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "workable", label: "Workable" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "other", label: "Other" },
];

type JobBoardFilters = {
  query: string;
  workplace: "All" | Workplace;
  datePosted: DatePosted;
  location: string;
  jobType: JobTypeFilter;
  seniority: SeniorityFilter;
  salaryListed: boolean;
  minSalary: number | null;
  company: string;
  excludeCompany: string;
  source: string;
  visaSponsorship: boolean;
  hideTracked: boolean;
  sort: JobSort;
  page: number;
  pageSize: number;
};

type JobBoardProps = {
  jobs?: JobListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: JobBoardFilters;
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function queryTokens(query: string) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  const re = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        tokens.some((token) => part.toLowerCase() === token) ? (
          <mark key={`${part}-${i}`} className="rounded bg-amber-100 px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
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

function sourceLabel(job: JobListing) {
  if (job.atsType) return job.atsType;
  if (job.source) return job.source;
  return "Job board";
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

function JobListItem({
  job,
  active,
  tokens,
  onSelect,
}: {
  job: JobListing;
  active: boolean;
  tokens: string[];
  onSelect: (job: JobListing) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(job)}
      aria-pressed={active}
      className={cn(
        "w-full rounded-2xl p-4 text-left ring-1 ring-inset transition-colors",
        active
          ? "bg-brand-50 text-ink ring-brand-200"
          : "bg-white text-ink ring-zinc-200 hover:bg-brand-50/55 hover:ring-brand-100",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl text-sm font-black ring-1 ring-inset",
            active
              ? "bg-brand-600 text-white ring-brand-600"
              : "bg-brand-50 text-brand-700 ring-brand-100",
          )}
        >
          {job.company.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-sm font-extrabold leading-5">
            <Highlight text={job.title} tokens={tokens} />
          </span>
          <span className="mt-1 block truncate text-xs font-bold text-muted">
            <Highlight text={job.company} tokens={tokens} />
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" />
          {job.location}
        </span>
        <span>{relativeDate(job.postedOn)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-brand-700 ring-1 ring-inset ring-brand-100">
          {job.workplace}
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-ink/70 ring-1 ring-inset ring-zinc-200">
          {job.type}
        </span>
        {job.tags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-ink/70 ring-1 ring-inset ring-zinc-200"
          >
            <Highlight text={tag} tokens={tokens} />
          </span>
        ))}
      </div>
    </button>
  );
}

function JobDetail({
  job,
  applying,
  tracked,
  onApply,
  onTailor,
}: {
  job: JobListing | null;
  applying: boolean;
  tracked: boolean;
  onApply: (job: JobListing) => void;
  onTailor: (job: JobListing) => void;
}) {
  if (!job) {
    return (
      <section className="min-h-full rounded-2xl bg-white p-8 text-center ring-1 ring-inset ring-zinc-200">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
          <Search className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-extrabold text-ink">No job selected</h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted">
          Pick a role from the list to see the overview.
        </p>
      </section>
    );
  }

  return (
    <section className="min-h-full rounded-2xl bg-white p-5 ring-1 ring-inset ring-zinc-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-700 ring-1 ring-inset ring-brand-100">
            <Building2 className="size-3.5" />
            {job.company}
          </p>
          <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.03em] text-ink">
            {job.title}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" />
              {job.location}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="size-4" />
              {job.type}
            </span>
            <span>{relativeDate(job.postedOn)}</span>
          </div>
        </div>
        {job.applyUrl && (
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-black text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            Open <ExternalLink className="size-4" />
          </a>
        )}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <InfoTile label="Workplace" value={job.workplace} />
        <InfoTile label="Pay" value={job.salary} />
        <InfoTile label="Source" value={sourceLabel(job)} />
      </div>

      {job.tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {job.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-bold text-ink/75 ring-1 ring-inset ring-zinc-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <h3 className="text-sm font-extrabold text-ink">Overview</h3>
        <p className="mt-2 whitespace-pre-line text-sm font-medium leading-7 text-muted">
          {job.description}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-zinc-100 pt-5 sm:flex-row">
        <button
          type="button"
          onClick={() => onTailor(job)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50"
        >
          <FileText className="size-4" />
          Tailor resume
        </button>
        <button
          type="button"
          onClick={() => onApply(job)}
          disabled={applying || tracked}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:bg-brand-100 disabled:text-brand-700"
        >
          {applying ? (
            <Loader2 className="size-4 animate-spin" />
          ) : tracked ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <ArrowUpRight className="size-4" />
          )}
          {tracked ? "Tracked" : "Track and open"}
        </button>
      </div>
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
      <p className="text-[11px] font-black text-muted">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-ink">{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  icon,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  icon?: ReactNode;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-11 min-w-0 items-center gap-2 rounded-xl bg-zinc-50 px-3 ring-1 ring-inset ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-500",
        className,
      )}
    >
      {icon}
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-xs font-black text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-black text-muted">{children}</span>;
}

function ToggleFilter({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-zinc-50 px-3 text-xs font-black text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-brand-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

function optionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatSalary(value: number | null) {
  if (!value) return "";
  return `$${Math.round(value / 1000)}k+`;
}

export function JobBoard({
  jobs = [],
  total,
  page,
  pageSize,
  totalPages,
  filters,
}: JobBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    query: filters.query,
    location: filters.location,
    company: filters.company,
    excludeCompany: filters.excludeCompany,
    minSalary: filters.minSalary ? String(filters.minSalary) : "",
  });
  const hasAdvancedFilters = Boolean(
    filters.location ||
      filters.jobType !== "All" ||
      filters.seniority !== "All" ||
      filters.salaryListed ||
      filters.minSalary ||
      filters.company ||
      filters.excludeCompany ||
      filters.source ||
      filters.visaSponsorship ||
      filters.hideTracked,
  );
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters);
  const [selectedId, setSelectedId] = useState(jobs[0]?.id ?? "");
  const [tailorJob, setTailorJob] = useState<JobListing | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => new Set());
  const [applyError, setApplyError] = useState<string | null>(null);
  const tokens = useMemo(() => queryTokens(filters.query), [filters.query]);
  const activeFilterCount = [
    filters.query,
    filters.workplace !== "All",
    filters.datePosted !== "any",
    filters.location,
    filters.jobType !== "All",
    filters.seniority !== "All",
    filters.salaryListed,
    filters.minSalary,
    filters.company,
    filters.excludeCompany,
    filters.source,
    filters.visaSponsorship,
    filters.hideTracked,
  ].filter(Boolean).length;

  useEffect(() => {
    setDraft({
      query: filters.query,
      location: filters.location,
      company: filters.company,
      excludeCompany: filters.excludeCompany,
      minSalary: filters.minSalary ? String(filters.minSalary) : "",
    });
  }, [filters.company, filters.excludeCompany, filters.location, filters.minSalary, filters.query]);

  useEffect(() => {
    if (hasAdvancedFilters) setAdvancedOpen(true);
  }, [hasAdvancedFilters]);

  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedId("");
      return;
    }
    if (!jobs.some((job) => job.id === selectedId)) setSelectedId(jobs[0]?.id ?? "");
  }, [jobs, selectedId]);

  const selectedJob = jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const activeLabels = [
    filters.query ? `"${filters.query}"` : "",
    filters.workplace !== "All" ? filters.workplace : "",
    filters.datePosted !== "any" ? optionLabel(DATE_OPTIONS, filters.datePosted) : "",
    filters.location ? `Location: ${filters.location}` : "",
    filters.jobType !== "All" ? optionLabel(JOB_TYPE_OPTIONS, filters.jobType) : "",
    filters.seniority !== "All" ? optionLabel(SENIORITY_OPTIONS, filters.seniority) : "",
    filters.salaryListed ? "Salary listed" : "",
    filters.minSalary ? `Salary ${formatSalary(filters.minSalary)}` : "",
    filters.company ? `Company: ${filters.company}` : "",
    filters.excludeCompany ? `Excluding: ${filters.excludeCompany}` : "",
    filters.source ? optionLabel(SOURCE_OPTIONS, filters.source) : "",
    filters.visaSponsorship ? "Sponsorship available" : "",
    filters.hideTracked ? "Hide tracked/applied" : "",
  ].filter(Boolean);

  function updateDraft(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateParams(patch: Record<string, string | number | boolean | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (
        value === null ||
        value === "" ||
        value === false ||
        value === "All" ||
        (key === "sort" && value === "recent") ||
        (key === "date" && value === "any")
      ) {
        params.delete(key);
      } else if (value === true) {
        params.set(key, "1");
      } else {
        params.set(key, String(value));
      }
    }
    if (params.get("page") === "1") params.delete("page");
    const qs = params.toString();
    startTransition(() =>
      router.push((qs ? `${pathname}?${qs}` : pathname) as Parameters<typeof router.push>[0]),
    );
  }

  function applyDraftFilters() {
    updateParams({
      q: draft.query.trim(),
      location: draft.location.trim(),
      company: draft.company.trim(),
      excludeCompany: draft.excludeCompany.trim(),
      minSalary: draft.minSalary.trim(),
      page: 1,
    });
  }

  function clearFilters() {
    setDraft({ query: "", location: "", company: "", excludeCompany: "", minSalary: "" });
    updateParams({
      q: null,
      workplace: "All",
      date: "any",
      location: null,
      type: "All",
      seniority: "All",
      salaryListed: false,
      minSalary: null,
      company: null,
      excludeCompany: null,
      source: null,
      visa: false,
      hideTracked: false,
      sort: "recent",
      page: 1,
    });
  }

  async function applyFromBoard(job: JobListing) {
    if (applyingId) return;
    setApplyingId(job.id);
    setApplyError(null);
    const applyWindow = job.applyUrl ? window.open("", "_blank", "noopener,noreferrer") : null;
    try {
      const response = await fetch("/api/tracker/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "job_board",
          sourceJobId: job.id,
          jobId: job.canSaveTailoredResume ? job.id : undefined,
          role: job.title,
          company: job.company,
          location: job.location,
          jobUrl: job.applyUrl ?? undefined,
          stage: "applied",
          notes: `${job.level} ${job.type}`,
        }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.message || "Could not add this role to the tracker.");
      }
      setTrackedIds((current) => new Set(current).add(job.id));
      if (job.applyUrl) {
        if (applyWindow) {
          applyWindow.location.href = job.applyUrl;
        } else {
          window.open(job.applyUrl, "_blank", "noopener,noreferrer");
        }
      }
    } catch (err) {
      applyWindow?.close();
      setApplyError(err instanceof Error ? err.message : "Could not add this role to the tracker.");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="space-y-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-3 lg:space-y-0 lg:overflow-hidden">
      <section className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-inset ring-zinc-200">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            applyDraftFilters();
          }}
          className="space-y-2"
        >
          <div className="grid gap-2 min-[1180px]:grid-cols-[minmax(18rem,1fr)_auto_10.5rem_10.5rem_auto_auto]">
            <label className="flex h-11 min-w-0 items-center gap-2.5 rounded-xl bg-zinc-50 px-3 ring-1 ring-inset ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-500">
              <Search className="size-4 shrink-0 text-muted" />
              <span className="sr-only">Search jobs</span>
              <input
                type="search"
                value={draft.query}
                onChange={(event) => updateDraft("query", event.target.value)}
                placeholder="Search role, company, skill, or location"
                className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-zinc-500"
                autoComplete="off"
              />
              {draft.query && (
                <button
                  type="button"
                  onClick={() => {
                    updateDraft("query", "");
                    updateParams({ q: null, page: 1 });
                  }}
                  aria-label="Clear search"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              )}
            </label>

            <div className="flex h-11 min-w-max items-center gap-1 rounded-xl bg-zinc-50 p-1 ring-1 ring-inset ring-zinc-200">
              {WORKPLACE_FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => updateParams({ workplace: option, page: 1 })}
                  aria-pressed={filters.workplace === option}
                  className={cn(
                    "relative h-9 rounded-lg px-3 text-xs font-bold transition-colors before:absolute before:inset-x-0 before:inset-y-[-4px]",
                    filters.workplace === option
                      ? "bg-ink text-white"
                      : "text-muted hover:bg-white hover:text-ink",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <FilterSelect
              label="Date posted"
              value={filters.datePosted}
              options={DATE_OPTIONS}
              icon={<Filter className="size-4 shrink-0 text-brand-600" />}
              onChange={(value) => updateParams({ date: value, page: 1 })}
              className="min-[1180px]:w-full"
            />

            <FilterSelect
              label="Sort jobs"
              value={filters.sort}
              options={SORT_OPTIONS}
              icon={<ArrowDownWideNarrow className="size-4 shrink-0 text-brand-600" />}
              onChange={(value) => updateParams({ sort: value, page: 1 })}
              className="min-[1180px]:w-full"
            />

            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black ring-1 ring-inset transition-colors",
                advancedOpen || activeFilterCount > 0
                  ? "bg-ink text-white ring-ink"
                  : "bg-zinc-50 text-ink ring-zinc-200 hover:bg-brand-50 hover:text-brand-700",
              )}
            >
              <SlidersHorizontal className="size-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="grid size-5 place-items-center rounded-full bg-white text-[11px] text-ink">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-black text-white transition-colors hover:bg-brand-700"
            >
              Apply
            </button>
          </div>

          {advancedOpen && (
            <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1.5">
                  <FieldLabel>Location</FieldLabel>
                  <input
                    value={draft.location}
                    onChange={(event) => updateDraft("location", event.target.value)}
                    placeholder="City, country, remote region"
                    className="h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink outline-none ring-1 ring-inset ring-zinc-200 placeholder:text-zinc-500 focus:ring-2 focus:ring-brand-500"
                  />
                </label>

                <label className="space-y-1.5">
                  <FieldLabel>Company</FieldLabel>
                  <input
                    value={draft.company}
                    onChange={(event) => updateDraft("company", event.target.value)}
                    placeholder="Include company"
                    className="h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink outline-none ring-1 ring-inset ring-zinc-200 placeholder:text-zinc-500 focus:ring-2 focus:ring-brand-500"
                  />
                </label>

                <label className="space-y-1.5">
                  <FieldLabel>Exclude companies</FieldLabel>
                  <input
                    value={draft.excludeCompany}
                    onChange={(event) => updateDraft("excludeCompany", event.target.value)}
                    placeholder="Comma separated"
                    className="h-10 w-full rounded-xl bg-white px-3 text-sm font-semibold text-ink outline-none ring-1 ring-inset ring-zinc-200 placeholder:text-zinc-500 focus:ring-2 focus:ring-brand-500"
                  />
                </label>

                <label className="space-y-1.5">
                  <FieldLabel>Minimum salary</FieldLabel>
                  <div className="flex h-10 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-inset ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-500">
                    <DollarSign className="size-4 shrink-0 text-brand-600" />
                    <input
                      inputMode="numeric"
                      value={draft.minSalary}
                      onChange={(event) => updateDraft("minSalary", event.target.value)}
                      placeholder="150000"
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-zinc-500"
                    />
                  </div>
                </label>

                <div className="space-y-1.5">
                  <FieldLabel>Job type</FieldLabel>
                  <FilterSelect
                    label="Job type"
                    value={filters.jobType}
                    options={JOB_TYPE_OPTIONS}
                    onChange={(value) => updateParams({ type: value, page: 1 })}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Seniority</FieldLabel>
                  <FilterSelect
                    label="Seniority"
                    value={filters.seniority}
                    options={SENIORITY_OPTIONS}
                    onChange={(value) => updateParams({ seniority: value, page: 1 })}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>ATS / source</FieldLabel>
                  <FilterSelect
                    label="ATS or source"
                    value={filters.source}
                    options={SOURCE_OPTIONS}
                    onChange={(value) => updateParams({ source: value, page: 1 })}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel>Useful gates</FieldLabel>
                  <div className="grid gap-2">
                    <ToggleFilter
                      label="Salary listed"
                      checked={filters.salaryListed}
                      onChange={(checked) => updateParams({ salaryListed: checked, page: 1 })}
                    />
                    <ToggleFilter
                      label="Sponsorship available"
                      checked={filters.visaSponsorship}
                      onChange={(checked) => updateParams({ visa: checked, page: 1 })}
                    />
                    <ToggleFilter
                      label="Hide tracked or applied"
                      checked={filters.hideTracked}
                      onChange={(checked) => updateParams({ hideTracked: checked, page: 1 })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>
      </section>

      {activeLabels.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-1">
          {activeLabels.map((label, index) => (
            <span
              key={`${label}-${index}`}
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-black text-brand-700 ring-1 ring-inset ring-brand-100"
            >
              {label}
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="relative inline-flex min-h-8 items-center justify-center gap-1.5 rounded-full bg-white px-2.5 text-[11px] font-black text-ink ring-1 ring-inset ring-zinc-200 transition-colors before:absolute before:inset-x-0 before:inset-y-[-6px] hover:bg-zinc-50"
          >
            <RotateCcw className="size-3.5" />
            Clear
          </button>
        </div>
      )}

      {applyError && (
        <p className="shrink-0 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 ring-1 ring-inset ring-red-100">
          {applyError}
        </p>
      )}

      {jobs.length === 0 ? (
        <section className="rounded-2xl bg-white p-10 text-center ring-1 ring-inset ring-zinc-200">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <Search className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-ink">No roles match this view</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted">
            Try a broader search or clear one of the filters.
          </p>
        </section>
      ) : (
        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(18rem,25rem)_minmax(0,1fr)] lg:overflow-hidden">
          <section
            aria-label="Job results"
            className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-zinc-200"
          >
            <div className="flex flex-col gap-1 border-b border-zinc-200 px-4 py-3 text-xs font-semibold text-muted sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-start xl:flex-row xl:items-center">
              <p>
                Showing <span className="font-black text-ink">{from}</span> to{" "}
                <span className="font-black text-ink">{to}</span> of{" "}
                <span className="font-black text-ink">{total}</span> roles
                {filters.query ? (
                  <>
                    {" "}
                    for <span className="font-black text-ink">&quot;{filters.query}&quot;</span>
                  </>
                ) : null}
              </p>
              {isPending && (
                <span className="inline-flex items-center gap-2 font-bold text-brand-700">
                  <Loader2 className="size-4 animate-spin" />
                  Updating
                </span>
              )}
            </div>

            <div
              data-lenis-prevent
              className="space-y-2 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-2"
            >
              {jobs.map((job) => (
                <JobListItem
                  key={job.id}
                  job={job}
                  active={selectedJob?.id === job.id}
                  tokens={tokens}
                  onSelect={(next) => setSelectedId(next.id)}
                />
              ))}

              {totalPages > 1 && (
                <nav
                  aria-label="Job board pages"
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-xl bg-white p-2 ring-1 ring-inset ring-zinc-200"
                >
                  <button
                    type="button"
                    onClick={() => updateParams({ page: Math.max(1, page - 1) })}
                    disabled={page <= 1}
                    aria-label="Previous page"
                    title="Previous page"
                    className="grid size-9 place-items-center rounded-xl text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-45"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <div className="flex min-w-0 items-center justify-center gap-1 overflow-hidden">
                    {pageWindow(page, totalPages).map((item, index) =>
                      item === "gap" ? (
                        <span
                          key={`gap-${index}`}
                          className="shrink-0 px-1 text-sm font-black text-muted"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={item}
                          type="button"
                          onClick={() => updateParams({ page: item })}
                          aria-current={item === page ? "page" : undefined}
                          className={cn(
                            "grid h-9 min-w-[2.25rem] shrink-0 place-items-center rounded-xl px-2 text-sm font-black transition-colors",
                            item === page
                              ? "bg-brand-600 text-white"
                              : "text-ink ring-1 ring-inset ring-zinc-200 hover:bg-brand-50 hover:text-brand-700",
                          )}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateParams({ page: Math.min(totalPages, page + 1) })}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                    title="Next page"
                    className="grid size-9 place-items-center rounded-xl text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:pointer-events-none disabled:opacity-45"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </nav>
              )}
            </div>
          </section>

          <div data-lenis-prevent className="lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
            <JobDetail
              job={selectedJob}
              applying={Boolean(selectedJob && applyingId === selectedJob.id)}
              tracked={Boolean(selectedJob && trackedIds.has(selectedJob.id))}
              onApply={applyFromBoard}
              onTailor={setTailorJob}
            />
          </div>
        </div>
      )}

      {tailorJob && <TailorModal job={tailorJob} onClose={() => setTailorJob(null)} />}
    </div>
  );
}
