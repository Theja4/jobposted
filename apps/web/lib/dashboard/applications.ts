import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeOnboardingConfig } from "@/lib/onboarding/model";
import { reportError } from "@/lib/observability/report";
import { inferCompanyDomainFromCompanyName, logoDevCompanyLogoUrl } from "@jobposted/shared";
import { type JobApplication } from "./sample-data";

type ApplicationRow = {
  id: string;
  status: string | null;
  apply_path: string | null;
  submitted_at: string | null;
  created_at: string | null;
  rendered_pdf_path: string | null;
  field_map: unknown;
  job_company?: string | null;
  job_title?: string | null;
  job_location?: string | null;
  job_company_domain?: string | null;
  job_company_logo_url?: string | null;
  total_count?: number | null;
  jobs:
    | {
        company: string | null;
        company_domain: string | null;
        company_logo_url: string | null;
        title: string | null;
        location: string | null;
      }
    | null;
};

export const APPLICATION_HISTORY_PAGE_SIZE = 20;

const JOBPOSTED_HISTORY_STATUSES = [
  "applied",
  "submitted",
  "viewed",
  "interview",
  "offer",
  "rejected",
  "failed",
] as const;

const RESPONSE_STATUSES = ["viewed", "interview", "offer"] as const;

type ApplicationStatsRpcRow = {
  sent_this_week?: number | null;
  responses?: number | null;
  interviews?: number | null;
  avg_match?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(value: string | string[] | undefined, fallback = 1) {
  const parsed = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDateParam(value: string | string[] | undefined) {
  const text = firstParam(value)?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeHistoryQuery(value: string | string[] | undefined) {
  return (firstParam(value) ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function applicationModeFromValue(value: unknown): ApplicationMode | null {
  return value === "review" || value === "auto" ? value : null;
}

function statusForDashboard(status: string | null): JobApplication["status"] {
  if (status === "queued" || status === "submitting") return "queued";
  if (status === "submitted") return "submitted";
  if (status === "filled" || status === "ready_for_review") return "filled";
  if (status === "interview") return "interview";
  if (status === "rejected" || status === "failed") return "rejected";
  return "applied";
}

function scoreFromFieldMap(fieldMap: unknown) {
  const record = asRecord(fieldMap);
  const explicit = typeof record.matchScore === "number" && Number.isFinite(record.matchScore)
    ? record.matchScore
    : null;
  if (explicit !== null) return Math.max(0, Math.min(100, Math.round(explicit)));
  const filled = record.fieldsFilled;
  if (!Array.isArray(filled) || filled.length === 0) return 0;
  const ok = filled.filter((item) => asRecord(item).status === "filled").length;
  return Math.round((ok / filled.length) * 100);
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: unknown }>,
  label: string,
) {
  const { count, error } = await query;
  if (error) {
    await reportError(`dashboard ${label} count failed`, error);
    return 0;
  }
  return count ?? 0;
}

async function averageMatchScore(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  const chunkSize = 1000;
  const maxRows = Math.min(
    20_000,
    Math.max(1000, Number(process.env.DASHBOARD_MATCH_AVG_MAX_ROWS ?? 5000) || 5000),
  );
  let offset = 0;
  let sum = 0;
  let count = 0;

  while (offset < maxRows) {
    const { data, error } = await supabase
      .from("applications")
      .select("field_map")
      .eq("user_id", userId)
      .eq("apply_path", "server")
      .in("status", [...JOBPOSTED_HISTORY_STATUSES])
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + chunkSize - 1, maxRows - 1));
    if (error) {
      await reportError("dashboard average match fetch failed", error);
      break;
    }
    const rows = Array.isArray(data) ? (data as Array<{ field_map: unknown }>) : [];
    for (const row of rows) {
      sum += scoreFromFieldMap(row.field_map);
      count += 1;
    }
    if (rows.length < chunkSize) break;
    offset += rows.length;
  }

  return count > 0 ? Math.round(sum / count) : 0;
}

function mapRow(row: ApplicationRow): JobApplication {
  const fieldMap = asRecord(row.field_map);
  const applied = row.submitted_at ?? row.created_at ?? new Date().toISOString();
  const date = new Date(applied);
  const resumeUsed = asString(fieldMap.resumeUsed) || row.rendered_pdf_path || "#";
  const resumeDisplayName = asString(fieldMap.resumeName);
  const company = (row.jobs?.company ?? row.job_company ?? asString(fieldMap.company)) || "Unknown company";
  const companyDomain =
    (row.jobs?.company_domain ?? row.job_company_domain ?? asString(fieldMap.companyDomain)) ||
    inferCompanyDomainFromCompanyName(company);
  const companyLogoUrl =
    (row.jobs?.company_logo_url ?? row.job_company_logo_url ?? asString(fieldMap.companyLogoUrl)) ||
    logoDevCompanyLogoUrl({ companyDomain, companyName: company });
  const role = (row.jobs?.title ?? row.job_title ?? asString(fieldMap.role)) || "Unknown role";
  const location = (row.jobs?.location ?? row.job_location ?? asString(fieldMap.location)) || "Remote or unknown";
  return {
    id: row.id,
    role,
    company,
    companyDomain,
    companyLogoUrl,
    location,
    appliedOn: date.toISOString().slice(0, 10),
    appliedAt: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    status: statusForDashboard(row.status),
    rawStatus: row.status,
    applyPath: row.apply_path,
    matchScore: scoreFromFieldMap(row.field_map),
    resumeName:
      resumeDisplayName ||
      (resumeUsed === "#"
        ? `Resume · ${company} ${role}.pdf`
        : decodeURIComponent(resumeUsed.split("/").pop() || "Resume.pdf")),
    resumeUrl: resumeUsed,
  };
}

export async function getDashboardApplications(
  options: { includeQueueStatuses?: boolean; limit?: number } = {},
) {
  const supabase = await createSupabaseServerClient();
  const limit = Math.max(1, Math.min(options.limit ?? 100, 100));
  let query = supabase
    .from("applications")
    .select(
      "id,status,apply_path,submitted_at,created_at,rendered_pdf_path,field_map,jobs:job_id(company,company_domain,company_logo_url,title,location)",
    )
    .eq("apply_path", "server");

  if (!options.includeQueueStatuses) {
    query = query.in("status", [...JOBPOSTED_HISTORY_STATUSES]);
  }

  const { data, error } = await query
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    await reportError("dashboard applications fetch failed", error);
    return [];
  }

  return Array.isArray(data) ? (data as unknown as ApplicationRow[]).map(mapRow) : [];
}

type ApplicationHistoryRpcRow = Omit<ApplicationRow, "jobs"> & { jobs?: null };
type QueueRpcRow = Omit<ApplicationRow, "jobs" | "total_count"> & { jobs?: null };

async function fetchApplicationHistoryRpcPage({
  supabase,
  userId,
  query,
  dateFrom,
  dateTo,
  limit,
  offset,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  query: string;
  dateFrom: string | null;
  dateTo: string | null;
  limit: number;
  offset: number;
}) {
  const { data, error } = await supabase.rpc("history_applications_page", {
    p_user_id: userId,
    p_query: query,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    await reportError("dashboard application history page fetch failed", error, { userId });
    return { rows: [] as ApplicationHistoryRpcRow[], total: 0 };
  }

  const rows = Array.isArray(data) ? (data as unknown as ApplicationHistoryRpcRow[]) : [];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}

export async function getDashboardApplicationsPage(
  params: Record<string, string | string[] | undefined> = {},
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pageSize = APPLICATION_HISTORY_PAGE_SIZE;
  const query = normalizeHistoryQuery(params.q);
  const dateFrom = parseDateParam(params.from);
  const dateTo = parseDateParam(params.to);
  let page = parsePositiveInt(params.page, 1);
  if (!user) {
    return {
      applications: [] as JobApplication[],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 0,
      query,
      dateFrom,
      dateTo,
    };
  }

  let result = await fetchApplicationHistoryRpcPage({
    supabase,
    userId: user.id,
    query,
    dateFrom,
    dateTo,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  let total = result.total;
  let totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

  if (page > 1 && result.rows.length === 0) {
    const countProbe = await fetchApplicationHistoryRpcPage({
      supabase,
      userId: user.id,
      query,
      dateFrom,
      dateTo,
      limit: 1,
      offset: 0,
    });
    total = countProbe.total;
    totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    if (totalPages > 0) {
      page = totalPages;
      result = await fetchApplicationHistoryRpcPage({
        supabase,
        userId: user.id,
        query,
        dateFrom,
        dateTo,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
    }
  }

  return {
    applications: result.rows.map((row) => mapRow({ ...row, jobs: null })),
    total,
    page,
    pageSize,
    totalPages,
    query,
    dateFrom,
    dateTo,
  };
}

/** Has the signed-in user acknowledged today's batch? (DB-backed, server-read.) */
export async function getQueueAcknowledgedToday(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("queue_acknowledgements")
    .select("id")
    .eq("user_id", user.id)
    .eq("ack_date", new Date().toISOString().slice(0, 10))
    .maybeSingle();
  return Boolean(data);
}

export type ApplicationMode = "auto" | "review";

/** The user's application mode. Defaults to fully automatic unless onboarding has a saved preference. */
export async function getApplicationMode(): Promise<ApplicationMode> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "auto";
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  const profileMode = error ? null : applicationModeFromValue(asRecord(data).application_mode);
  if (profileMode) return profileMode;

  const { data: onboardingRow, error: onboardingError } = await supabase
    .from("onboarding_configurations")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!onboardingError && onboardingRow) {
    return sanitizeOnboardingConfig(asRecord(onboardingRow).data, user.email ?? "").final.applicationMode;
  }

  return "auto";
}

export async function getTailoringPreference(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;

  const { data: onboardingRow, error } = await supabase
    .from("onboarding_configurations")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !onboardingRow) return true;

  return sanitizeOnboardingConfig(asRecord(onboardingRow).data, user.email ?? "").final.tailorResume;
}

export async function getDashboardQueue(): Promise<{
  today: JobApplication[];
  acknowledged: boolean;
  mode: ApplicationMode;
  tailorResume: boolean;
}> {
  const todayKey = new Date().toISOString().slice(0, 10);
  const supabase = await createSupabaseServerClient();
  const [acknowledged, mode, tailorResume] = await Promise.all([
    getQueueAcknowledgedToday(),
    getApplicationMode(),
    getTailoringPreference(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      today: [],
      acknowledged,
      mode,
      tailorResume,
    };
  }

  const { data, error } = await supabase.rpc("dashboard_queue_today", {
    p_user_id: user.id,
    p_queue_date: todayKey,
    p_mode: mode,
    p_limit: 100,
  });

  let today: JobApplication[];
  if (error) {
    await reportError("dashboard queue rpc failed", error, { userId: user.id });
    const applications = await getDashboardApplications({ includeQueueStatuses: true });
    today = applications.filter((application) => {
      if (application.applyPath !== "server") return false;
      if (mode === "review") {
        const status = application.rawStatus ?? "";
        return (
          ["ready_for_review", "filled"].includes(status) ||
          (application.appliedOn === todayKey && ["queued", "submitting", "submitted"].includes(status))
        );
      }
      if (application.appliedOn !== todayKey) return false;
      return ["queued", "submitting", "applied", "submitted"].includes(application.rawStatus ?? "");
    });
  } else {
    const rows = Array.isArray(data) ? (data as unknown as QueueRpcRow[]) : [];
    today = rows.map((row) => mapRow({ ...row, jobs: null }));
  }

  return {
    today,
    acknowledged,
    mode,
    tailorResume,
  };
}

export async function getDashboardStats() {
  const supabase = await createSupabaseServerClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      sentThisWeek: 0,
      responses: 0,
      interviews: 0,
      avgMatch: 0,
    };
  }

  const { data: rpcData, error: rpcError } = await supabase
    .rpc("dashboard_application_stats", {
      p_user_id: user.id,
      p_week_start: weekAgo,
    })
    .maybeSingle();

  if (!rpcError && rpcData) {
    const row = rpcData as ApplicationStatsRpcRow;
    return {
      sentThisWeek: Number(row.sent_this_week ?? 0),
      responses: Number(row.responses ?? 0),
      interviews: Number(row.interviews ?? 0),
      avgMatch: Number(row.avg_match ?? 0),
    };
  }

  if (rpcError) {
    await reportError("dashboard stats rpc failed", rpcError, { userId: user.id });
  }

  const [sentThisWeek, responses, interviews, avgMatch] = await Promise.all([
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("apply_path", "server")
        .in("status", [...JOBPOSTED_HISTORY_STATUSES])
        .gte("submitted_at", weekAgo),
      "sent this week",
    ),
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("apply_path", "server")
        .in("status", [...RESPONSE_STATUSES]),
      "responses",
    ),
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("apply_path", "server")
        .eq("status", "interview"),
      "interviews",
    ),
    averageMatchScore(supabase, user.id),
  ]);

  return {
    sentThisWeek,
    responses,
    interviews,
    avgMatch,
  };
}
