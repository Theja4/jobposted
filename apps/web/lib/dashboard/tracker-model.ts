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

/* ── Card colours ───────────────────────────────────────────────────────────
   A fixed set of 15 soft pastels. Every tracker card gets one, assigned
   deterministically from its id (stable, looks random, costs no storage). Users
   can override a card's colour from the detail dialog; the override is persisted
   client-side only. Text on cards always stays `ink`, so contrast holds on all 15. */
export type TrackerCardColor = {
  /** Stable identifier persisted for user overrides. */
  id: string;
  /** Human label for the swatch's accessible name. */
  name: string;
  /** Card fill (very light pastel). */
  bg: string;
  /** Resting hairline border. */
  border: string;
  /** Hover border + picker swatch (a touch deeper so it reads on white). */
  swatch: string;
};

export const TRACKER_CARD_COLORS: TrackerCardColor[] = [
  { id: "rose", name: "Rose", bg: "#fdecee", border: "#f6cdd5", swatch: "#f0a6b2" },
  { id: "pink", name: "Pink", bg: "#fcebf4", border: "#f5cbe2", swatch: "#eea7d0" },
  { id: "plum", name: "Plum", bg: "#f6ecfb", border: "#e6cef2", swatch: "#d3aeea" },
  { id: "violet", name: "Violet", bg: "#efecfc", border: "#d6cef5", swatch: "#bcb2ef" },
  { id: "indigo", name: "Indigo", bg: "#eaecfb", border: "#cbd1f4", swatch: "#aab6f0" },
  { id: "blue", name: "Blue", bg: "#e7f0fd", border: "#c4daf7", swatch: "#9ec8f2" },
  { id: "sky", name: "Sky", bg: "#e6f3fc", border: "#bfe0f5", swatch: "#97d1ef" },
  { id: "cyan", name: "Cyan", bg: "#e4f4f6", border: "#b8e4e8", swatch: "#8ed8dd" },
  { id: "teal", name: "Teal", bg: "#e5f4ef", border: "#bce5d8", swatch: "#92d7c2" },
  { id: "emerald", name: "Emerald", bg: "#e7f4ea", border: "#c2e4cc", swatch: "#9bd6ac" },
  { id: "green", name: "Green", bg: "#eef4e4", border: "#d3e5b8", swatch: "#bdd991" },
  { id: "lime", name: "Lime", bg: "#f3f3df", border: "#e1e4ad", swatch: "#cdd281" },
  { id: "amber", name: "Amber", bg: "#fbf1dc", border: "#f3dba8", swatch: "#eaca81" },
  { id: "orange", name: "Orange", bg: "#fceee3", border: "#f6d4b8", swatch: "#f0bd95" },
  { id: "stone", name: "Stone", bg: "#f1f0ec", border: "#dcd8d0", swatch: "#c8c2b8" },
];

function hashSeed(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function trackerColorById(id: string | null | undefined): TrackerCardColor | null {
  if (!id) return null;
  return TRACKER_CARD_COLORS.find((color) => color.id === id) ?? null;
}

/** Stable default colour for a card with no explicit override. */
export function defaultTrackerColor(seed: string): TrackerCardColor {
  return TRACKER_CARD_COLORS[hashSeed(seed) % TRACKER_CARD_COLORS.length]!;
}
