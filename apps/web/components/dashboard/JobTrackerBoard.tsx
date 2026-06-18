"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownWideNarrow,
  BriefcaseBusiness,
  CircleOff,
  Clock3,
  Download,
  ListChecks,
  Loader2,
  MessageSquareReply,
  Plus,
  Search,
  Send,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { TrackerPage, TrackerSummaryCounts } from "@/lib/dashboard/tracker";
import {
  TRACKER_CUSTOM_COLUMN_LIMIT,
  TRACKER_CUSTOM_PRESETS,
  TRACKER_COLUMNS,
  TRACKER_SOURCE_LABELS,
  customStageIdFromLabel,
  defaultTrackerColor,
  isBuiltInTrackerStage,
  isCustomTrackerStage,
  labelForTrackerStage,
  statusForTrackerStage,
  trackerColorById,
  type ManualTrackerInput,
  type TrackerCardColor,
  type TrackerColumn,
  type TrackerItem,
  type TrackerSource,
  type TrackerStage,
} from "@/lib/dashboard/tracker-model";
import { CompanyAvatar } from "./CompanyAvatar";
import { DashboardSelect } from "./DashboardSelect";
import { TrackerDetailDialog, type TrackerEditPayload } from "./TrackerDetailDialog";

type SourceFilter = "all" | TrackerSource;
type StageFilter = "all" | TrackerStage;
type TrackerSort = "recent" | "fit" | "company" | "role" | "source";

const SOURCE_FILTERS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "extension", label: TRACKER_SOURCE_LABELS.extension },
  { value: "job_board", label: TRACKER_SOURCE_LABELS.job_board },
  { value: "server", label: TRACKER_SOURCE_LABELS.server },
  { value: "manual", label: TRACKER_SOURCE_LABELS.manual },
];

const TRACKER_SORT_OPTIONS: Array<{ value: TrackerSort; label: string }> = [
  { value: "recent", label: "Recent activity" },
  { value: "fit", label: "Best fit" },
  { value: "company", label: "Company A-Z" },
  { value: "role", label: "Role A-Z" },
  { value: "source", label: "Source" },
];

const CUSTOM_COLUMN_STORAGE_KEY = "jobposted.tracker.customColumns.v1";
const CARD_COLOR_STORAGE_KEY = "jobposted.tracker.cardColors.v1";

function readStoredCardColors(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CARD_COLOR_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && trackerColorById(value)) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function saveStoredCardColors(colors: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CARD_COLOR_STORAGE_KEY, JSON.stringify(colors));
}

const STAGE_ICONS: Record<string, typeof Clock3> = {
  inbox: Clock3,
  applied: Send,
  interview: MessageSquareReply,
  offer: Trophy,
  closed: CircleOff,
};

// Each stage owns a colour so columns read as distinct sections, not white blocks. The ramp
// runs left→right like a pipeline: neutral slate → brand blue → violet → green (offer is the
// good outcome) → rose (closed). Lanes are frosted tints; the icon tile + count carry the hue.
type StageTheme = { lane: string; iconTile: string; count: string };

const STAGE_THEME: Record<string, StageTheme> = {
  inbox: {
    lane: "border-white/55 bg-slate-100/35",
    iconTile: "bg-slate-200/80 text-slate-700",
    count: "bg-white/75 text-slate-700",
  },
  applied: {
    lane: "border-white/55 bg-brand-100/35",
    iconTile: "bg-brand-100 text-brand-700",
    count: "bg-white/75 text-brand-700",
  },
  interview: {
    lane: "border-white/55 bg-violet-100/35",
    iconTile: "bg-violet-100 text-violet-700",
    count: "bg-white/75 text-violet-700",
  },
  offer: {
    lane: "border-white/55 bg-emerald-100/35",
    iconTile: "bg-emerald-100 text-emerald-700",
    count: "bg-white/75 text-emerald-700",
  },
  closed: {
    lane: "border-white/55 bg-rose-100/35",
    iconTile: "bg-rose-100 text-rose-700",
    count: "bg-white/75 text-rose-700",
  },
};

const CUSTOM_STAGE_THEME: StageTheme = {
  lane: "border-white/55 bg-cyan-100/35",
  iconTile: "bg-cyan-100 text-cyan-700",
  count: "bg-white/75 text-cyan-700",
};

const DEFAULT_STAGE_THEME: StageTheme = {
  lane: "border-white/55 bg-zinc-100/35",
  iconTile: "bg-zinc-200/80 text-zinc-700",
  count: "bg-white/75 text-zinc-700",
};

function stageTheme(id: string): StageTheme {
  return STAGE_THEME[id] ?? (id.startsWith("custom:") ? CUSTOM_STAGE_THEME : DEFAULT_STAGE_THEME);
}

const EMPTY_FORM: ManualTrackerInput = {
  role: "",
  company: "",
  location: "",
  jobUrl: "",
  stage: "applied",
  notes: "",
};

// Frosted "liquid glass" system (globals.css: .liquid-glass / .glass-chip) over a soft
// ambient gradient. Surfaces are translucent frosted panels; state highlights use
// `outline` (a separate property) so they never fight the glass box-shadow. Text stays
// dark ink on the light glass, and cards stay solid pastel — both for readability.
const TRACKER_PANEL_CLASS = "liquid-glass";
const TRACKER_CONTROL_CLASS = "glass-chip";
const TRACKER_CONTROL_FOCUS_CLASS =
  "focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand-600";
const TRACKER_CONTROL_FOCUS_WITHIN_CLASS =
  "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600";
