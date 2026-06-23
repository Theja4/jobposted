import { useEffect, useRef, useState, type MouseEvent } from "react";
import { AlertTriangle, Bug, CheckCircle2, ChevronRight, Clipboard, Loader2, Pause, Play, RefreshCw, ShieldCheck, Wand2, X } from "lucide-react";
import type { ExtensionFieldFillRecord, ExtensionPlatform } from "@jobposted/shared";

export type OverlayRunState = "idle" | "loading" | "filling" | "done" | "error";
export type OverlayProgressStatus = "pending" | "active" | ExtensionFieldFillRecord["status"];

export interface OverlayProgressItem {
  signature: string;
  label: string;
  required?: boolean;
  canonicalKey?: ExtensionFieldFillRecord["canonicalKey"];
  error?: string;
  valuePreview?: string;
  status: OverlayProgressStatus;
}

export function Overlay({
  platform,
  stepName,
  state,
  items,
  error,
  stopRequested,
  onFill,
  onContinue,
  onStop,
  onClose,
  onRefillQuestion,
  onCopyAnswer,
  onReportBug,
}: {
  platform: ExtensionPlatform;
  stepName: string;
  state: OverlayRunState;
  items: OverlayProgressItem[];
  error: string | null;
  stopRequested: boolean;
  onFill: () => void;
  onContinue: () => void;
  onStop: () => void;
  onClose: () => void;
  onRefillQuestion: (item: OverlayProgressItem) => void;
  onCopyAnswer: (item: OverlayProgressItem) => void;
  onReportBug: (item: OverlayProgressItem) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ signature: string; top: number; left: number } | null>(null);
  const completed = items.filter((item) => item.status !== "pending" && item.status !== "active").length;
  const needsUser = items.filter((item) => item.status === "needs_user" || item.status === "failed").length;
  const busy = state === "loading" || state === "filling";
  const title = stopRequested
    ? "Stopping..."
    : busy
      ? "Almost there..."
      : state === "done" && needsUser > 0
        ? "Review needed"
        : state === "done" && items.length > 0
          ? "All set"
          : state === "error"
            ? "Autofill paused"
            : "Ready to fill";
  const subtitle = stopRequested
    ? "Finishing the current field"
    : busy
      ? "Hang tight"
      : state === "done" && needsUser > 0
        ? "Check highlighted fields"
        : state === "done" && items.length > 0
          ? "Review before submit"
          : "You stay in control";
  const menuItem = menu ? items.find((item) => item.signature === menu.signature) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openRowMenu(item: OverlayProgressItem, event: MouseEvent<HTMLElement>) {
    if (shouldRetryDirectly(item)) {
      setMenu(null);
      onRefillQuestion(item);
      return;
    }
    if (!canOpenProgressMenu(item)) return;
    const root = rootRef.current;
    const rootRect = root?.getBoundingClientRect();
    const rowRect = event.currentTarget.getBoundingClientRect();
    const width = rootRect?.width ?? 390;
    const left = Math.max(12, Math.min(width - 200, rowRect.right - (rootRect?.left ?? 0) - 196));
    const top = rowRect.top - (rootRect?.top ?? 0) + Math.min(rowRect.height - 4, 28);
    setMenu((current) => (current?.signature === item.signature ? null : { signature: item.signature, left, top }));
  }

  function runMenuAction(action: (item: OverlayProgressItem) => void) {
    if (!menuItem) return;
    setMenu(null);
    action(menuItem);
  }

  return (
    <div ref={rootRef} className="fixed right-4 bottom-4 z-[2147483647] w-[min(390px,calc(100vw-32px))] text-[14px]">
      <section className="jp-glass overflow-hidden rounded-[18px]">
        <header className="flex items-center gap-3 border-b border-[rgba(191,219,254,0.7)] px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--jp-brand-600)] text-white">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-[var(--jp-ink)]">
              Autofill with JobPosted
            </p>
            <p className="truncate text-xs font-bold text-[var(--jp-muted)]">
              {platform} · {stepName || "Application"}
            </p>
          </div>
          <button type="button" className="jp-icon-button" aria-label="Close JobPosted" onClick={onClose}>
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-[var(--jp-brand-50)] px-3 py-3 ring-1 ring-inset ring-[var(--jp-brand-200)]">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--jp-brand-100)] text-[var(--jp-brand-700)]">
              {busy || stopRequested ? <Loader2 className="size-5 animate-spin" /> : <ShieldCheck className="size-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-[var(--jp-brand-800)]">{title}</p>
              <p className="truncate text-xs font-semibold text-[var(--jp-muted)]">{subtitle}</p>
            </div>
            <span className="shrink-0 text-xs font-bold text-[var(--jp-muted)]" aria-live="polite">
              {items.length ? `${completed}/${items.length}` : busy ? "Running" : "Ready"}
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-[#fff7ed] px-3 py-2 text-xs font-semibold text-[#9a3412] ring-1 ring-inset ring-[#fed7aa]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          )}

          {items.length > 0 && (
            <div className="max-h-[min(360px,calc(100vh-260px))] overflow-auto rounded-xl bg-white/70 ring-1 ring-inset ring-[var(--jp-border)]">
              {items.map((item) => (
                <ProgressRow key={item.signature + item.label} item={item} onOpenMenu={openRowMenu} />
              ))}
            </div>
          )}

          {needsUser > 0 && (
            <p className="text-xs font-semibold leading-5 text-[var(--jp-muted)]">
              {needsUser} field{needsUser === 1 ? "" : "s"} need review. They are highlighted on the page.
            </p>
          )}

          {busy ? (
            <div className="space-y-2">
              <button type="button" className="jp-button jp-button-secondary w-full" disabled={stopRequested} onClick={onStop}>
                {stopRequested ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
                {stopRequested ? "Stopping..." : "Stop autofill"}
              </button>
              <p className="text-center text-[11px] font-semibold leading-4 text-[var(--jp-muted)]">
                {stopRequested ? "Finishing the current field, then stopping." : "Stops after the current field finishes."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_1.15fr] gap-2">
              <button type="button" className="jp-button jp-button-secondary" onClick={onFill}>
                <Play className="size-4" />
                Fill
              </button>
              <button type="button" className="jp-button jp-button-primary" onClick={onContinue}>
                Fill & Continue
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      </section>
      {menuItem && menu && (
        <div
          className="absolute z-30 w-[190px] overflow-hidden rounded-lg bg-white py-1 text-[13px] font-semibold text-[var(--jp-ink)] shadow-[0_10px_28px_rgba(16,47,102,0.16)] ring-1 ring-black/5"
          role="menu"
          style={{ left: menu.left, top: menu.top }}
        >
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--jp-brand-50)]" role="menuitem" onClick={() => runMenuAction(onRefillQuestion)}>
            <RefreshCw className="size-4 text-[var(--jp-brand-700)]" />
            Refill this question
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--jp-brand-50)] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
            disabled={!menuItem.valuePreview}
            onClick={() => runMenuAction(onCopyAnswer)}
          >
            <Clipboard className="size-4 text-[var(--jp-muted)]" />
            Copy this answer
          </button>
          <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--jp-brand-50)]" role="menuitem" onClick={() => runMenuAction(onReportBug)}>
            <Bug className="size-4 text-[#b45309]" />
            Report bug
          </button>
        </div>
      )}
    </div>
  );
}

