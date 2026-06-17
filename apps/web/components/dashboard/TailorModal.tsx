"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, FileText, Loader2, RefreshCcw, X } from "lucide-react";
import type { JobListing } from "@/lib/dashboard/sample-data";
import type { TailorAnalysis, ResumeContent } from "@jobposted/shared";
import { CompanyAvatar } from "./CompanyAvatar";

type TailorResponse =
  | {
      ok: true;
      changed: boolean;
      analysis: TailorAnalysis;
      resume: ResumeContent;
      documentId?: string | null;
      resumeUrl?: string | null;
      resumeDocxUrl?: string | null;
    }
  | { ok: false; error: string; message?: string };

type State =
  | { kind: "loading" }
  | {
      kind: "done";
      changed: boolean;
      analysis: TailorAnalysis;
      resume: ResumeContent;
      resumeUrl?: string | null;
      resumeDocxUrl?: string | null;
    }
  | { kind: "needs_resume" }
  | { kind: "error"; message: string };

const TIER_LABEL: Record<TailorAnalysis["matchTier"], string> = {
  STRONG_FIT: "Strong fit",
  MODERATE_FIT: "Moderate fit",
  STRETCH: "A stretch",
  LONG_SHOT: "Long shot",
};

function buildJobDescription(job: JobListing) {
  return [
    `Role: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
    `Workplace: ${job.workplace}`,
    `Employment type: ${job.type}`,
    `Level: ${job.level}`,
    `Salary: ${job.salary}`,
    `Relevant skills and tags: ${job.tags.join(", ")}`,
    "",
    "Description:",
    job.description,
  ].join("\n");
}

export function TailorModal({ job, onClose }: { job: JobListing; onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jobDescription: buildJobDescription(job),
            jobId: job.canSaveTailoredResume ? job.id : undefined,
            save: Boolean(job.canSaveTailoredResume),
          }),
        });
        const json = (await res.json()) as TailorResponse;
        if (cancelled) return;
        if (json.ok) {
          setState({
            kind: "done",
            changed: json.changed,
            analysis: json.analysis,
            resume: json.resume,
            resumeUrl: json.resumeUrl,
            resumeDocxUrl: json.resumeDocxUrl,
          });
        } else if (json.error === "no_base_resume") {
          setState({ kind: "needs_resume" });
        } else {
          setState({ kind: "error", message: json.message ?? "Tailoring failed. Try again." });
        }
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Network error. Try again." });
      }
    })();

    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [job, onClose, attempt]);

  return createPortal(
    <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
      aria-label={`Tailor resume for ${job.title}`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-navy/55 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.125rem] bg-white shadow-[0_32px_80px_rgba(4,16,42,0.32)]">
        <div className="flex items-center gap-3 border-b border-black/5 px-5 py-4">
          <CompanyAvatar company={job.company} logoUrl={job.companyLogoUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-ink">Resume tailoring review</p>
            <p className="truncate text-xs font-semibold text-muted">
              {job.title} at {job.company}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {state.kind === "loading" && (
            <div className="flex flex-col items-center py-14 text-center">
              <Loader2 className="size-6 animate-spin text-brand-600" />
              <p className="mt-4 text-sm font-bold text-ink">Reviewing your resume against this role</p>
              <p className="mt-1 text-sm text-muted">Only supported edits will be applied.</p>
            </div>
          )}

          {state.kind === "needs_resume" && (
            <div className="flex flex-col items-center py-12 text-center">
              <p className="text-base font-extrabold text-ink">Add your resume first</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Tailoring works from your master profile. Add it in Setup, then come back.
              </p>
              <Link
                href="/dashboard/onboarding"
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-black text-white transition-colors hover:bg-brand-700"
              >
                Go to Setup <ArrowRight className="size-4" />
              </Link>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center py-12 text-center">
              <p className="text-base font-extrabold text-ink">Couldn&apos;t tailor</p>
              <p className="mt-1 max-w-sm text-sm text-muted">{state.message}</p>
              <button
                type="button"
                onClick={() => {
                  setState({ kind: "loading" });
                  setAttempt((next) => next + 1);
                }}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-black text-white transition-colors hover:bg-brand-700"
              >
                <RefreshCcw className="size-4" />
                Try again
              </button>
            </div>
          )}

          {state.kind === "done" && (
            <TailorResult
              changed={state.changed}
              analysis={state.analysis}
              resume={state.resume}
              resumeUrl={state.resumeUrl}
              resumeDocxUrl={state.resumeDocxUrl}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TailorResult({
  changed,
  analysis,
  resume,
  resumeUrl,
  resumeDocxUrl,
  onClose,
}: {
  changed: boolean;
  analysis: TailorAnalysis;
  resume: ResumeContent;
  resumeUrl?: string | null;
  resumeDocxUrl?: string | null;
  onClose: () => void;
}) {
  const rewrites = analysis.bulletRewrites;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-brand-50/70 p-4 ring-1 ring-inset ring-brand-100">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-center text-base font-black text-brand-700 ring-1 ring-inset ring-brand-200">
            {analysis.matchScore}
            <span className="block text-[9px] leading-none text-muted">/100</span>
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-extrabold text-ink">
                Tailoring strength · {TIER_LABEL[analysis.matchTier]}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-brand-700 ring-1 ring-inset ring-brand-100">
                <CheckCircle2 className="size-3" />
                Truth checked
              </span>
            </div>
            {analysis.honestAssessment && (
              <p className="mt-0.5 text-sm leading-5 text-muted">{analysis.honestAssessment}</p>
            )}
          </div>
        </div>
        <p className="mt-3 border-t border-brand-100 pt-2 text-xs font-semibold leading-5 text-muted">
          How strongly your <span className="font-black text-ink">tailored</span> resume matches this
          role&apos;s wording after JobPosted reviews the role on demand.
        </p>
      </div>

      {!changed && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900 ring-1 ring-inset ring-amber-200/70">
          No safe edits were applied. The role can still be tracked, but the resume did not contain
          enough supported evidence for a rewrite.
        </div>
      )}

      {(analysis.tailoredHeadline || analysis.tailoredSummary) && (
        <section>
          <h3 className="text-xs font-black text-muted">Tailored positioning</h3>
          {analysis.tailoredHeadline && (
            <p className="mt-2 text-sm font-extrabold text-ink">{analysis.tailoredHeadline}</p>
          )}
          {analysis.tailoredSummary && (
            <p className="mt-1 text-sm leading-6 text-ink/80">{analysis.tailoredSummary}</p>
          )}
        </section>
      )}

      {rewrites.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-muted">
            {rewrites.length} supported bullet rewrite{rewrites.length === 1 ? "" : "s"}
          </h3>
          <div className="mt-2 space-y-3">
            {rewrites.map((r, i) => (
              <div key={i} className="rounded-2xl bg-white/70 p-3.5 ring-1 ring-inset ring-zinc-100">
                <p className="text-xs text-muted line-through decoration-zinc-300">{r.original}</p>
                <p className="mt-1.5 text-sm font-semibold text-ink">{r.tailored}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {resume.skills.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-muted">Skills, reordered</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {resume.skills.slice(0, 16).map((s) => (
              <span key={s} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {analysis.missingKeywords.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-muted">Unsupported gaps</h3>
          <p className="mt-1 text-sm text-muted">
            The role asks for these, but the resume does not support them. JobPosted leaves them out:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.missingKeywords.map((k) => (
              <span key={k} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-200/70">
                {k}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-black text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-zinc-50"
        >
          Back to jobs
        </button>
        {resumeDocxUrl && (
          <a
            href={resumeDocxUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50"
          >
            Download .docx <ExternalLink className="size-4" />
          </a>
        )}
        {resumeUrl && (
          <a
            href={resumeUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white transition-colors hover:bg-brand-700"
          >
            Download tailored PDF <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
