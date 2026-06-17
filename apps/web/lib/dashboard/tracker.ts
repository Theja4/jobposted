import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability/report";
import {
  TRACKER_SOURCE_LABELS,
  isBuiltInTrackerStage,
  isCustomTrackerStage,
  type TrackerSource,
  type TrackerStage,
  trackerSourceForApplyPath,
  trackerStageForStatus,
  type TrackerItem,
} from "./tracker-model";

type TrackerJobJoin = {
  id: string;
  company: string | null;
  company_domain: string | null;
  company_logo_url: string | null;
  title: string | null;
  location: string | null;
  apply_url: string | null;
  ats_type: string | null;
  source: string | null;
};

export type TrackerApplicationRow = {
  id: string;
  status: string | null;
  apply_path: string | null;
  submitted_at: string | null;
  created_at: string | null;
  rendered_pdf_path: string | null;
  field_map: unknown;
  failure_reason: string | null;
  jobs: TrackerJobJoin | TrackerJobJoin[] | null;
};

export const TRACKER_APPLICATION_SELECT =
  "id,status,apply_path,submitted_at,created_at,rendered_pdf_path,field_map,failure_reason,jobs:job_id(id,company,company_domain,company_logo_url,title,location,apply_url,ats_type,source)";

export type TrackerSort = "recent" | "fit" | "company" | "role" | "source";
export type TrackerSourceFilter = "all" | TrackerSource;
export type TrackerStageFilter = "all" | TrackerStage;

export type TrackerSummaryCounts = {
  tracked: number;
  needsReview: number;
  activePipeline: number;
};

export type TrackerPage = {
  items: TrackerItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: TrackerSummaryCounts;
};

export type TrackerPageOptions = {
  query?: string;
  source?: string;
  stage?: string;
  sort?: string;
  limit?: number;
  offset?: number;
};

type TrackerPageRpcRow = {
  id: string;
  status: string | null;
  apply_path: string | null;
  submitted_at: string | null;
  created_at: string | null;
  rendered_pdf_path: string | null;
  field_map: unknown;
  failure_reason: string | null;
  job_id: string | null;
  job_company: string | null;
  job_company_domain: string | null;
  job_company_logo_url: string | null;
  job_title: string | null;
  job_location: string | null;
  job_apply_url: string | null;
  job_ats_type: string | null;
  job_source: string | null;
  total_count: number | string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value!)));
}

function normalizeSource(value: unknown): TrackerSourceFilter {
  return value === "extension" || value === "job_board" || value === "server" || value === "manual"
    ? value
    : "all";
}

function normalizeStage(value: unknown): TrackerStageFilter {
  if (typeof value !== "string" || value === "all" || !value) return "all";
  return isBuiltInTrackerStage(value) || isCustomTrackerStage(value) ? value : "all";
}

function normalizeSort(value: unknown): TrackerSort {
  return value === "fit" || value === "company" || value === "role" || value === "source"
    ? value
    : "recent";
}

