"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Download, X } from "lucide-react";
import { MASTER_PROFILE, type JobApplication } from "@/lib/dashboard/sample-data";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Builds a complete, self-contained resume document. The modal previews it in an
 * isolated iframe and the Download button saves the very same bytes, so what you
 * see is exactly what you get. Real Rezoomed PDFs will swap in here later.
 */
function buildResumeHtml(application: JobApplication): string {
  const p = MASTER_PROFILE;
  const contact = [p.email, p.phone, p.location, ...p.links.map((l) => l.value)]
    .map(esc)
    .join("  •  ");

  const experience = p.experience
    .map(
      (job) => `
      <div class="item">
        <div class="row"><strong>${esc(job.role)} — ${esc(job.company)}</strong><span>${esc(job.period)}</span></div>
        <ul>${job.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      </div>`,
    )
    .join("");

  const education = p.education
    .map(
      (e) =>
        `<div class="row"><strong>${esc(e.degree)} — ${esc(e.school)}</strong><span>${esc(e.period)}</span></div>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(application.resumeName)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef3fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0b1220; }
  .page { max-width: 720px; margin: 24px auto; background: #fff; padding: 44px 48px; box-shadow: 0 12px 40px rgba(7,26,51,.12); }
  .tailored { display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #1f64e0; background: #eef4ff; border-radius: 999px; padding: 5px 12px; margin-bottom: 16px; }
  h1 { font-size: 30px; margin: 0; letter-spacing: -0.02em; }
  .headline { color: #1f64e0; font-weight: 700; margin: 2px 0 10px; }
  .contact { font-size: 12.5px; color: #526173; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #143f91; border-bottom: 2px solid #dbeafe; padding-bottom: 6px; margin: 26px 0 12px; }
  p.summary { font-size: 14px; line-height: 1.6; color: #2a3445; margin: 0; }
  .item { margin-bottom: 14px; }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
  .row span { color: #526173; font-size: 12.5px; white-space: nowrap; }
  ul { margin: 6px 0 0; padding-left: 18px; }
  li { font-size: 13.5px; line-height: 1.55; color: #2a3445; margin-bottom: 3px; }
  .skills { display: flex; flex-wrap: wrap; gap: 7px; }
  .skill { font-size: 12px; font-weight: 700; color: #143f91; background: #eef4ff; border-radius: 999px; padding: 5px 11px; }
</style></head>
<body><div class="page">
  <span class="tailored">Tailored for ${esc(application.role)} · ${esc(application.company)}</span>
  <h1>${esc(p.fullName)}</h1>
  <div class="headline">${esc(p.headline)}</div>
  <div class="contact">${contact}</div>
  <h2>Summary</h2>
  <p class="summary">${esc(p.summary)}</p>
  <h2>Experience</h2>
  ${experience}
  <h2>Education</h2>
  ${education}
  <h2>Skills</h2>
  <div class="skills">${p.skills.map((s) => `<span class="skill">${esc(s)}</span>`).join("")}</div>
</div></body></html>`;
}

export function ResumeModal({
  application,
  onClose,
}: {
  application: JobApplication;
  onClose: () => void;
}) {
  const html = buildResumeHtml(application);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function download() {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = application.resumeName.replace(/\.pdf$/i, "") + ".html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={application.resumeName}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-navy/55 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_40px_120px_rgba(4,16,42,0.45)]">
        <div className="flex items-center gap-3 border-b border-black/5 px-5 py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-ink">{application.resumeName}</p>
            <p className="truncate text-xs font-semibold text-muted">
              {application.role} · {application.company}
            </p>
          </div>
          <button
            type="button"
            onClick={download}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-xs font-black text-white shadow-[0_10px_22px_-10px_rgba(31,100,224,0.6)] transition-colors hover:bg-brand-700"
          >
            <Download className="size-3.5" />
            Download
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-[#eef3fb]">
          <iframe
            title={application.resumeName}
            srcDoc={html}
            className="h-full min-h-[60vh] w-full border-0"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ViewResumeButton({ application }: { application: JobApplication }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={application.resumeName}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200/70 transition-colors hover:bg-brand-50 hover:ring-brand-300"
      >
        <FileText className="size-3.5" />
        View resume
      </button>
      {open && <ResumeModal application={application} onClose={() => setOpen(false)} />}
    </>
  );
}
