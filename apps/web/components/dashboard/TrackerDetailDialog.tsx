"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Globe,
  ListChecks,
  MapPin,
  Pencil,
  PencilLine,
  Puzzle,
  ServerCog,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  TRACKER_CARD_COLORS,
  labelForTrackerStage,
  type TrackerCardColor,
  type TrackerColumn,
  type TrackerItem,
  type TrackerSource,
  type TrackerStage,
} from "@/lib/dashboard/tracker-model";
import { CompanyAvatar } from "./CompanyAvatar";

const PANEL_SHADOW =
  "shadow-[0_44px_96px_-32px_rgba(11,18,32,0.55),0_20px_44px_-26px_rgba(16,47,102,0.32),inset_0_1px_0_rgba(255,255,255,0.92)]";
const EASE = [0.22, 1, 0.36, 1] as const;

const SOURCE_ICONS: Record<TrackerSource, typeof Globe> = {
  extension: Puzzle,
  job_board: Globe,
  server: ServerCog,
  manual: PencilLine,
};

function formatFullDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function relativeTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const day = 86_400_000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  const days = Math.round(diff / day);
  if (days < 30) return `${days} days ago`;
  return formatFullDate(iso);
}

function matchQuality(score: number) {
  if (score >= 85) return "Strong fit";
  if (score >= 70) return "Good fit";
  if (score > 0) return "Partial fit";
  return null;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-zinc-100 py-2.5 first:border-t-0">
      <span className="flex flex-1 items-center gap-2 text-[13px] font-semibold text-muted">
        <Icon className="size-4 shrink-0 text-brand-600" aria-hidden />
        {label}
      </span>
      <span className="text-right text-[13px] font-bold text-ink">{value}</span>
    </div>
  );
}

export function TrackerDetailDialog({
  item,
  color,
  stages,
  busy,
  onClose,
  onStageChange,
  onColorChange,
  onEdit,
  onDelete,
}: {
  item: TrackerItem;
  color: TrackerCardColor;
  stages: TrackerColumn[];
  busy: boolean;
  onClose: () => void;
  onStageChange: (stage: TrackerStage) => void;
  onColorChange: (colorId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `tracker-detail-${item.id}`;
  const hasResume = Boolean(item.resumeUrl && item.resumeUrl !== "#");
  const SourceIcon = SOURCE_ICONS[item.source] ?? Globe;
  const quality = matchQuality(item.matchScore);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <motion.div
      role="presentation"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0b1220]/45 p-3 backdrop-blur-[3px] sm:items-center sm:p-6"
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.26, ease: EASE }}
        className={cn(
          "relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[1.6rem] border border-white bg-white outline-none",
          PANEL_SHADOW,
        )}
      >
        <header
          className="flex items-start gap-3.5 px-5 pb-5 pt-5 sm:px-6"
          style={{ backgroundColor: color.bg }}
        >
          <CompanyAvatar
            company={item.company}
            logoUrl={item.companyLogoUrl}
            colorSeed={item.source === "manual" ? item.id : undefined}
            size="lg"
            className="border border-white/80 bg-white"
          />
          <div className="min-w-0 flex-1 pr-8">
            <h2
              id={titleId}
              className="text-lg font-extrabold leading-tight tracking-[-0.02em] text-ink"
            >
              {item.role}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-bold text-ink/70">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" aria-hidden />
                {item.company}
              </span>
              {item.location && (
                <>
                  <span className="text-ink/30" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden />
                    {item.location}
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg text-ink/55 transition-colors hover:bg-white/70 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-muted">Stage</p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((stage) => {
                const active = stage.id === item.stage;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    disabled={busy || active}
                    onClick={() => onStageChange(stage.id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-black transition-[background-color,color,box-shadow] disabled:cursor-default",
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-white text-ink ring-1 ring-zinc-200 hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200 disabled:opacity-60",
                    )}
                  >
                    {labelForTrackerStage(stage.id)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <DetailRow
              icon={SourceIcon}
              label="Source"
              value={item.platform ? `${item.sourceLabel} · ${item.platform}` : item.sourceLabel}
            />
            <DetailRow icon={CalendarDays} label="Applied" value={formatFullDate(item.appliedOn)} />
            <DetailRow icon={Clock3} label="Last update" value={relativeTime(item.updatedAt)} />
            {item.totalFields > 0 && (
              <DetailRow
                icon={ListChecks}
                label="Form fields"
                value={`${item.fieldsFilled} / ${item.totalFields} filled`}
              />
            )}
            <DetailRow
              icon={Gauge}
              label="Match"
              value={
                item.matchScore > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    {item.matchScore}%
                    {quality && <span className="font-semibold text-muted">· {quality}</span>}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </div>

          <div className="flex items-center gap-3 rounded-2xl bg-panel px-3.5 py-3 ring-1 ring-zinc-100">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <FileText className="size-[18px]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-ink">
                {hasResume ? item.resumeName : "No resume attached"}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-muted">
                {hasResume ? "Tailored resume sent with this application" : "Applied without a stored resume file"}
              </p>
            </div>
            {hasResume && (
              <a
                href={item.resumeUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Download the resume sent"
                className="grid size-9 shrink-0 place-items-center rounded-xl text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                <Download className="size-[18px]" />
              </a>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-muted">Card colour</p>
            <div className="flex flex-wrap gap-2">
              {TRACKER_CARD_COLORS.map((swatch) => {
                const selected = swatch.id === color.id;
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => onColorChange(swatch.id)}
                    aria-label={`${swatch.name} card colour`}
                    aria-pressed={selected}
                    style={{ backgroundColor: swatch.swatch }}
                    className={cn(
                      "grid size-7 place-items-center rounded-full transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                      selected
                        ? "ring-2 ring-ink/70 ring-offset-2 ring-offset-white"
                        : "ring-1 ring-black/5",
                    )}
                  >
                    {selected && <Check className="size-3.5 text-ink/75" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {item.jobUrl ? (
              <a
                href={item.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white shadow-[0_14px_30px_-18px_rgba(31,100,224,0.7)] transition-[background-color,box-shadow] hover:bg-brand-700"
              >
                <ExternalLink className="size-4" />
                Open posting
              </a>
            ) : (
              <span className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-black text-zinc-400">
                <ExternalLink className="size-4" />
                No link
              </span>
            )}
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-muted ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 hover:text-ink disabled:pointer-events-none disabled:opacity-60"
            >
              <Pencil className="size-4" />
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Delete ${item.role} at ${item.company}`}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-muted ring-1 ring-zinc-200 transition-colors hover:bg-red-50 hover:text-red-600 hover:ring-red-200 disabled:pointer-events-none disabled:opacity-60"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted">
            <ExternalLink className="size-3" aria-hidden />
            The full job description lives on the original posting.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
