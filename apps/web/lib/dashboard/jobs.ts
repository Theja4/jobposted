import "server-only";

import { inferJobType, inferSeniority, type NormalizedJobType, type NormalizedSeniority } from "@jobposted/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability/report";
import {
  type JobListing,
  type JobType,
  type Workplace,
} from "./sample-data";

type JobRow = {
  id: string;
  source: string | null;
  source_job_id: string | null;
  ats_type: string | null;
  company: string | null;
  company_domain?: string | null;
  company_logo_url?: string | null;
  title: string | null;
  location: string | null;
  remote: string | null;
  job_type?: string | null;
  seniority?: string | null;
  description_md: string | null;
  apply_url: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string | null;
  ingested_at: string | null;
};

type JobBoardRpcRow = JobRow & {
  total_count?: number | null;
};

const CORE_JOB_SELECT =
  "id,source,source_job_id,ats_type,company,title,location,remote,description_md,apply_url,salary_min,salary_max,salary_currency,posted_at,ingested_at";
const BASE_JOB_SELECT = `${CORE_JOB_SELECT},company_domain,company_logo_url`;
const JOB_SELECT = `${BASE_JOB_SELECT},job_type,seniority`;

export type JobBoardSort = "recent" | "company" | "role" | "salary";
export type JobBoardDatePosted = "any" | "1d" | "7d" | "30d";
export type JobBoardJobType = "All" | NormalizedJobType;
export type JobBoardSeniority = "All" | NormalizedSeniority;

export type JobBoardFilters = {
  query: string;
  workplace: "All" | Workplace;
  datePosted: JobBoardDatePosted;
  location: string;
  jobType: JobBoardJobType;
  seniority: JobBoardSeniority;
  salaryListed: boolean;
  minSalary: number | null;
  company: string;
  excludeCompany: string;
  source: string;
  visaSponsorship: boolean;
  hideTracked: boolean;
  sort: JobBoardSort;
  page: number;
  pageSize: number;
};

