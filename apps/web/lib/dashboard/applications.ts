import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeOnboardingConfig } from "@/lib/onboarding/model";
import { reportError } from "@/lib/observability/report";
import { type JobApplication } from "./sample-data";

type ApplicationRow = {
  id: string;
  status: string | null;
  apply_path: string | null;
  submitted_at: string | null;
  created_at: string | null;
  rendered_pdf_path: string | null;
  field_map: unknown;
  jobs:
    | {
        company: string | null;
        title: string | null;
        location: string | null;
      }
    | null;
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
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

async function averageMatchScore(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
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
  const company = (row.jobs?.company ?? asString(fieldMap.company)) || "Unknown company";
  const role = (row.jobs?.title ?? asString(fieldMap.role)) || "Unknown role";
  const location = (row.jobs?.location ?? asString(fieldMap.location)) || "Remote or unknown";
  return {
    id: row.id,
    role,
    company,
    location,
    appliedOn: date.toISOString().slice(0, 10),
    appliedAt: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    status: statusForDashboard(row.status),
    rawStatus: row.status,
    applyPath: row.apply_path,
    matchScore: scoreFromFieldMap(row.field_map),
    resumeName:
      resumeUsed === "#"
        ? `Resume · ${company} ${role}.pdf`
        : decodeURIComponent(resumeUsed.split("/").pop() || "Resume.pdf"),
    resumeUrl: resumeUsed,
  };
}

export async function getDashboardApplications(
  options: { includeQueueStatuses?: boolean } = {},
) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("applications")
    .select(
      "id,status,apply_path,submitted_at,created_at,rendered_pdf_path,field_map,jobs:job_id(company,title,location)",
    )
    .eq("apply_path", "server");

  if (!options.includeQueueStatuses) {
    query = query.in("status", [...JOBPOSTED_HISTORY_STATUSES]);
  }

  const { data, error } = await query
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    await reportError("dashboard applications fetch failed", error);
    return [];
  }

  return Array.isArray(data) ? (data as unknown as ApplicationRow[]).map(mapRow) : [];
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
  const applications = await getDashboardApplications({ includeQueueStatuses: true });
  const todayKey = new Date().toISOString().slice(0, 10);
  const [acknowledged, mode, tailorResume] = await Promise.all([
    getQueueAcknowledgedToday(),
    getApplicationMode(),
    getTailoringPreference(),
  ]);
  const today = applications.filter((application) => {
    if (application.appliedOn !== todayKey || application.applyPath !== "server") return false;
    if (mode === "review") {
      return ["ready_for_review", "filled", "queued", "submitting", "submitted"].includes(
        application.rawStatus ?? "",
      );
    }
    return ["queued", "submitting", "applied", "submitted"].includes(application.rawStatus ?? "");
  });
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
  const [sentThisWeek, responses, interviews, avgMatch] = await Promise.all([
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("apply_path", "server")
        .in("status", [...JOBPOSTED_HISTORY_STATUSES])
        .gte("submitted_at", weekAgo),
      "sent this week",
    ),
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("apply_path", "server")
        .in("status", [...RESPONSE_STATUSES]),
      "responses",
    ),
    exactCount(
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("apply_path", "server")
        .eq("status", "interview"),
      "interviews",
    ),
    averageMatchScore(supabase),
  ]);

  return {
    sentThisWeek,
    responses,
    interviews,
    avgMatch,
  };
}
