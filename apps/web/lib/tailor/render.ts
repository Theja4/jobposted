import type { ResumeContent } from "@jobposted/shared";

function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dateRange(start?: string, end?: string, current?: boolean) {
  const right = current ? "Present" : end ?? "";
  return [start ?? "", right].filter(Boolean).join(" – ");
}

/** Render a ResumeContent into a print-oriented, ATS-clean HTML document. */
export function renderResumeHtml(resume: ResumeContent): string {
  const contact = [resume.email, resume.phone, resume.location, ...resume.links.map((l) => l.url)]
    .filter(Boolean)
    .map(esc)
    .join("  •  ");

  const experience = resume.experience
    .map(
      (job) => `
      <div class="item">
        <div class="row"><strong>${esc(job.title)}${job.company ? `, ${esc(job.company)}` : ""}</strong><span>${esc(dateRange(job.startDate, job.endDate, job.current))}</span></div>
        ${job.location ? `<p class="muted">${esc(job.location)}</p>` : ""}
        <ul>${job.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
      </div>`,
    )
    .join("");

  const education = resume.education
    .map(
      (e) =>
        `<div class="row"><strong>${esc([e.degree, e.field].filter(Boolean).join(", ") || e.school)}${
          e.degree || e.field ? ` — ${esc(e.school)}` : ""
        }</strong><span>${esc(dateRange(e.startDate, e.endDate))}</span></div>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(resume.name || "Resume")}</title>
<style>
	  @page{size:letter;margin:.58in}
	  *{box-sizing:border-box}
	  body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111827}
	  .page{max-width:7.5in;margin:0 auto;background:#fff;padding:0}
	  h1{font-size:26px;margin:0;letter-spacing:0}
	  .headline{color:#111827;font-weight:700;margin:2px 0 8px}
	  .contact{font-size:11.5px;color:#374151}
	  h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#111827;border-bottom:1px solid #9ca3af;padding-bottom:4px;margin:18px 0 8px}
	  p.summary{font-size:12.5px;line-height:1.42;color:#111827;margin:0}
	  .item{break-inside:avoid;margin-bottom:10px}
	  .row{display:flex;justify-content:space-between;gap:12px;font-size:12.5px}
	  .row span{color:#374151;font-size:11.5px;white-space:nowrap}
	  .muted{color:#374151;font-size:11.5px;margin:2px 0 0}
	  ul{margin:4px 0 0;padding-left:16px}
	  li{font-size:12px;line-height:1.38;color:#111827;margin-bottom:2px}
	  .skills{font-size:12px;line-height:1.45;color:#111827}
	  @media screen{body{background:#eef3fb}.page{margin:24px auto;padding:44px 48px;box-shadow:0 12px 40px rgba(7,26,51,.12)}}
	</style></head>
<body><div class="page">
  <h1>${esc(resume.name || "Your Name")}</h1>
  ${resume.headline ? `<div class="headline">${esc(resume.headline)}</div>` : ""}
  <div class="contact">${contact}</div>
  ${resume.summary ? `<h2>Summary</h2><p class="summary">${esc(resume.summary)}</p>` : ""}
  ${experience ? `<h2>Experience</h2>${experience}` : ""}
  ${education ? `<h2>Education</h2>${education}` : ""}
	  ${resume.skills.length ? `<h2>Skills</h2><div class="skills">${resume.skills.map(esc).join(", ")}</div>` : ""}
</div></body></html>`;
}
