"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Send } from "lucide-react";
import { type JobApplication } from "@/lib/dashboard/sample-data";
import type { ApplicationMode } from "@/lib/dashboard/applications";
import { isReviewAttentionStatus } from "@/lib/dashboard/queue-visibility";
import { ApplicationRow } from "./ApplicationRow";

export function QueuePanel({
  today = [],
  initialAcknowledged = false,
  mode = "auto",
}: {
  today?: JobApplication[];
  initialAcknowledged?: boolean;
  mode?: ApplicationMode;
}) {
  // "done" = today's daily action taken (reviewed in auto, released in review).
  const [done, setDone] = useState(initialAcknowledged);
  const [busy, setBusy] = useState(false);
  const review = mode === "review";
  const hasReviewItems = today.some((application) => isReviewAttentionStatus(application.rawStatus));

  async function takeAction() {
    if (busy) return;
    setBusy(true);
    setDone(true); // optimistic
    try {
      const res = await fetch(review ? "/api/queue/apply" : "/api/queue/acknowledge", {
        method: "POST",
      });
      if (!res.ok) setDone(false);
    } catch {
      setDone(false);
    } finally {
      setBusy(false);
    }
  }

  const sentCount = today.length;
  const applicationLabel = sentCount === 1 ? "application" : "applications";
  const hasDailyAction = sentCount > 0;
  const canTakeAction = review && hasDailyAction;
  if (!review && !hasDailyAction) return null;

  const batchChip =
    !hasDailyAction
      ? { label: review ? "Empty" : "No queue", tone: "neutral" }
      : hasReviewItems
        ? { label: "Review", tone: "warning" }
      : review && !done
        ? { label: "Pending", tone: "warning" }
        : review
          ? { label: "Queued", tone: "success" }
          : { label: "Prepared", tone: "success" };

  const batchTitle = review
    ? done
      ? "Queued today"
      : hasDailyAction
        ? "Ready for review"
        : "Review queue"
    : hasReviewItems
      ? "Needs review"
      : "Prepared today";
  const batchSubtitle = review
    ? done
      ? `${sentCount} applications released to the worker queue`
      : hasDailyAction
        ? `${sentCount} tailored ${applicationLabel} waiting for your go-ahead`
        : "Nothing is waiting for manual review right now"
    : hasReviewItems
      ? `${sentCount} ${applicationLabel} need a manual check before JobPosted can continue`
    : sentCount > 0
      ? `${sentCount} ${applicationLabel} prepared by JobPosted · manual and extension items stay in Tracker`
      : "No automatic JobPosted queue items yet today";

  return (
    <section className="liquid-glass rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 shadow-[0_10px_20px_-16px_rgba(31,100,224,0.8)]">
            {done ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
          </span>
          <div>
            <h3 className="text-base font-extrabold tracking-[-0.01em] text-ink">{batchTitle}</h3>
            <p className="mt-1 text-sm font-semibold text-muted">{batchSubtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-black ring-1 ring-inset " +
              (batchChip.tone === "warning"
                ? "bg-amber-50 text-amber-700 ring-amber-200/70"
                : batchChip.tone === "success"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
                  : "bg-zinc-100 text-zinc-500 ring-zinc-200/70")
            }
          >
            {batchChip.tone === "warning" ? <AlertCircle className="size-3.5" /> : <Send className="size-3.5" />}
            {batchChip.label}
          </span>
          {!done && canTakeAction && (
            <button
              type="button"
              onClick={takeAction}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-brand-600 px-4 text-xs font-black text-white shadow-[0_12px_24px_-16px_rgba(31,100,224,0.85)] transition-transform duration-150 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-70"
            >
              {review ? <Send className="size-4" /> : <CheckCircle2 className="size-4" />}
              {review ? `Queue all (${sentCount})` : "Mark reviewed"}
            </button>
          )}
        </div>
      </div>

      {today.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {today.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}

      {review && today.length === 0 && (
        <div className="mt-3 rounded-xl bg-white/65 px-3 py-2.5 ring-1 ring-inset ring-white">
          <p className="text-xs font-semibold leading-5 text-muted">
            Prepared applications will appear here only when review mode has a batch waiting.
          </p>
        </div>
      )}
    </section>
  );
}
