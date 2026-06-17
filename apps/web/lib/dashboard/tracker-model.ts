export type BuiltInTrackerStage = "inbox" | "applied" | "interview" | "offer" | "closed";
export type CustomTrackerStage = `custom:${string}`;
export type TrackerStage = BuiltInTrackerStage | CustomTrackerStage;

export type TrackerSource = "extension" | "job_board" | "server" | "manual";

export interface TrackerItem {
  id: string;
  jobId: string | null;
  role: string;
  company: string;
  companyDomain: string | null;
  companyLogoUrl: string | null;
  location: string;
  stage: TrackerStage;
  status: string;
  source: TrackerSource;
  sourceLabel: string;
  platform: string | null;
  jobUrl: string | null;
  appliedOn: string;
  updatedAt: string;
  matchScore: number;
  resumeName: string;
  resumeUrl: string;
  fieldsFilled: number;
  totalFields: number;
  notes: string | null;
}

export interface ManualTrackerInput {
  jobId?: string;
  role: string;
  company: string;
  location?: string;
  jobUrl?: string;
  stage: TrackerStage;
  notes?: string;
  source?: "manual" | "job_board";
  sourceJobId?: string;
  matchScore?: number;
}

export type TrackerColumn = {
  id: TrackerStage;
  label: string;
  hint: string;
  custom?: boolean;
  preset?: boolean;
};

export const TRACKER_CUSTOM_COLUMN_LIMIT = 2;

export const TRACKER_COLUMNS: TrackerColumn[] = [
  { id: "inbox", label: "To review", hint: "Saved or filled" },
  { id: "applied", label: "Applied", hint: "Sent or logged" },
  { id: "interview", label: "Interviewing", hint: "Active replies" },
  { id: "offer", label: "Offer", hint: "Late stage" },
  { id: "closed", label: "Closed", hint: "Rejected or failed" },
];

export const TRACKER_CUSTOM_PRESETS: TrackerColumn[] = [
  {
    id: "custom:reviewed",
    label: "Reviewed",
    hint: "Looked over",
    custom: true,
    preset: true,
  },
  {
    id: "custom:contacted",
    label: "Contacted",
    hint: "Reached out",
    custom: true,
    preset: true,
  },
];

export const TRACKER_SOURCE_LABELS: Record<TrackerSource, string> = {
  extension: "Extension",
  job_board: "Job board",
  server: "Worker",
  manual: "Manual",
};

export const MANUAL_STAGE_OPTIONS: Array<{ value: TrackerStage; label: string }> = [
  { value: "inbox", label: "To review" },
  { value: "applied", label: "Applied" },
  { value: "interview", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "closed", label: "Closed" },
];

export function isBuiltInTrackerStage(stage: string | null | undefined): stage is BuiltInTrackerStage {
  return TRACKER_COLUMNS.some((column) => column.id === stage);
}

export function isCustomTrackerStage(stage: string | null | undefined): stage is CustomTrackerStage {
  return typeof stage === "string" && /^custom:[a-z0-9][a-z0-9-]{0,31}$/.test(stage);
}

export function customStageIdFromLabel(label: string): CustomTrackerStage | null {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug ? (`custom:${slug}` as CustomTrackerStage) : null;
}

export function labelForTrackerStage(stage: TrackerStage | string) {
  const knownColumn = [...TRACKER_COLUMNS, ...TRACKER_CUSTOM_PRESETS].find(
    (column) => column.id === stage,
  );
  if (knownColumn) return knownColumn.label;
  if (!stage.startsWith("custom:")) return stage;
  return stage
    .slice("custom:".length)
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function trackerStageFromInput(value: unknown, fallback: TrackerStage): TrackerStage {
  const stage = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (isBuiltInTrackerStage(stage) || isCustomTrackerStage(stage)) return stage;
  return fallback;
}

export function trackerStageForStatus(status: string | null | undefined): TrackerStage {
  const normalized = (status ?? "").toLowerCase();
  if (isCustomTrackerStage(normalized)) return normalized;
  if (normalized === "interview") return "interview";
  if (normalized === "offer") return "offer";
  if (normalized === "rejected" || normalized === "failed" || normalized === "closed") return "closed";
  if (
    normalized === "submitted" ||
    normalized === "applied" ||
    normalized === "viewed" ||
    normalized === "reply"
  ) {
    return "applied";
  }
  return "inbox";
}

export function statusForTrackerStage(stage: TrackerStage): string {
  if (stage === "inbox") return "saved";
  if (stage === "applied") return "submitted";
  if (stage === "interview") return "interview";
  if (stage === "offer") return "offer";
  if (stage === "closed") return "rejected";
  return stage;
}

export function trackerSourceForApplyPath(applyPath: string | null | undefined): TrackerSource {
  const normalized = (applyPath ?? "").toLowerCase();
  if (normalized === "extension") return "extension";
  if (normalized === "manual") return "manual";
  if (normalized === "server") return "server";
  return "job_board";
}
