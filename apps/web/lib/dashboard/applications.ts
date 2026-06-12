import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  APPLICATIONS,
  DASHBOARD_STATS,
  QUEUE_TODAY,
  QUEUE_TOMORROW,
  type JobApplication,
  type QueuedJob,
} from "./sample-data";

type ApplicationRow = {
  id: string;
  status: string | null;
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function statusForDashboard(status: string | null): JobApplication["status"] {
  if (status === "submitted") return "submitted";
  if (status === "filled" || status === "ready_for_review") return "filled";
  if (status === "interview") return "interview";
  if (status === "rejected" || status === "failed") return "rejected";
  return "applied";
}

function scoreFromFieldMap(fieldMap: unknown) {
  const record = asRecord(fieldMap);
  const filled = record.fieldsFilled;
  if (!Array.isArray(filled) || filled.length === 0) return 0;
  const ok = filled.filter((item) => asRecord(item).status === "filled").length;
  return Math.round((ok / filled.length) * 100);
}

function mapRow(row: ApplicationRow): JobApplication {
  const fieldMap = asRecord(row.field_map);
  const applied = row.submitted_at ?? row.created_at ?? new Date().toISOString();
  const date = new Date(applied);
  const resumeUsed = asString(fieldMap.resumeUsed) || row.rendered_pdf_path || "#";
  const company = (row.jobs?.company ?? asString(fieldMap.company)) || "Unknown company";
  const role = (row.jobs?.title ?? asString(fieldMap.role)) || "Unknown role";
  return {
    id: row.id,
    role,
    company,
    location: row.jobs?.location ?? "Extension",
    appliedOn: date.toISOString().slice(0, 10),
    appliedAt: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    status: statusForDashboard(row.status),
    matchScore: scoreFromFieldMap(row.field_map),
    resumeName:
      resumeUsed === "#"
        ? `Resume · ${company} ${role}.pdf`
        : decodeURIComponent(resumeUsed.split("/").pop() || "Resume.pdf"),
    resumeUrl: resumeUsed,
  };
}

export async function getDashboardApplications() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id,status,submitted_at,created_at,rendered_pdf_path,field_map,jobs:job_id(company,title,location)",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("dashboard applications fetch failed", error);
    return APPLICATIONS;
  }

  return Array.isArray(data) ? (data as unknown as ApplicationRow[]).map(mapRow) : [];
}

export async function getDashboardQueue(): Promise<{
  today: JobApplication[];
  tomorrow: QueuedJob[];
}> {
  const applications = await getDashboardApplications();
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = applications.filter((application) => application.appliedOn === todayKey);
  return {
    today: today.length > 0 ? today : QUEUE_TODAY,
    tomorrow: QUEUE_TOMORROW,
  };
}

export async function getDashboardStats() {
  const applications = await getDashboardApplications();
  if (applications.length === 0 || applications === APPLICATIONS) return DASHBOARD_STATS;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const sentThisWeek = applications.filter(
    (application) => new Date(application.appliedOn).getTime() >= weekAgo,
  ).length;
  return {
    sentThisWeek,
    responses: applications.filter((application) =>
      ["viewed", "interview", "offer"].includes(application.status),
    ).length,
    interviews: applications.filter((application) => application.status === "interview").length,
    avgMatch: Math.round(
      applications.reduce((sum, application) => sum + application.matchScore, 0) /
        Math.max(applications.length, 1),
    ),
  };
}
