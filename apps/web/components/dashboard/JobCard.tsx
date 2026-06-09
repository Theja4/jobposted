"use client";

import { useState } from "react";
import { Check, Loader2, MapPin, Plus, Zap, Puzzle } from "lucide-react";
import { applyMethodLabel, type FeedJob } from "@/lib/feed-types";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

function salaryText(job: FeedJob): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const cur = job.salaryCurrency ? `${job.salaryCurrency} ` : "";
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  if (job.salaryMin != null && job.salaryMax != null)
    return `${cur}${fmt(job.salaryMin)}–${fmt(job.salaryMax)}`;
  return `${cur}${fmt((job.salaryMin ?? job.salaryMax)!)}`;
}

export function JobCard({ job }: { job: FeedJob }) {
  const [status, setStatus] = useState<"idle" | "queueing" | "queued" | "error">(
    job.queued ? "queued" : "idle",
  );
  const method = applyMethodLabel(job.atsType);
  const salary = salaryText(job);

  async function queue() {
    if (status === "queueing" || status === "queued") return;
    setStatus("queueing");
    try {
      const res = await fetch("/api/applications/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });
      setStatus(res.ok ? "queued" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 transition-shadow duration-150 hover:shadow-md hover:shadow-brand-900/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink">{job.title}</h3>
          <p className="truncate text-sm text-muted">{job.company}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            job.score >= 70
              ? "bg-brand-600 text-white"
              : job.score >= 40
                ? "bg-brand-50 text-brand-700"
                : "bg-zinc-100 text-zinc-500",
          )}
        >
          {job.score}% match
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" />
          {job.location ?? "Location N/A"}
          {job.remote !== "unknown" && ` · ${job.remote}`}
        </span>
        {salary && <span className="font-medium text-ink">{salary}</span>}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
            method.via === "server"
              ? "bg-brand-50 text-brand-700"
              : "bg-amber-50 text-amber-700",
          )}
        >
          {method.via === "server" ? <Zap className="size-3" /> : <Puzzle className="size-3" />}
          {method.label}
        </span>
      </div>

      {job.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.reasons.slice(0, 3).map((r) => (
            <span
              key={r}
              className="rounded-md bg-zinc-50 px-2 py-0.5 text-[11px] text-muted ring-1 ring-inset ring-zinc-100"
            >
              {r}
            </span>
          ))}
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        {status === "queued" ? (
          <span className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-50 text-sm font-semibold text-brand-700">
            <Check className="size-4" strokeWidth={3} /> Queued
          </span>
        ) : (
          <button
            onClick={queue}
            disabled={status === "queueing"}
            className={buttonClasses("primary", "sm", "h-9 flex-1")}
          >
            {status === "queueing" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Queuing…
              </>
            ) : (
              <>
                <Plus className="size-4" /> Queue
              </>
            )}
          </button>
        )}
        <a
          href={job.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("secondary", "sm", "h-9")}
        >
          View
        </a>
      </div>

      {status === "error" && (
        <p className="text-xs text-red-600" role="alert">
          Couldn&apos;t queue — try again.
        </p>
      )}
    </div>
  );
}