const TRACKER_INPUT_CLASS = cn(
  "h-11 w-full rounded-xl px-3 text-sm font-semibold text-ink outline-none transition placeholder:text-zinc-500 disabled:opacity-60",
  TRACKER_CONTROL_CLASS,
  TRACKER_CONTROL_FOCUS_CLASS,
);
const TRACKER_BUTTON_CLASS = "glass-chip text-ink transition-colors hover:text-brand-700";
const TRACKER_PRIMARY_BUTTON_CLASS =
  "bg-brand-600 text-white shadow-[0_14px_30px_-14px_rgba(31,100,224,0.55)] transition-colors hover:bg-brand-700";
const TRACKER_ICON_BUTTON_CLASS = "glass-chip text-muted transition-colors hover:text-brand-700";
const TRACKER_CHIP_SHADOW_CLASS = "shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Translucent fill from a palette hex so cards read as frosted glass over the lane/gradient. */
function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function stageCount(items: TrackerItem[], stage: TrackerStage) {
  return items.filter((item) => item.stage === stage).length;
}

function trackerStageLabel(stage: TrackerStage) {
  return labelForTrackerStage(stage);
}

function isTrackerStage(value: string | undefined): value is TrackerStage {
  return isBuiltInTrackerStage(value) || isCustomTrackerStage(value);
}

function iconForStage(stage: TrackerStage) {
  return STAGE_ICONS[stage] ?? ListChecks;
}

function customColumnForStage(stage: TrackerStage): TrackerColumn {
  return {
    id: stage,
    label: labelForTrackerStage(stage),
    hint: "Custom stage",
    custom: true,
  };
}

function columnLabelFromInput(label: string) {
  return label.trim().replace(/\s+/g, " ").slice(0, 24);
}

function readStoredCustomColumns(): TrackerColumn[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_COLUMN_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const columns: TrackerColumn[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : "";
      const label = typeof record.label === "string" ? columnLabelFromInput(record.label) : "";
      if (!isCustomTrackerStage(id) || !label || columns.some((column) => column.id === id)) continue;
      columns.push({
        id,
        label,
        hint: typeof record.hint === "string" && record.hint.trim() ? record.hint.trim() : "Custom stage",
        custom: true,
        preset: Boolean(record.preset),
      });
      if (columns.length >= TRACKER_CUSTOM_COLUMN_LIMIT) break;
    }
    return columns;
  } catch {
    return [];
  }
}

function saveStoredCustomColumns(columns: TrackerColumn[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_COLUMN_STORAGE_KEY, JSON.stringify(columns));
}

function isInteractiveCardTarget(target: EventTarget | null) {
  // Note: the card root itself is role="button" (keyboard open), so it is deliberately
  // excluded here — otherwise every drag/click would match it and be suppressed.
  return target instanceof HTMLElement
    ? Boolean(target.closest("a, button, input, select, textarea, label"))
    : false;
}

function setRoundedDragImage(event: React.DragEvent<HTMLElement>) {
  const source = event.currentTarget;
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.top = "-1000px";
  clone.style.left = "-1000px";
  clone.style.width = `${rect.width}px`;
  clone.style.pointerEvents = "none";
  clone.style.borderRadius = "1rem";
  clone.style.overflow = "hidden";
  clone.style.clipPath = "inset(0 round 1rem)";
  clone.style.background = getComputedStyle(source).backgroundColor || "#ffffff";
  clone.style.boxShadow = "0 18px 36px rgba(11, 18, 32, 0.16)";
  clone.style.opacity = "0.96";
  document.body.appendChild(clone);
  event.dataTransfer.setDragImage(
    clone,
    Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  );
  window.setTimeout(() => clone.remove(), 0);
}