export type JobBoardListingPage = {
  jobs: JobListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: JobBoardFilters;
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 24;
const LEGACY_CLIENT_FILTER_LIMIT = 2_000;
const OPTIONAL_JOB_BOARD_COLUMNS = [
  "job_type",
  "seniority",
  "salary_listed",
  "salary_ceiling",
  "source_family",
  "company_domain",
  "company_logo_url",
];

const KEYWORD_TAGS: Array<{ tag: string; terms: string[] }> = [
  { tag: "React", terms: ["react", "next.js", "nextjs"] },
  { tag: "TypeScript", terms: ["typescript", "type-safe", "javascript"] },
  { tag: "Design systems", terms: ["design system", "component library", "tokens"] },
  { tag: "AI", terms: ["ai", "llm", "machine learning", "ml"] },
  { tag: "Product", terms: ["product", "roadmap", "strategy"] },
  { tag: "Growth", terms: ["growth", "activation", "experimentation"] },
  { tag: "Backend", terms: ["backend", "api", "distributed", "database"] },
  { tag: "Frontend", terms: ["frontend", "front-end", "ui"] },
  { tag: "Data", terms: ["data", "analytics", "metrics"] },
  { tag: "Remote", terms: ["remote"] },
];

function cleanText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[#*_`>[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function workplaceFrom(value: string | null): Workplace {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("hybrid")) return "Hybrid";
  if (normalized.includes("site") || normalized.includes("office")) return "On-site";
  return "Remote";
}

function normalizeJobType(value: string | null | undefined): NormalizedJobType | null {
  if (value === "full-time" || value === "part-time" || value === "contract" || value === "internship") {
    return value;
  }
  return null;
}

function normalizeSeniority(value: string | null | undefined): NormalizedSeniority | null {
  if (value === "entry" || value === "mid" || value === "senior" || value === "staff" || value === "leadership") {
    return value;
  }
  return null;
}

function typeFrom(row: JobRow): JobType {
  const type = normalizeJobType(row.job_type) ?? inferJobType(row.title, row.description_md);
  if (type === "contract") return "Contract";
  if (type === "part-time") return "Part-time";
  if (type === "internship") return "Internship";
  return "Full-time";
}

function levelFrom(row: JobRow) {
  const seniority = normalizeSeniority(row.seniority) ?? inferSeniority(row.title, row.description_md);
  if (seniority === "leadership") return "Leadership";
  if (seniority === "staff") return "Staff / Principal";
  if (seniority === "senior") return "Senior";
  if (seniority === "entry") return "Entry";
  return "Mid";
}

function compactCurrency(value: number, currency: string) {
  const prefix = currency.toUpperCase() === "USD" || currency === "$" ? "$" : `${currency.toUpperCase()} `;
  return `${prefix}${Math.round(value / 1000)}k`;
}

function salaryFrom(row: JobRow) {
  const currency = row.salary_currency || "USD";
  if (row.salary_min && row.salary_max) {
    return `${compactCurrency(row.salary_min, currency)} to ${compactCurrency(row.salary_max, currency)}`;
  }
  if (row.salary_min) return `${compactCurrency(row.salary_min, currency)}+`;
  if (row.salary_max) return `Up to ${compactCurrency(row.salary_max, currency)}`;
  return "Comp not listed";
}

function tagsFrom(row: JobRow): string[] {
  const haystack = cleanText(`${row.title ?? ""} ${row.description_md ?? ""}`).toLowerCase();
  const tags = KEYWORD_TAGS.filter(({ terms }) => terms.some((term) => haystack.includes(term))).map(
    ({ tag }) => tag,
  );
  if (row.ats_type) tags.push(row.ats_type);
  if (row.source) tags.push(row.source);
  return Array.from(new Set(tags)).slice(0, 5);
}

function firstParam(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

function cleanInput(value: unknown, max = 80) {
  return firstParam(value)
    .replace(/[,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanQuery(value: unknown) {
  return cleanInput(value, 80);
}

function cleanCompanyList(value: unknown) {
  return firstParam(value)
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function positiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(firstParam(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseWorkplace(value: unknown): "All" | Workplace {
  const normalized = firstParam(value).toLowerCase();
  if (normalized === "remote") return "Remote";
  if (normalized === "hybrid") return "Hybrid";
  if (normalized === "on-site" || normalized === "onsite") return "On-site";
  return "All";
}

function parseDatePosted(value: unknown): JobBoardDatePosted {
  const normalized = firstParam(value).toLowerCase();
  if (normalized === "1d" || normalized === "7d" || normalized === "30d") return normalized;
  return "any";
}

function parseJobType(value: unknown): JobBoardJobType {
  const normalized = firstParam(value).toLowerCase();
  if (normalized === "full-time" || normalized === "part-time" || normalized === "contract" || normalized === "internship") {
    return normalized;
  }
  return "All";
}

function parseSeniority(value: unknown): JobBoardSeniority {
  const normalized = firstParam(value).toLowerCase();
  if (normalized === "entry" || normalized === "mid" || normalized === "senior" || normalized === "staff" || normalized === "leadership") {
    return normalized;
  }
  return "All";
}

function parseBoolean(value: unknown) {
  const normalized = firstParam(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseMinSalary(value: unknown) {
  const cleaned = firstParam(value).replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(parsed, 2_000_000);
}

function parseSource(value: unknown) {
  return firstParam(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function parseSort(value: unknown): JobBoardSort {
  const normalized = firstParam(value).toLowerCase();
  if (normalized === "company" || normalized === "role" || normalized === "salary") return normalized;
  return "recent";
}

export function parseJobBoardFilters(params: Record<string, unknown> = {}): JobBoardFilters {
  return {
    query: cleanQuery(params.q),
    workplace: parseWorkplace(params.workplace),
    datePosted: parseDatePosted(params.date),
    location: cleanInput(params.location, 80),
    jobType: parseJobType(params.type),
    seniority: parseSeniority(params.seniority),
    salaryListed: parseBoolean(params.salaryListed),
    minSalary: parseMinSalary(params.minSalary),
    company: cleanInput(params.company, 80),
    excludeCompany: cleanCompanyList(params.excludeCompany),
    source: parseSource(params.source),
    visaSponsorship: parseBoolean(params.visa),
    hideTracked: parseBoolean(params.hideTracked),
    sort: parseSort(params.sort),
    page: positiveInt(params.page, 1, 10_000),
    pageSize: positiveInt(params.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function ilikeValue(value: string) {
  return `%${value.replace(/[%_*]/g, " ").trim()}%`;
}

function dateCutoff(datePosted: JobBoardDatePosted) {
  const days = datePosted === "1d" ? 1 : datePosted === "7d" ? 7 : datePosted === "30d" ? 30 : 0;
  if (!days) return null;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function excludedCompanies(value: string) {
  return value
    .split(/\s*,\s*/)
    .map((company) => company.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function errorField(error: unknown, field: "code" | "message") {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

function isMissingOptionalJobBoardColumn(error: unknown) {
  if (errorField(error, "code") !== "42703") return false;
  const message = errorField(error, "message").toLowerCase();
  return OPTIONAL_JOB_BOARD_COLUMNS.some((column) => message.includes(column));
}

function needsLegacyClientFiltering(filters: JobBoardFilters) {
  return filters.jobType !== "All" || filters.seniority !== "All";
}

function legacyRowMatches(row: JobRow, filters: JobBoardFilters) {
  if (filters.jobType !== "All") {
    const type = normalizeJobType(row.job_type) ?? inferJobType(row.title, row.description_md);
    if (type !== filters.jobType) return false;
  }

  if (filters.seniority !== "All") {
    const seniority = normalizeSeniority(row.seniority) ?? inferSeniority(row.title, row.description_md);
    if (seniority !== filters.seniority) return false;
  }

  return true;
}

async function trackedJobIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) return [];

  const { data, error } = await supabase
    .from("applications")
    .select("job_id")
    .eq("user_id", user.id)
    .not("job_id", "is", null)
    .limit(5000);
  if (error) {
    await reportError("job board tracked exclusion fetch failed", error);
    return [];
  }
  return Array.from(new Set((data ?? []).map((row) => String(row.job_id)).filter(Boolean)));
}

async function userIdForTrackedExclusion(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  enabled: boolean,
) {
  if (!enabled) return null;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) return null;
  return user.id;
}

function mapJobRow(row: JobRow): JobListing {
  const title = cleanText(row.title) || "Open role";
  const company = cleanText(row.company) || "Unknown company";
  const description =
    cleanText(row.description_md).slice(0, 900) ||
    `${company} is hiring for ${title}. JobPosted will tailor your resume before you apply.`;

  return {
    id: row.id,
    title,
    company,
    companyDomain: row.company_domain ?? null,
    companyLogoUrl: row.company_logo_url ?? null,
    location: cleanText(row.location) || "Remote or unknown",
    workplace: workplaceFrom(row.remote),
    type: typeFrom(row),
    level: levelFrom(row),
    salary: salaryFrom(row),
    tags: tagsFrom(row),
    postedOn: row.posted_at ?? row.ingested_at ?? new Date().toISOString(),
    matchScore: 0,
    description,
    applyUrl: row.apply_url,
    atsType: row.ats_type,
    source: row.source,
    canSaveTailoredResume: true,
    featured: false,
  };
}

async function fetchJobRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: JobBoardFilters,
  schemaMode: "modern" | "legacy",
  from: number,
  to: number,
  trackedIds: string[],
) {
  const select = schemaMode === "modern" ? JOB_SELECT : CORE_JOB_SELECT;
  let query = supabase
    .from("jobs")
    .select(select, { count: "exact" })
    .is("closed_at", null)
    .not("apply_url", "is", null);

  if (filters.query) {
    const like = ilikeValue(filters.query);
    query = query.or(
      `title.ilike.${like},company.ilike.${like},location.ilike.${like},description_md.ilike.${like}`,
    );
  }

  if (filters.workplace === "Remote") {
    query = query.eq("remote", "remote");
  } else if (filters.workplace === "Hybrid") {
    query = query.eq("remote", "hybrid");
  } else if (filters.workplace === "On-site") {
    query = query.eq("remote", "on-site");
  }

  const cutoff = dateCutoff(filters.datePosted);
  if (cutoff) query = query.gte("posted_at", cutoff);
  if (filters.location) query = query.ilike("location", ilikeValue(filters.location));
  if (filters.jobType !== "All" && schemaMode === "modern") query = query.eq("job_type", filters.jobType);
  if (filters.seniority !== "All" && schemaMode === "modern") query = query.eq("seniority", filters.seniority);

  if (filters.salaryListed) {
    query =
      schemaMode === "modern"
        ? query.eq("salary_listed", true)
        : query.or("salary_min.not.is.null,salary_max.not.is.null");
  }

  if (filters.minSalary) {
    query =
      schemaMode === "modern"
        ? query.gte("salary_ceiling", filters.minSalary)
        : query.or(
            `salary_max.gte.${filters.minSalary},and(salary_max.is.null,salary_min.gte.${filters.minSalary})`,
          );
  }

  if (filters.company) query = query.ilike("company", ilikeValue(filters.company));
  if (filters.source) {
    query =
      schemaMode === "modern"
        ? query.eq("source_family", filters.source)
        : query.or(`source.eq.${filters.source},ats_type.eq.${filters.source}`);
  }
  if (filters.visaSponsorship) query = query.eq("visa_sponsorship", true);
  for (const company of excludedCompanies(filters.excludeCompany)) {
    query = query.filter("company", "not.ilike", ilikeValue(company));
  }

  if (trackedIds.length > 0) query = query.filter("id", "not.in", `(${trackedIds.join(",")})`);

  if (filters.sort === "company") {
    query = query.order("company", { ascending: true, nullsFirst: false }).order("title", { ascending: true });
  } else if (filters.sort === "role") {
    query = query.order("title", { ascending: true, nullsFirst: false }).order("company", { ascending: true });
  } else if (filters.sort === "salary") {
    query =
      schemaMode === "modern"
        ? query.order("salary_ceiling", { ascending: false, nullsFirst: false }).order("posted_at", { ascending: false, nullsFirst: false })
        : query.order("salary_max", { ascending: false, nullsFirst: false }).order("salary_min", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("posted_at", { ascending: false, nullsFirst: false }).order("ingested_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);
  return {
    rows: Array.isArray(data) ? (data as unknown as JobRow[]) : [],
    error,
    count,
  };
}

async function fetchJobRowsRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: JobBoardFilters,
  from: number,
) {
  const userId = await userIdForTrackedExclusion(supabase, filters.hideTracked);
  const args = {
    p_user_id: userId,
    p_query: filters.query,
    p_workplace: filters.workplace,
    p_posted_after: dateCutoff(filters.datePosted),
    p_location: filters.location,
    p_job_type: filters.jobType,
    p_seniority: filters.seniority,
    p_salary_listed: filters.salaryListed,
    p_min_salary: filters.minSalary,
    p_company: filters.company,
    p_exclude_companies: excludedCompanies(filters.excludeCompany),
    p_source: filters.source,
    p_visa_sponsorship: filters.visaSponsorship,
    p_hide_tracked: Boolean(userId && filters.hideTracked),
    p_sort: filters.sort,
    p_limit: filters.pageSize,
    p_offset: from,
  };
  const { data, error } = await supabase.rpc("job_board_listings_page", args);
  const rows = Array.isArray(data) ? (data as unknown as JobBoardRpcRow[]) : [];
  if (!error && rows.length === 0 && from > 0) {
    const { data: countProbe } = await supabase.rpc("job_board_listings_page", {
      ...args,
      p_limit: 1,
      p_offset: 0,
    });
    const countRows = Array.isArray(countProbe) ? (countProbe as unknown as JobBoardRpcRow[]) : [];
    return {
      rows: [] as JobRow[],
      error,
      count: Number(countRows[0]?.total_count ?? 0),
    };
  }
  return {
    rows: rows as JobRow[],
    error,
    count: Number(rows[0]?.total_count ?? 0),
  };
}

export async function getJobBoardListings(
  params: Record<string, unknown> = {},
): Promise<JobBoardListingPage> {
  const filters = parseJobBoardFilters(params);
  const supabase = await createSupabaseServerClient();
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let schemaMode: "modern" | "legacy" = "modern";
  const rpcResult = await fetchJobRowsRpc(supabase, filters, from);
  let rows = rpcResult.rows;
  let error = rpcResult.error;
  let count: number | null = rpcResult.count;

  if (error) {
    const trackedIds = filters.hideTracked ? await trackedJobIds(supabase) : [];
    ({ rows, error, count } = await fetchJobRows(supabase, filters, "modern", from, to, trackedIds));

    if (error && isMissingOptionalJobBoardColumn(error)) {
      schemaMode = "legacy";
      const shouldClientFilter = needsLegacyClientFiltering(filters);
      const legacyTo = shouldClientFilter
        ? Math.min(Math.max(to, filters.pageSize - 1), LEGACY_CLIENT_FILTER_LIMIT - 1)
        : to;
      const legacy = await fetchJobRows(
        supabase,
        filters,
        "legacy",
        shouldClientFilter ? 0 : from,
        legacyTo,
        trackedIds,
      );

      rows = legacy.rows;
      error = legacy.error;
      count = legacy.count;

      if (!error && shouldClientFilter) {
        const filteredRows = rows.filter((row) => legacyRowMatches(row, filters));
        rows = filteredRows.slice(from, to + 1);
        count = filteredRows.length;
      }
    }
  }

  if (error) {
    await reportError("job board fetch failed", error, {
      schemaMode,
    });
    return {
      jobs: [],
      total: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: 1,
      filters,
    };
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const listings = rows.filter((row) => row.id && (row.title || row.company)).map(mapJobRow);

  return {
    jobs: listings,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
    filters,
  };
}
