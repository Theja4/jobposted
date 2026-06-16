"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Clock, ShieldCheck, Send } from "lucide-react";
import { type JobApplication } from "@/lib/dashboard/sample-data";
import type { ApplicationMode } from "@/lib/dashboard/applications";
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
  const reduce = useReducedMotion();
  // "done" = today's daily action taken (reviewed in auto, released in review).
  const [done, setDone] = useState(initialAcknowledged);
  const [busy, setBusy] = useState(false);
  const review = mode === "review";

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
  const batchChip =
    !hasDailyAction
      ? { label: review ? "Empty" : "No queue", tone: "neutral" }
      : review && !done
        ? { label: "Pending", tone: "warning" }
        : review
          ? { label: "Queued", tone: "success" }
          : done
            ? { label: "Reviewed", tone: "success" }
            : { label: "Prepared", tone: "success" };

  // Mode-specific copy.
  const hero = review
    ? {
        badge: done ? "Queued" : hasDailyAction ? "Review needed" : "Nothing waiting",
        title: done
          ? "Today's batch is queued."
          : hasDailyAction
            ? `${sentCount} ${applicationLabel} ready for your review.`
            : "No applications ready for review yet.",
        body: done ? (
          <>
            {sentCount} applications were released to the worker queue.
          </>
        ) : hasDailyAction ? (
          <>
            Nothing is submitted until you say so. Review today&apos;s tailored batch below, then
            queue them for the worker with one click.
          </>
        ) : (
          <>When JobPosted prepares a review batch, it will appear here before anything is submitted.</>
        ),
        cta: `Queue all (${sentCount})`,
      }
    : {
        badge: done ? "Reviewed" : sentCount > 0 ? "Prepared" : "No queue yet",
        title: done
          ? "Today's JobPosted queue is reviewed."
          : sentCount > 0
            ? `JobPosted prepared ${sentCount} ${applicationLabel} today.`
            : "No JobPosted queue items today yet.",
        body: done ? (
          <>
            Today's prepared applications are marked reviewed.
          </>
        ) : sentCount > 0 ? (
          <>
            This list only includes applications prepared by JobPosted. Manual tracker entries and
            extension captures stay in Tracker.
          </>
        ) : (
          <>
            When JobPosted prepares applications for the worker, they&apos;ll appear here. Manual
            tracker entries and extension captures won&apos;t be counted as JobPosted work.
          </>
        ),
        cta: "Mark today reviewed",
      };

  const batchTitle = review
    ? done
      ? "Queued today"
      : "Ready to queue today"
    : "Prepared today";
  const batchSubtitle = review
    ? done
      ? `${sentCount} applications released to the worker queue`
      : `${sentCount} tailored applications waiting for your go-ahead`
    : sentCount > 0
      ? `${sentCount} ${applicationLabel} prepared by JobPosted · manual and extension items stay in Tracker`
      : "No automatic JobPosted queue items yet today";

  return (
    <div className="space-y-6">
      {/* ── Status hero ─────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-[1.75rem] p-6 text-white sm:p-8"
        style={{ background: "linear-gradient(150deg,#11408f 0%,#1f64e0 60%,#4f9cf7 100%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(36rem_20rem_at_85%_-10%,rgba(125,200,255,0.4),transparent_60%)]"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold ring-1 ring-inset ring-white/25 backdrop-blur">
              {done ? <ShieldCheck className="size-3.5" /> : <Clock className="size-3.5" />}
              {hero.badge}
            </span>
            <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">{hero.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">{hero.body}</p>
          </div>

          <div className="shrink-0">
            {!done && hasDailyAction ? (
              <motion.button
                type="button"
                onClick={takeAction}
                disabled={busy}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-black text-brand-800 shadow-[0_16px_36px_rgba(7,26,51,0.3)] transition-transform duration-150 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-70"
              >
                {review ? <Send className="size-5" /> : <CheckCircle2 className="size-5" />}
                {hero.cta}
              </motion.button>
            ) : done ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-bold ring-1 ring-inset ring-white/25 backdrop-blur">
                <CheckCircle2 className="size-5 text-[#a3ffb3]" />
                {review ? "Queued" : "Reviewed"}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-bold ring-1 ring-inset ring-white/25 backdrop-blur">
                <Clock className="size-5 text-[#cfe2ff]" />
                Nothing due
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Today's batch ───────────────────────────────────────── */}
      <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold tracking-[-0.02em] text-ink">{batchTitle}</h3>
            <p className="mt-1 text-sm font-semibold text-muted">{batchSubtitle}</p>
          </div>
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ring-1 ring-inset " +
              (batchChip.tone === "warning"
                ? "bg-amber-50 text-amber-700 ring-amber-200/70"
                : batchChip.tone === "success"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70"
                  : "bg-zinc-100 text-zinc-500 ring-zinc-200/70")
            }
          >
            {batchChip.tone === "warning" ? <Clock className="size-3.5" /> : <Send className="size-3.5" />}
            {batchChip.label}
          </span>
        </div>
        {today.length > 0 ? (
          <div className="space-y-2.5">
            {today.map((application) => (
              <ApplicationRow key={application.id} application={application} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-white/65 px-4 py-8 text-center ring-1 ring-inset ring-white">
            <p className="text-sm font-extrabold text-ink">
              {review ? "No applications waiting for review." : "No JobPosted queue items today."}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs font-semibold leading-5 text-muted">
              {review
                ? "Prepared applications will appear here before anything is submitted."
                : "Tracker items added manually or captured through the extension are kept out of this queue."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