function byRecent(a: TrackerItem, b: TrackerItem) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function sortTrackerItems(items: TrackerItem[], sort: TrackerSort) {
  const sorted = [...items];
  if (sort === "fit") return sorted.sort((a, b) => b.matchScore - a.matchScore || byRecent(a, b));
  if (sort === "company") {
    return sorted.sort(
      (a, b) =>
        a.company.localeCompare(b.company, undefined, { sensitivity: "base" }) ||
        a.role.localeCompare(b.role, undefined, { sensitivity: "base" }),
    );
  }
  if (sort === "role") {
    return sorted.sort(
      (a, b) =>
        a.role.localeCompare(b.role, undefined, { sensitivity: "base" }) ||
        a.company.localeCompare(b.company, undefined, { sensitivity: "base" }),
    );
  }
  if (sort === "source") {
    return sorted.sort(
      (a, b) =>
        a.sourceLabel.localeCompare(b.sourceLabel, undefined, { sensitivity: "base" }) ||
        byRecent(a, b),
    );
  }
  return sorted.sort(byRecent);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).replace(/\r?\n|\r/g, " ");
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function downloadTrackerCsv(items: TrackerItem[]) {
  const headers = [
    "Role",
    "Company",
    "Location",
    "Stage",
    "Status",
    "Source",
    "Platform",
    "Match score",
    "Fields filled",
    "Total fields",
    "Applied on",
    "Updated at",
    "Job URL",
    "Resume",
    "Notes",
  ];
  const rows = items.map((item) => [
    item.role,
    item.company,
    item.location,
    trackerStageLabel(item.stage),
    item.status,
    item.sourceLabel,
    item.platform ?? "",
    item.matchScore > 0 ? `${item.matchScore}%` : "",
    item.fieldsFilled,
    item.totalFields,
    item.appliedOn,
    item.updatedAt,
    item.jobUrl ?? "",
    item.resumeUrl === "#" ? "" : item.resumeUrl,
    item.notes ?? "",
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jobposted-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function TrackerSummary({ summary }: { summary: TrackerSummaryCounts }) {
  const stats = [
    { label: "tracked", value: summary.tracked },
    { label: "review", value: summary.needsReview },
    { label: "active", value: summary.activePipeline },
  ];

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-muted">
      {stats.map(({ label, value }, index) => (
        <span key={label} className="inline-flex items-baseline gap-1">
          {index > 0 && <span className="text-zinc-300">/</span>}
          <span className="font-black text-ink">{value}</span>
          <span>{label}</span>
        </span>
      ))}
    </p>
  );
}

function ManualAddPanel({
  open,
  onClose,
  onSave,
  editingItem,
  stageOptions,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (item: TrackerItem) => void;
  editingItem: TrackerItem | null;
  stageOptions: Array<{ value: TrackerStage; label: string }>;
}) {
  const reduce = useReducedMotion();
  const [form, setForm] = useState<ManualTrackerInput>(EMPTY_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(editingItem);

  useEffect(() => {
    if (!open) return;
    setForm(
      editingItem
        ? {
            role: editingItem.role,
            company: editingItem.company,
            location: editingItem.location,
            jobUrl: editingItem.jobUrl ?? "",
            stage: editingItem.stage,
            notes: editingItem.notes ?? "",
          }
        : EMPTY_FORM,
    );
    setError(null);
  }, [editingItem, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/tracker/applications", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editingItem?.id, ...form } : form),
      });
      const body = (await response.json()) as { ok: boolean; message?: string; item?: TrackerItem };
      if (!response.ok || !body.ok || !body.item) {
        throw new Error(body.message || "Could not add that role.");
      }
      onSave(body.item);
      if (!isEditing) setForm(EMPTY_FORM);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that role.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={cn("rounded-2xl p-5", TRACKER_PANEL_CLASS)}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em] text-ink">
                {isEditing ? "Edit role" : "Add a role"}
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted">
                {isEditing
                  ? "Update the details that appear on your tracker board."
                  : "Log a role that did not come through JobPosted."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={isEditing ? "Close edit role" : "Close manual add"}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl hover:bg-zinc-50 hover:text-ink",
                TRACKER_ICON_BUTTON_CLASS,
              )}
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={submit} className="grid gap-3 lg:grid-cols-6">
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink">Role</span>
              <input
                required
                value={form.role}
                onChange={(e) => setForm((next) => ({ ...next, role: e.target.value }))}
                className={TRACKER_INPUT_CLASS}
                placeholder="Product Manager"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink">Company</span>
              <input
                required
                value={form.company}
                onChange={(e) => setForm((next) => ({ ...next, company: e.target.value }))}
                className={TRACKER_INPUT_CLASS}
                placeholder="Acme"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-ink">Location</span>
              <input
                value={form.location}
                onChange={(e) => setForm((next) => ({ ...next, location: e.target.value }))}
                className={TRACKER_INPUT_CLASS}
                placeholder="Remote"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-ink">Stage</span>
              <DashboardSelect
                value={form.stage}
                options={stageOptions}
                onChange={(stage) => setForm((next) => ({ ...next, stage }))}
                ariaLabel="Stage"
                buttonClassName={TRACKER_INPUT_CLASS}
              />
            </label>
            <label className="lg:col-span-3">
              <span className="mb-1.5 block text-xs font-bold text-ink">Job URL</span>
              <input
                type="url"
                value={form.jobUrl}
                onChange={(e) => setForm((next) => ({ ...next, jobUrl: e.target.value }))}
                className={TRACKER_INPUT_CLASS}
                placeholder="https://"
              />
            </label>
            <label className="lg:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-ink">Notes</span>
              <input
                value={form.notes}
                onChange={(e) => setForm((next) => ({ ...next, notes: e.target.value }))}
                className={TRACKER_INPUT_CLASS}
                placeholder="Recruiter, referral, follow-up"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={pending}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:pointer-events-none disabled:opacity-60",
                  TRACKER_PRIMARY_BUTTON_CLASS,
                )}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {isEditing ? "Save" : "Add"}
              </button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function AddColumnPanel({
  open,
  onClose,
  columns,
  onAddColumn,
  onRemoveColumn,
}: {
  open: boolean;
  onClose: () => void;
  columns: TrackerColumn[];
  onAddColumn: (column: TrackerColumn) => string | null;
  onRemoveColumn: (column: TrackerColumn) => void;
}) {
  const reduce = useReducedMotion();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = columns.length >= TRACKER_CUSTOM_COLUMN_LIMIT;

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
  }, [open]);

  function addColumn(column: TrackerColumn) {
    const addError = onAddColumn(column);
    setError(addError);
    if (!addError) setName("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (full) {
      setError("You can add up to two custom columns.");
      return;
    }
    const label = columnLabelFromInput(name);
    const id = customStageIdFromLabel(label);
    if (!id || !label) {
      setError("Enter a column name.");
      return;
    }
    addColumn({ id, label, hint: "Custom stage", custom: true });
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className={cn("rounded-2xl p-5", TRACKER_PANEL_CLASS)}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700", TRACKER_CHIP_SHADOW_CLASS)}>
                  <ListChecks className="size-4" />
                </span>
                <div>
                  <h2 className="text-base font-extrabold tracking-[-0.02em] text-ink">
                    Add tracker column
                  </h2>
                  <p className="mt-0.5 text-sm font-semibold text-muted">
                    Add Reviewed, Contacted, or a custom stage. Two extra columns max.
                  </p>
                </div>
              </div>
              {columns.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {columns.map((column) => (
                    <span
                      key={column.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full bg-brand-50 pl-2.5 pr-1 py-1 text-xs font-black text-brand-700",
                        TRACKER_CHIP_SHADOW_CLASS,
                      )}
                    >
                      {column.label}
                      <button
                        type="button"
                        onClick={() => onRemoveColumn(column)}
                        aria-label={`Remove ${column.label} column`}
                        className="grid size-5 place-items-center rounded-full text-brand-700 transition-colors hover:bg-white hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close add column"
              className={cn(
                "grid size-9 shrink-0 place-items-center self-start rounded-xl hover:bg-zinc-50 hover:text-ink lg:self-auto",
                TRACKER_ICON_BUTTON_CLASS,
              )}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1.4fr]">
            <div className="grid gap-2 sm:grid-cols-2">
              {TRACKER_CUSTOM_PRESETS.map((preset) => {
                const selected = columns.some((column) => column.id === preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={selected || (full && !selected)}
                    onClick={() => addColumn(preset)}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-brand-50 px-3 text-left ring-1 ring-brand-100 transition-colors hover:bg-brand-100 disabled:pointer-events-none disabled:opacity-55"
                  >
                    <span>
                      <span className="block text-sm font-black text-brand-900">{preset.label}</span>
                      <span className="block text-xs font-bold text-brand-700">{preset.hint}</span>
                    </span>
                    <Plus className="size-4 shrink-0 text-brand-700" />
                  </button>
                );
              })}
            </div>

            <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-ink">Custom column name</span>
                <input
                  value={name}
                  disabled={full}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  className={TRACKER_INPUT_CLASS}
                  placeholder={full ? "Custom limit reached" : "Followed up"}
                />
              </label>
              <button
                type="submit"
                disabled={full}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl px-4 text-sm font-black disabled:pointer-events-none disabled:opacity-55",
                  TRACKER_PRIMARY_BUTTON_CLASS,
                )}
              >
                <Plus className="size-4" />
                Add
              </button>
            </form>
          </div>

          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function TrackerCard({
  item,
  color,
  busy,
  dragging,
  onOpen,
  onDragEnd,
  onDragStart,
  onCardPointerCancel,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
}: {
  item: TrackerItem;
  color: TrackerCardColor;
  busy: boolean;
  dragging: boolean;
  onOpen: (item: TrackerItem) => void;
  onDragEnd: () => void;
  onDragStart: (item: TrackerItem, event: React.DragEvent<HTMLElement>) => void;
  onCardPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onCardPointerDown: (item: TrackerItem, event: React.PointerEvent<HTMLElement>) => void;
  onCardPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onCardPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  function handleClick(event: React.MouseEvent<HTMLElement>) {
    if (busy || isInteractiveCardTarget(event.target)) return;
    onOpen(item);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!busy) onOpen(item);
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className={cn(dragging && "opacity-45")}
    >
      <div
        role="button"
        tabIndex={0}
        draggable={!busy}
        aria-label={`Open ${item.role} at ${item.company}`}
        title="Open details · drag to move stage"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragStart={(event) => onDragStart(item, event)}
        onDragEnd={onDragEnd}
        onPointerCancel={onCardPointerCancel}
        onPointerDown={(event) => onCardPointerDown(item, event)}
        onPointerMove={onCardPointerMove}
        onPointerUp={onCardPointerUp}
        style={{ backgroundColor: withAlpha(color.bg, 0.72) }}
        className={cn(
          "group cursor-grab touch-none rounded-[1.25rem] border border-white/55 p-3 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-md transition-[transform,box-shadow,border-color] duration-200 ease-out active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
          dragging
            ? "scale-[0.99] border-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_30px_-18px_rgba(31,100,224,0.4)]"
            : "hover:-translate-y-0.5 hover:border-white/90 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_18px_34px_-20px_rgba(16,47,102,0.28)]",
          busy && "cursor-default",
        )}
      >
        <div className="flex items-center gap-3">
          <CompanyAvatar
            company={item.company}
            logoUrl={item.companyLogoUrl}
            colorSeed={item.source === "manual" ? item.id : undefined}
            size="sm"
            className="bg-white shadow-none ring-1 ring-black/5"
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-sm font-extrabold leading-tight text-ink group-hover:line-clamp-none">
              {item.role}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-xs font-bold text-ink/65 group-hover:line-clamp-none">
              {item.company} · {formatDate(item.updatedAt)}
            </p>
          </div>
          <ArrowUpRight
            className="size-4 shrink-0 text-ink/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden
          />
        </div>
      </div>
    </motion.article>
  );
}

function TrackerColumn({
  column,
  items,
  busyId,
  draggingId,
  dragOverStage,
  colorForItem,
  onOpen,
  onRemoveColumn,
  onCardDragEnd,
  onCardDragStart,
  onColumnDragLeave,
  onColumnDragOver,
  onColumnDrop,
  onCardPointerCancel,
  onCardPointerDown,
  onCardPointerMove,
  onCardPointerUp,
}: {
  column: TrackerColumn;
  items: TrackerItem[];
  busyId: string | null;
  draggingId: string | null;
  dragOverStage: TrackerStage | null;
  colorForItem: (item: TrackerItem) => TrackerCardColor;
  onOpen: (item: TrackerItem) => void;
  onRemoveColumn: (column: TrackerColumn) => void;
  onCardDragEnd: () => void;
  onCardDragStart: (item: TrackerItem, event: React.DragEvent<HTMLElement>) => void;
  onColumnDragLeave: (stage: TrackerStage, event: React.DragEvent<HTMLElement>) => void;
  onColumnDragOver: (stage: TrackerStage, event: React.DragEvent<HTMLElement>) => void;
  onColumnDrop: (stage: TrackerStage, event: React.DragEvent<HTMLElement>) => void;
  onCardPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  onCardPointerDown: (item: TrackerItem, event: React.PointerEvent<HTMLElement>) => void;
  onCardPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onCardPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
}) {
  const Icon = iconForStage(column.id);
  const theme = stageTheme(column.id);
  const draggingOver = dragOverStage === column.id;

  return (
    <section
      data-tracker-stage={column.id}
      onDragOver={(event) => onColumnDragOver(column.id, event)}
      onDragLeave={(event) => onColumnDragLeave(column.id, event)}
      onDrop={(event) => onColumnDrop(column.id, event)}
      className={cn(
        "flex min-h-[20rem] min-w-0 flex-col rounded-[1.75rem] border p-3 outline outline-2 -outline-offset-2 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-[outline-color]",
        theme.lane,
        draggingOver ? "outline-brand-400" : "outline-transparent",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className={cn("grid size-8 place-items-center rounded-xl", theme.iconTile, TRACKER_CHIP_SHADOW_CLASS)}>
            <Icon className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-ink">{column.label}</h2>
            <p className="text-[11px] font-bold text-muted">{column.hint}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {column.custom && (
            <button
              type="button"
              onClick={() => onRemoveColumn(column)}
              aria-label={`Remove ${column.label} column`}
              className={cn(
                "grid size-8 place-items-center rounded-xl hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                TRACKER_ICON_BUTTON_CLASS,
              )}
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", theme.count, TRACKER_CHIP_SHADOW_CLASS)}>
            {items.length}
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <TrackerCard
              key={item.id}
              item={item}
              color={colorForItem(item)}
              busy={busyId === item.id}
              dragging={draggingId === item.id}
              onOpen={onOpen}
              onDragEnd={onCardDragEnd}
              onDragStart={onCardDragStart}
              onCardPointerCancel={onCardPointerCancel}
              onCardPointerDown={onCardPointerDown}
              onCardPointerMove={onCardPointerMove}
              onCardPointerUp={onCardPointerUp}
            />
          ))}
        </AnimatePresence>
      </div>

      {items.length === 0 && (
        <div
          className={cn(
            "mt-1 flex flex-1 items-center justify-center rounded-xl px-4 py-8 text-center transition-colors",
            draggingOver && "bg-white/40",
          )}
        >
          <p className="text-xs font-bold leading-5 text-muted">
            {draggingId ? `Drop in ${column.label}.` : "No roles here right now."}
          </p>
        </div>
      )}
    </section>
  );
}

type TrackerPageResponse = TrackerPage & { ok?: boolean; message?: string };

export function JobTrackerBoard({ initialPage }: { initialPage: TrackerPage }) {
  const [items, setItems] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [offset, setOffset] = useState(initialPage.offset);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [summary, setSummary] = useState(initialPage.summary);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [stage, setStage] = useState<StageFilter>("all");
  const [sort, setSort] = useState<TrackerSort>("recent");
  const [manualOpen, setManualOpen] = useState(initialPage.total === 0);
  const [columnPanelOpen, setColumnPanelOpen] = useState(false);
  const [columnsLoaded, setColumnsLoaded] = useState(false);
  const [customColumns, setCustomColumns] = useState<TrackerColumn[]>([]);
  const [editingItem, setEditingItem] = useState<TrackerItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<TrackerItem | null>(null);
  const [cardColors, setCardColors] = useState<Record<string, string>>({});
  const [cardColorsLoaded, setCardColorsLoaded] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<TrackerStage | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const firstPageLoad = useRef(true);

  const pageLimit = initialPage.limit || 50;

  useEffect(() => {
    setCustomColumns(readStoredCustomColumns());
    setColumnsLoaded(true);
  }, []);

  useEffect(() => {
    setCardColors(readStoredCardColors());
    setCardColorsLoaded(true);
  }, []);

  useEffect(() => {
    if (!cardColorsLoaded) return;
    saveStoredCardColors(cardColors);
  }, [cardColorsLoaded, cardColors]);

  const colorForItem = useCallback(
    (item: TrackerItem) => trackerColorById(cardColors[item.id]) ?? defaultTrackerColor(item.id),
    [cardColors],
  );

  const setCardColor = useCallback((id: string, colorId: string) => {
    setCardColors((current) => ({ ...current, [id]: colorId }));
  }, []);

  // Inline edit from the detail popup. PATCHes the item, then updates the board list and the
  // open popup in place. Returns an error message for the dialog to show (the board's error
  // banner sits behind the modal, so save errors must surface inside the dialog), or null.
  async function saveDetailEdits(payload: TrackerEditPayload): Promise<string | null> {
    if (!detailItem) return "Something went wrong. Reopen the role and try again.";
    const id = detailItem.id;
    setBusyId(id);
    try {
      const response = await fetch("/api/tracker/applications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const body = (await response.json()) as { ok: boolean; message?: string; item?: TrackerItem };
      if (!response.ok || !body.ok || !body.item) {
        return body.message || "Could not save those changes.";
      }
      upsertItem(body.item);
      setDetailItem(body.item);
      return null;
    } catch {
      return "Could not save those changes. Check your connection and try again.";
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback(
    async (nextOffset: number, limit = pageLimit) => {
      const params = new URLSearchParams({
        query: debouncedQuery,
        source,
        stage,
        sort,
        limit: String(limit),
        offset: String(nextOffset),
      });
      const response = await fetch(`/api/tracker/applications?${params.toString()}`);
      const body = (await response.json()) as TrackerPageResponse;
      if (!response.ok || body.ok === false) {
        throw new Error(body.message || "Could not load tracker items.");
      }
      return body;
    },
    [debouncedQuery, pageLimit, sort, source, stage],
  );

  const loadPage = useCallback(
    async (nextOffset: number, mode: "replace" | "append") => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setPageLoading(true);
      setMutationError(null);
      try {
        const page = await fetchPage(nextOffset);
        if (requestSeq.current !== seq) return;
        setItems((current) => (mode === "append" ? [...current, ...page.items] : page.items));
        setTotal(page.total);
        setOffset(page.offset);
        setHasMore(page.hasMore);
        setSummary(page.summary);
      } catch (err) {
        if (requestSeq.current === seq) {
          setMutationError(err instanceof Error ? err.message : "Could not load tracker items.");
        }
      } finally {
        if (requestSeq.current === seq) setPageLoading(false);
      }
    },
    [fetchPage],
  );

  const reloadFirstPage = useCallback(() => {
    void loadPage(0, "replace");
  }, [loadPage]);

  useEffect(() => {
    if (firstPageLoad.current) {
      firstPageLoad.current = false;
      return;
    }
    void loadPage(0, "replace");
  }, [debouncedQuery, loadPage, sort, source, stage]);

  useEffect(() => {
    if (!columnsLoaded) return;
    saveStoredCustomColumns(customColumns);
  }, [columnsLoaded, customColumns]);

  const activeCustomColumns = useMemo(() => {
    const merged = [...customColumns];
    for (const item of items) {
      if (!isCustomTrackerStage(item.stage) || merged.some((column) => column.id === item.stage)) {
        continue;
      }
      const preset = TRACKER_CUSTOM_PRESETS.find((column) => column.id === item.stage);
      merged.push(preset ?? customColumnForStage(item.stage));
      if (merged.length >= TRACKER_CUSTOM_COLUMN_LIMIT) break;
    }
    return merged.slice(0, TRACKER_CUSTOM_COLUMN_LIMIT);
  }, [customColumns, items]);

  const trackerColumns = useMemo(
    () => [...TRACKER_COLUMNS, ...activeCustomColumns],
    [activeCustomColumns],
  );

  const stageOptions = useMemo(
    () => trackerColumns.map((column) => ({ value: column.id, label: column.label })),
    [trackerColumns],
  );

  const stageFilterOptions = useMemo(
    () => [
      { value: "all" as StageFilter, label: "All stages" },
      ...trackerColumns.map((column) => ({ value: column.id, label: column.label })),
    ],
    [trackerColumns],
  );

  const filtered = items;

  const byStage = useMemo(
    () =>
      Object.fromEntries(
        trackerColumns.map((column) => [
          column.id,
          filtered.filter((item) => item.stage === column.id),
        ]),
      ) as Record<TrackerStage, TrackerItem[]>,
    [filtered, trackerColumns],
  );

  function upsertItem(item: TrackerItem) {
    setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
    reloadFirstPage();
  }

  function closeEditor() {
    setManualOpen(false);
    setEditingItem(null);
  }

  function addCustomColumn(column: TrackerColumn) {
    const label = columnLabelFromInput(column.label);
    if (!isCustomTrackerStage(column.id) || !label) return "Enter a valid column name.";
    if (TRACKER_COLUMNS.some((builtIn) => builtIn.label.toLowerCase() === label.toLowerCase())) {
      return "That column already exists.";
    }
    if (
      activeCustomColumns.some(
        (existing) =>
          existing.id === column.id || existing.label.toLowerCase() === label.toLowerCase(),
      )
    ) {
      return "That custom column is already added.";
    }
    if (activeCustomColumns.length >= TRACKER_CUSTOM_COLUMN_LIMIT) {
      return "You can add up to two custom columns.";
    }
    setCustomColumns((current) => [
      ...current,
      {
        ...column,
        label,
        custom: true,
        hint: column.hint || "Custom stage",
      },
    ]);
    return null;
  }

  async function patchItem(item: TrackerItem, payload: Partial<ManualTrackerInput> & { id: string }) {
    setBusyId(item.id);
    setMutationError(null);
    try {
      const response = await fetch("/api/tracker/applications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { ok: boolean; message?: string; item?: TrackerItem };
      if (!response.ok || !body.ok || !body.item) {
        throw new Error(body.message || "Could not update that tracker item.");
      }
      upsertItem(body.item);
      return true;
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Could not update that tracker item.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function removeCustomColumn(column: TrackerColumn) {
    if (!column.custom) return;
    const affectedItems = items.filter((item) => item.stage === column.id);
    if (affectedItems.length > 0) {
      const ok = window.confirm(
        `Remove ${column.label}? ${affectedItems.length} role${
          affectedItems.length === 1 ? "" : "s"
        } in this column will move to To review.`,
      );
      if (!ok) return;
    }

    const previousItems = items;
    const previousColumns = customColumns;
    const updatedAt = new Date().toISOString();
    setMutationError(null);
    setBusyId(`column:${column.id}`);
    setCustomColumns((current) => current.filter((existing) => existing.id !== column.id));
    if (stage === column.id) setStage("all");
    setItems((current) =>
      current.map((item) =>
        item.stage === column.id
          ? {
              ...item,
              stage: "inbox",
              status: statusForTrackerStage("inbox"),
              updatedAt,
            }
          : item,
      ),
    );

    try {
      const savedItems = await Promise.all(
        affectedItems.map(async (item) => {
          const response = await fetch("/api/tracker/applications", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: item.id, stage: "inbox" }),
          });
          const body = (await response.json()) as { ok: boolean; message?: string; item?: TrackerItem };
          if (!response.ok || !body.ok || !body.item) {
            throw new Error(body.message || "Could not remove that tracker column.");
          }
          return body.item;
        }),
      );
      if (savedItems.length > 0) {
        setItems((current) =>
          current.map((item) => savedItems.find((saved) => saved.id === item.id) ?? item),
        );
      }
      reloadFirstPage();
    } catch (err) {
      setItems(previousItems);
      setCustomColumns(previousColumns);
      setMutationError(err instanceof Error ? err.message : "Could not remove that tracker column.");
    } finally {
      setBusyId(null);
    }
  }

  async function changeStage(item: TrackerItem, nextStage: TrackerStage) {
    if (item.stage === nextStage) return;
    const previousItems = items;
    setItems((current) =>
      current.map((existing) =>
        existing.id === item.id
          ? {
              ...existing,
              stage: nextStage,
              status: statusForTrackerStage(nextStage),
              updatedAt: new Date().toISOString(),
            }
          : existing,
      ),
    );
    const saved = await patchItem(item, { id: item.id, stage: nextStage });
    if (!saved) setItems(previousItems);
  }

  function startDrag(item: TrackerItem, event: React.DragEvent<HTMLElement>) {
    if (busyId || isInteractiveCardTarget(event.target)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-jobposted-tracker-id", item.id);
    event.dataTransfer.setData("text/plain", item.id);
    setRoundedDragImage(event);
    setDraggingId(item.id);
    setDragOverStage(item.stage);
  }

  function endDrag() {
    setDraggingId(null);
    setDragOverStage(null);
  }

  function dragOverColumn(nextStage: TrackerStage, event: React.DragEvent<HTMLElement>) {
    if (!draggingId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverStage !== nextStage) setDragOverStage(nextStage);
  }

  function leaveColumn(stageId: TrackerStage, event: React.DragEvent<HTMLElement>) {
    if (!draggingId || dragOverStage !== stageId) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragOverStage(null);
  }

  function dropOnColumn(nextStage: TrackerStage, event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const id =
      event.dataTransfer.getData("application/x-jobposted-tracker-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggingId;
    const item = items.find((existing) => existing.id === id);
    endDrag();
    if (!item || item.stage === nextStage) return;
    void changeStage(item, nextStage);
  }

  function stageFromPoint(clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof HTMLElement)) return null;
    const stage = target.closest<HTMLElement>("[data-tracker-stage]")?.dataset.trackerStage;
    return isTrackerStage(stage) ? stage : null;
  }

  function startCardPointerDrag(item: TrackerItem, event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") return;
    if (busyId || isInteractiveCardTarget(event.target)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(item.id);
    setDragOverStage(item.stage);
  }

  function moveCardPointerDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" || !draggingId) return;
    event.preventDefault();
    const nextStage = stageFromPoint(event.clientX, event.clientY);
    if (nextStage && nextStage !== dragOverStage) setDragOverStage(nextStage);
  }

  function endCardPointerDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const nextStage = stageFromPoint(event.clientX, event.clientY);
    const item = items.find((existing) => existing.id === draggingId);
    endDrag();
    if (!item || !nextStage || item.stage === nextStage) return;
    void changeStage(item, nextStage);
  }

  function cancelCardPointerDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endDrag();
  }

  async function deleteItem(item: TrackerItem) {
    if (!window.confirm(`Remove ${item.role} at ${item.company} from your tracker?`)) return;
    setBusyId(item.id);
    setMutationError(null);
    try {
      const response = await fetch(`/api/tracker/applications?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.message || "Could not delete that tracker item.");
      }
      setItems((current) => current.filter((existing) => existing.id !== item.id));
      reloadFirstPage();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Could not delete that tracker item.");
    } finally {
      setBusyId(null);
    }
  }

  async function exportCsv() {
    if (exporting || total === 0) return;
    setExporting(true);
    setMutationError(null);
    try {
      const page = await fetchPage(0, 5000);
      downloadTrackerCsv(page.items);
      if (page.total > page.items.length) {
        setMutationError(`CSV includes the first ${page.items.length} matching roles. Narrow filters to export more precisely.`);
      }
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Could not export tracker CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative w-full space-y-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-100 via-violet-100/45 to-rose-100/45"
      >
        <div className="absolute -left-28 -top-32 h-[26rem] w-[26rem] rounded-full bg-brand-300/45 blur-[100px]" />
        <div className="absolute left-1/3 -top-24 size-96 rounded-full bg-violet-300/35 blur-[110px]" />
        <div className="absolute -right-20 top-8 size-96 rounded-full bg-rose-200/40 blur-[100px]" />
        <div className="absolute -bottom-24 left-1/4 h-96 w-[30rem] rounded-full bg-aqua/30 blur-[110px]" />
        <div className="absolute -bottom-10 right-1/4 size-72 rounded-full bg-mint/25 blur-[90px]" />
      </div>

      <section className="px-1 pt-1">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-3">
            <h1 className="shrink-0 text-2xl font-extrabold tracking-[-0.03em] text-ink">Job tracker</h1>
            <TrackerSummary summary={summary} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={exportCsv}
              disabled={total === 0 || exporting}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:pointer-events-none disabled:opacity-50",
                TRACKER_BUTTON_CLASS,
              )}
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download CSV
            </button>
            <button
              type="button"
              aria-expanded={columnPanelOpen}
              onClick={() => {
                setManualOpen(false);
                setEditingItem(null);
                setColumnPanelOpen((open) => !open);
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black",
                TRACKER_BUTTON_CLASS,
              )}
            >
              <ListChecks className="size-4" />
              Add column
            </button>
            <button
              type="button"
              onClick={() => {
                setColumnPanelOpen(false);
                setEditingItem(null);
                setManualOpen((open) => (editingItem ? true : !open));
              }}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black",
                TRACKER_PRIMARY_BUTTON_CLASS,
              )}
            >
              <Plus className="size-4" />
              Add role
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label
            className={cn(
              "flex h-11 flex-1 items-center gap-2 rounded-xl px-3 transition-[background-color,box-shadow]",
              TRACKER_CONTROL_CLASS,
              TRACKER_CONTROL_FOCUS_WITHIN_CLASS,
            )}
          >
            <Search className="size-4 shrink-0 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search role, company, source, notes"
              className="w-full bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-zinc-500"
              autoComplete="off"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear tracker search"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-zinc-100 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            )}
          </label>

          <div className="grid gap-2 sm:grid-cols-3 lg:w-[36rem]">
            <DashboardSelect
              id="tracker-source"
              value={source}
              ariaLabel="Source"
              options={SOURCE_FILTERS}
              onChange={setSource}
              buttonClassName={cn(
                "h-11 rounded-xl px-3 text-sm font-bold text-ink outline-none transition-[background-color,box-shadow]",
                TRACKER_CONTROL_CLASS,
                TRACKER_CONTROL_FOCUS_CLASS,
              )}
            />

            <DashboardSelect
              id="tracker-stage"
              value={stage}
              ariaLabel="Stage"
              options={stageFilterOptions}
              onChange={setStage}
              buttonClassName={cn(
                "h-11 rounded-xl px-3 text-sm font-bold text-ink outline-none transition-[background-color,box-shadow]",
                TRACKER_CONTROL_CLASS,
                TRACKER_CONTROL_FOCUS_CLASS,
              )}
            />

            <DashboardSelect
              value={sort}
              ariaLabel="Sort tracker"
              options={TRACKER_SORT_OPTIONS}
              onChange={setSort}
              icon={<ArrowDownWideNarrow className="size-4" />}
              buttonClassName={cn(
                "h-11 rounded-xl px-3 text-sm font-bold text-ink outline-none transition-[background-color,box-shadow]",
                TRACKER_CONTROL_CLASS,
                TRACKER_CONTROL_FOCUS_CLASS,
              )}
            />
          </div>
        </div>
      </section>

      <AddColumnPanel
        open={columnPanelOpen}
        onClose={() => setColumnPanelOpen(false)}
        columns={activeCustomColumns}
        onAddColumn={addCustomColumn}
        onRemoveColumn={removeCustomColumn}
      />

      <ManualAddPanel
        open={manualOpen || Boolean(editingItem)}
        onClose={closeEditor}
        onSave={upsertItem}
        editingItem={editingItem}
        stageOptions={stageOptions}
      />

      {mutationError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-100">
          {mutationError}
        </p>
      )}

      {summary.tracked === 0 ? (
        <section className={cn("rounded-2xl p-8 text-center", TRACKER_PANEL_CLASS)}>
          <span className={cn("mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700", TRACKER_CHIP_SHADOW_CLASS)}>
            <BriefcaseBusiness className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-extrabold tracking-[-0.02em] text-ink">No roles tracked yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted">
            Add the first role manually, or send one through the extension.
          </p>
        </section>
      ) : total === 0 ? (
        <section className={cn("rounded-2xl p-8 text-center", TRACKER_PANEL_CLASS)}>
          <span className={cn("mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100 text-muted", TRACKER_CHIP_SHADOW_CLASS)}>
            <Search className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-extrabold tracking-[-0.02em] text-ink">No matches</h2>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted">
            Try a broader search or clear one of the filters.
          </p>
        </section>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid w-full gap-3"
            style={{
              minWidth: `calc(${trackerColumns.length} * 12rem + ${Math.max(0, trackerColumns.length - 1)} * 0.75rem)`,
              gridTemplateColumns: `repeat(${trackerColumns.length}, minmax(12rem, 1fr))`,
            } as React.CSSProperties}
          >
            {trackerColumns.map((column) => (
              <TrackerColumn
                key={column.id}
                column={column}
                items={byStage[column.id] ?? []}
                busyId={busyId}
                draggingId={draggingId}
                dragOverStage={dragOverStage}
                colorForItem={colorForItem}
                onOpen={setDetailItem}
                onRemoveColumn={removeCustomColumn}
                onCardDragEnd={endDrag}
                onCardDragStart={startDrag}
                onColumnDragLeave={leaveColumn}
                onColumnDragOver={dragOverColumn}
                onColumnDrop={dropOnColumn}
                onCardPointerCancel={cancelCardPointerDrag}
                onCardPointerDown={startCardPointerDrag}
                onCardPointerMove={moveCardPointerDrag}
                onCardPointerUp={endCardPointerDrag}
              />
            ))}
          </div>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            disabled={pageLoading}
            onClick={() => void loadPage(items.length, "append")}
            className="glass-chip inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-brand-800 transition-colors hover:text-brand-900 disabled:pointer-events-none disabled:opacity-60"
          >
            {pageLoading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Load more
          </button>
        </div>
      )}

      <AnimatePresence>
        {detailItem && (
          <TrackerDetailDialog
            item={detailItem}
            color={colorForItem(detailItem)}
            stages={trackerColumns}
            busy={busyId === detailItem.id}
            onClose={() => setDetailItem(null)}
            onStageChange={(stage) => {
              const target = detailItem;
              setDetailItem((prev) =>
                prev ? { ...prev, stage, status: statusForTrackerStage(stage) } : prev,
              );
              void changeStage(target, stage);
            }}
            onColorChange={(colorId) => setCardColor(detailItem.id, colorId)}
            onSave={saveDetailEdits}
            onDelete={() => {
              const target = detailItem;
              setDetailItem(null);
              void deleteItem(target);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