function ProgressRow({ item, onOpenMenu }: { item: OverlayProgressItem; onOpenMenu: (item: OverlayProgressItem, event: MouseEvent<HTMLElement>) => void }) {
  const label = item.label.replace(/\s*\*+\s*$/, "").trim() || "Question";
  const needsStar = item.required && !/\*/.test(item.label);
  const showError = item.error && item.error !== "Already filled." && item.error !== "Stopped.";
  const canOpenMenu = canOpenProgressMenu(item);
  const directRetry = shouldRetryDirectly(item);

  return (
    <button
      type="button"
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[rgba(191,219,254,0.55)] px-3 py-2.5 text-left last:border-b-0 ${
        canOpenMenu || directRetry ? "cursor-pointer hover:bg-[var(--jp-brand-50)]" : "cursor-default"
      }`}
      onClick={(event) => onOpenMenu(item, event)}
      aria-haspopup={canOpenMenu && !directRetry ? "menu" : undefined}
      aria-label={directRetry ? `Retry ${label}` : undefined}
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-[var(--jp-ink)]" title={item.label}>
          {label}
          {needsStar && <span className="text-[#dc2626]">*</span>}
        </p>
        {showError && <p className="truncate text-[11px] font-semibold text-[var(--jp-muted)]">{item.error}</p>}
      </div>
      <ProgressStatusIcon item={item} />
    </button>
  );
}

function canOpenProgressMenu(item: OverlayProgressItem) {
  return item.status !== "pending" && item.status !== "active";
}

function shouldRetryDirectly(item: OverlayProgressItem) {
  return item.status === "needs_user" || item.status === "skipped";
}

function ProgressStatusIcon({ item }: { item: OverlayProgressItem }) {
  if (item.status === "active") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--jp-brand-50)] text-[var(--jp-brand-700)]" title="Filling">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }
  if (item.status === "filled" || (item.status === "skipped" && item.error === "Already filled.")) {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#22c55e] text-white" title={item.status === "filled" ? "Filled" : "Already filled"}>
        <CheckCircle2 className="size-3.5" />
      </span>
    );
  }
  if (item.status === "needs_user") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#fbbf24] text-white" title="Needs review">
        <AlertTriangle className="size-3.5" />
      </span>
    );
  }
  if (item.status === "failed") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#dc2626] text-white" title="Failed">
        <X className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#d4d4d8] text-white" title={item.status === "skipped" ? "Skipped" : "Pending"}>
      <Pause className="size-3" />
    </span>
  );
}
