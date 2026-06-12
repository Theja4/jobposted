"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Clock, Lock, ShieldCheck, Sparkles, Send } from "lucide-react";
import {
  QUEUE_TODAY,
  QUEUE_TOMORROW,
  type JobApplication,
  type QueuedJob,
} from "@/lib/dashboard/sample-data";
import { ApplicationRow } from "./ApplicationRow";

const STORAGE_KEY = "jobposted:queue-ack";
const todayKey = () => new Date().toDateString();

export function QueuePanel({
  today = QUEUE_TODAY,
  tomorrow = QUEUE_TOMORROW,
}: {
  today?: JobApplication[];
  tomorrow?: QueuedJob[];
}) {
  const reduce = useReducedMotion();
  const [acknowledged, setAcknowledged] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setAcknowledged(localStorage.getItem(STORAGE_KEY) === todayKey());
    } catch {
      /* localStorage unavailable — treat as not acknowledged */
    }
    setHydrated(true);
  }, []);

  function acknowledge() {
    setAcknowledged(true);
    try {
      localStorage.setItem(STORAGE_KEY, todayKey());
    } catch {
      /* ignore persistence failure */
    }
  }

  const sentCount = today.length;
  const tomorrowCount = tomorrow.length;

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
              {acknowledged ? <ShieldCheck className="size-3.5" /> : <Clock className="size-3.5" />}
              {acknowledged ? "All caught up" : "Action needed"}
            </span>
            <h2 className="mt-4 text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
              {acknowledged
                ? "You're all set for tomorrow."
                : `JobPosted applied to ${sentCount} jobs for you today.`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/80">
              {acknowledged ? (
                <>
                  Tomorrow&apos;s <strong className="text-white">{tomorrowCount}</strong> tailored
                  applications are scheduled to send automatically. Check back tomorrow to
                  acknowledge again.
                </>
              ) : (
                <>
                  We send applications automatically — no clicking through each one. To keep the
                  engine running, just acknowledge today&apos;s batch. Tomorrow&apos;s{" "}
                  <strong className="text-white">{tomorrowCount}</strong> applications are paused
                  until you do.
                </>
              )}
            </p>
          </div>

          <div className="shrink-0">
            {hydrated && !acknowledged ? (
              <motion.button
                type="button"
                onClick={acknowledge}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-black text-brand-800 shadow-[0_16px_36px_rgba(7,26,51,0.3)] transition-transform duration-150 hover:-translate-y-0.5"
              >
                <CheckCircle2 className="size-5" />
                Acknowledge today&apos;s applications
              </motion.button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-bold ring-1 ring-inset ring-white/25 backdrop-blur">
                <CheckCircle2 className="size-5 text-[#a3ffb3]" />
                Acknowledged
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Applied today ───────────────────────────────────────── */}
      <section className="liquid-glass rounded-[1.75rem] p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Applied today</h3>
            <p className="mt-1 text-sm font-semibold text-muted">
              {sentCount} applications sent on your behalf · open any resume that went out
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
            <Send className="size-3.5" />
            Sent
          </span>
        </div>
        <div className="space-y-2.5">
          {today.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      </section>

      {/* ── Tomorrow's queue (gated on acknowledgement) ─────────── */}
      <section className="liquid-glass relative overflow-hidden rounded-[1.75rem] p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold tracking-[-0.02em] text-ink">Up next — tomorrow</h3>
            <p className="mt-1 text-sm font-semibold text-muted">
              {tomorrowCount} roles matched and tailored, ready to send
            </p>
          </div>
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ring-1 ring-inset " +
              (acknowledged
                ? "bg-brand-50 text-brand-700 ring-brand-100"
                : "bg-zinc-100 text-zinc-500 ring-zinc-200/70")
            }
          >
            {acknowledged ? <Sparkles className="size-3.5" /> : <Lock className="size-3.5" />}
            {acknowledged ? "Scheduled" : "Paused"}
          </span>
        </div>

        <div className={acknowledged ? "" : "pointer-events-none select-none opacity-40 blur-[1.5px]"}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {tomorrow.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-inset ring-white"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[linear-gradient(150deg,#dceaff,#9fcbff)] text-sm font-black text-brand-800">
                  {job.company.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-ink">{job.role}</p>
                  <p className="truncate text-xs font-semibold text-muted">
                    {job.company} · {job.location}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-emerald-600">{job.matchScore}%</span>
              </div>
            ))}
          </div>
        </div>

        {hydrated && !acknowledged && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
            <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-[0_16px_36px_rgba(7,26,51,0.3)]">
              <Lock className="size-4" />
              Acknowledge today to unlock tomorrow&apos;s queue
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