function totalFrom(value: unknown) {
  const numeric = typeof value === "string" ? Number(value) : asNumber(value);
  return numeric !== null && Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function countFilled(fieldMap: unknown) {
  const record = asRecord(fieldMap);
  const fields = record.fieldsFilled;
  if (!Array.isArray(fields)) return { filled: 0, total: 0 };
  return {
    filled: fields.filter((item) => asRecord(item).status === "filled").length,
    total: fields.length,
  };
}

function scoreFromFieldMap(fieldMap: unknown) {
  const record = asRecord(fieldMap);
  const explicit = asNumber(record.matchScore ?? record.score ?? record.rezoomedScore);
  if (explicit !== null) return Math.max(0, Math.min(100, Math.round(explicit)));
  const { filled, total } = countFilled(fieldMap);
  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}

function fileName(path: string | null) {
  if (!path) return "Resume pending";
  return decodeURIComponent(path.split("/").pop() || "Resume.pdf");
}

function joinedJob(value: TrackerApplicationRow["jobs"]): TrackerJobJoin | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function rowFromRpc(row: TrackerPageRpcRow): TrackerApplicationRow {
  const job =
    row.job_id || row.job_company || row.job_title
      ? {
          id: row.job_id ?? "",
          company: row.job_company,
          company_domain: row.job_company_domain,
          company_logo_url: row.job_company_logo_url,
          title: row.job_title,
          location: row.job_location,
          apply_url: row.job_apply_url,
          ats_type: row.job_ats_type,
          source: row.job_source,
        }
      : null;
  return {
    id: row.id,
    status: row.status,
    apply_path: row.apply_path,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    rendered_pdf_path: row.rendered_pdf_path,
    field_map: row.field_map,
    failure_reason: row.failure_reason,
    jobs: job,
  };
}

export function mapTrackerApplicationRow(row: TrackerApplicationRow): TrackerItem {
  const fieldMap = asRecord(row.field_map);
  const job = joinedJob(row.jobs);
  const date = row.submitted_at ?? row.created_at ?? new Date().toISOString();
  const source = trackerSourceForApplyPath(row.apply_path);
  const manualEditable = source === "manual" || source === "job_board";
  const fieldRole = asString(fieldMap.role);
  const fieldCompany = asString(fieldMap.company);
  const fieldCompanyDomain = asString(fieldMap.companyDomain);
  const fieldCompanyLogoUrl = asString(fieldMap.companyLogoUrl);
  const fieldLocation = asString(fieldMap.location);
  const fieldJobUrl = asString(fieldMap.jobUrl);
  const fieldResumeName = asString(fieldMap.resumeName);
  const role = ((manualEditable && fieldRole) || job?.title || fieldRole) || "Unknown role";
  const company = ((manualEditable && fieldCompany) || job?.company || fieldCompany) || "Unknown company";
  const location = ((manualEditable && fieldLocation) || job?.location || fieldLocation) || "Remote or unknown";
  const resumePath = asString(fieldMap.resumeUsed) || row.rendered_pdf_path || "";
  const counts = countFilled(row.field_map);
  const manual = asRecord(fieldMap.manual);

  return {
    id: row.id,
    jobId: job?.id ?? null,
    role,
    company,
    companyDomain: (job?.company_domain ?? fieldCompanyDomain) || null,
    companyLogoUrl: (job?.company_logo_url ?? fieldCompanyLogoUrl) || null,
    location,
    stage: trackerStageForStatus(row.status),
    status: row.status ?? "applied",
    source,
    sourceLabel: TRACKER_SOURCE_LABELS[source],
    platform: (job?.ats_type ?? asString(fieldMap.platform)) || null,
    jobUrl: ((manualEditable && fieldJobUrl) || job?.apply_url || fieldJobUrl) || null,
    appliedOn: new Date(date).toISOString().slice(0, 10),
    updatedAt: date,
    matchScore: scoreFromFieldMap(row.field_map),
    resumeName: fieldResumeName || fileName(resumePath || null),
    resumeUrl: resumePath || "#",
    fieldsFilled: counts.filled,
    totalFields: counts.total,
    notes: asString(manual.notes) || row.failure_reason || null,
  };
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: unknown }>,
  label: string,
  userId: string,
) {
  const { count, error } = await query;
  if (error) {
    await reportError(`tracker ${label} count failed`, error, { userId });
    return 0;
  }
  return count ?? 0;
}

async function getTrackerSummary(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<TrackerSummaryCounts> {
  const [tracked, needsReview, activePipeline] = await Promise.all([
    exactCount(
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId),
      "tracked",
      userId,
    ),
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["saved", "queued", "submitting", "filled", "ready_for_review"]),
      "needs review",
      userId,
    ),
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["applied", "submitted", "viewed", "reply", "interview", "offer"]),
      "active pipeline",
      userId,
    ),
  ]);
  return { tracked, needsReview, activePipeline };
}

export async function getTrackerPage(options: TrackerPageOptions = {}): Promise<TrackerPage> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const limit = clampInt(options.limit, 50, 1, 5000);
  const offset = clampInt(options.offset, 0, 0, 1_000_000);
  const empty: TrackerPage = {
    items: [],
    total: 0,
    limit,
    offset,
    hasMore: false,
    summary: { tracked: 0, needsReview: 0, activePipeline: 0 },
  };
  if (!user) return empty;

  const source = normalizeSource(options.source);
  const stage = normalizeStage(options.stage);
  const sort = normalizeSort(options.sort);
  const query = asString(options.query).slice(0, 120);
  const [summary, rpcResult] = await Promise.all([
    getTrackerSummary(supabase, user.id),
    supabase.rpc("tracker_applications_page", {
      p_user_id: user.id,
      p_query: query,
      p_source: source,
      p_stage: stage,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
    }),
  ]);

  const { data, error } = rpcResult;
  if (error) {
    await reportError("tracker applications page fetch failed", error, { userId: user.id });
    return { ...empty, summary };
  }

  const rows = Array.isArray(data) ? (data as unknown as TrackerPageRpcRow[]) : [];
  const total = rows.length > 0 ? totalFrom(rows[0]?.total_count) : 0;
  return {
    items: rows.map((row) => mapTrackerApplicationRow(rowFromRpc(row))),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    summary,
  };
}

export async function getTrackerItems(): Promise<TrackerItem[]> {
  return (await getTrackerPage({ limit: 500 })).items;
}
