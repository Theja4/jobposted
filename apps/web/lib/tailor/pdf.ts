import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ResumeContent } from "@jobposted/shared";

/**
 * Render a ResumeContent to a clean, ATS-safe PDF using Rezoomed's Jake-style
 * "Timeless" template: centered serif header, black section rules, compact
 * bullets, and inline skills. Pure JS (pdf-lib), so it runs in a serverless
 * Node route without browser screenshot PDFs.
 *
 * Page-fit engine (robust to tailoring changing text length):
 *  - Content is laid out as measurable blocks with keep-together flags (a heading never sits alone
 *    at a page bottom; an experience title never separates from its first line).
 *  - One `paginate()` routine does BOTH measuring and drawing, so the measured page count/fill is
 *    exactly what renders — no fudge factor, no estimate-vs-reality drift.
 *  - We pick the *densest* font/spacing scale that still fills the minimum feasible page count.
 *    That packs a slightly-overflowing resume back onto one full page (killing the "two words on
 *    page 2 + big bottom gap" orphan) and fills a genuine two-pager across both pages, regardless
 *    of how much the AI lengthened or shortened the text.
 */

const PAGE_W = 612; // 8.5in * 72
const PAGE_H = 792; // 11in * 72
const MARGIN = 42; // Jake-style compact margin, still readable on US Letter.
const CONTENT_W = PAGE_W - MARGIN * 2;
const USABLE_H = PAGE_H - MARGIN * 2;

const MIN_DENSITY = 0.84;
const MAX_DENSITY = 1.16;
const DENSITY_STEPS = 20;
const TARGET_SINGLE_PAGE_FILL = 0.84;
// Multi-pagers should fill the final page rather than trail off; a touch lower than
// the single-page target so we don't over-space a long resume's last page.
const TARGET_LAST_PAGE_FILL = 0.72;
const MAX_VERTICAL_FILL = 2.6;
const VERTICAL_FILL_STEPS = 24;
// Orphan rescue: a trailing page this empty (a 1–2 line spillover) is unprofessional,
// so we try harder compression to pull it back onto one fewer page.
const ORPHAN_RESCUE_FILL = 0.18;
const EMERGENCY_DENSITY = 0.78; // density floor used ONLY while rescuing an orphan
const MIN_VERTICAL = 0.9; // spacing-tighten floor used ONLY while rescuing an orphan
const ORPHAN_TIGHTEN_STEPS = 4;

const INK = rgb(0.04, 0.07, 0.13);
const RULE = rgb(0, 0, 0);
type Color = ReturnType<typeof rgb>;

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont };

type Style = {
  name: number; headline: number; contact: number; h2: number; summary: number;
  expTitle: number; expMeta: number; bullet: number; eduTitle: number; skills: number;
  lineGap: number; summaryGap: number; bulletGap: number; metaGap: number; tight: number; itemTight: number;
  sectionBefore: number; sectionRuleGap: number; headingGap: number; itemAfter: number; contactGap: number;
};

type Block =
  | {
      t: "line";
      text: string;
      font: PDFFont;
      size: number;
      color: Color;
      x: number;
      gapAfter: number;
      right?: { text: string; size: number; color: Color };
      align?: "center";
      keepWithNext?: boolean;
    }
  | {
      t: "skillLine";
      label: string;
      text: string;
      labelFont: PDFFont;
      font: PDFFont;
      size: number;
      color: Color;
      x: number;
      gapAfter: number;
      keepWithNext?: boolean;
    }
  | { t: "rule"; gapBefore: number; gapAfter: number; keepWithNext?: boolean }
  | { t: "space"; h: number; keepWithNext?: boolean };

/** Keep text to glyphs the WinAnsi standard fonts can encode (pdf-lib throws otherwise). */
function clean(text: string): string {
  return (text ?? "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function makeStyle(d: number, vertical = 1): Style {
  const f = (base: number, floor: number) => Math.max(floor, base * d);
  const g = (base: number, scale = 1) => Math.max(1.4, base * d * scale);
  const inline = Math.min(vertical, 1.25);
  const flow = Math.min(vertical, 1.55);
  return {
    name: f(25.5, 20),
    headline: f(10.4, 9),
    contact: f(9.8, 8.6),
    h2: f(12.8, 10.5),
    summary: f(9.9, 8.7),
    expTitle: f(11.2, 9.7),
    expMeta: f(9.8, 8.5),
    bullet: f(9.8, 8.5),
    eduTitle: f(11.2, 9.7),
    skills: f(9.8, 8.5),
    lineGap: g(2, inline),
    summaryGap: g(2.6, flow),
    bulletGap: g(1.6, inline),
    metaGap: g(1.8, flow),
    tight: g(1, inline),
    itemTight: g(3.2, vertical),
    sectionBefore: g(9, vertical),
    sectionRuleGap: g(4.2, flow),
    headingGap: g(3.2, flow),
    itemAfter: g(5, vertical),
    contactGap: g(1.6, flow),
  };
}

function dateRange(start?: string, end?: string, current?: boolean): string {
  const right = current ? "Present" : end ?? "";
  return [start ?? "", right].filter(Boolean).join(" - ");
}

const SKILL_GROUPS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "Product",
    pattern:
      /\b(product|roadmap|prds?|user stor(?:y|ies)|user research|acceptance criteria|backlog|mvp|discovery|success metrics?|a\/b|agile|scrum|stakeholder|go[- ]?to[- ]?market|gtm)\b/i,
  },
  {
    label: "Data & AI",
    pattern:
      /\b(sql|python|rag|vector|embedding|prompt|llm|ai|machine learning|analytics|tableau|experiment|evaluation)\b/i,
  },
  {
    label: "Engineering",
    pattern:
      /\b(api|rest|microservices?|linux|debug|git|backend|frontend|cloud|system|architecture|integration)\b/i,
  },
  {
    label: "Tools",
    pattern:
      /\b(jira|confluence|postman|figma|excel|powerpoint|notion|slack|ms\s|microsoft)\b/i,
  },
];

function groupedSkillSections(skills: string[]) {
  const seen = new Set<string>();
  const buckets = new Map(SKILL_GROUPS.map((group) => [group.label, [] as string[]]));
  const other: string[] = [];

  for (const raw of skills) {
    const skill = clean(raw);
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);

    const group = SKILL_GROUPS.find((candidate) => candidate.pattern.test(skill));
    if (group) buckets.get(group.label)?.push(skill);
    else other.push(skill);
  }

  const sections: Array<{ label: string; values: string[] }> = [];
  for (const group of SKILL_GROUPS) {
    const values = buckets.get(group.label) ?? [];
    if (values.length > 0) sections.push({ label: group.label, values });
  }
  if (other.length > 0) sections.push({ label: "Additional", values: other });
  return sections;
}

const yearOf = (s?: string): number | null => {
  const m = (s ?? "").match(/(?:19|20)\d{2}/);
  return m ? Number(m[0]) : null;
};

/** Estimate total years of experience from the resume's date ranges (heuristic). */
export function estimateExperienceYears(resume: ResumeContent): number {
  const now = new Date().getFullYear();
  let minStart = Infinity;
  let maxEnd = 0;
  for (const e of resume.experience) {
    const start = yearOf(e.startDate);
    const end = e.current ? now : yearOf(e.endDate) ?? (start ? now : null);
    if (start) minStart = Math.min(minStart, start);
    if (end) maxEnd = Math.max(maxEnd, end);
  }
  if (!Number.isFinite(minStart) || maxEnd === 0) return resume.experience.length >= 3 ? 4 : 1;
  return Math.max(0, maxEnd - minStart);
}

/** Build the ordered, measurable block list for a given density style. */
function layout(resume: ResumeContent, st: Style, fonts: Fonts): Block[] {
  const blocks: Block[] = [];
  const para = (
    text: string,
    font: PDFFont,
    size: number,
    color: Color,
    gap: number,
    x = MARGIN,
    width = CONTENT_W,
    align?: "center",
  ) => {
    for (const line of wrap(text, font, size, width)) {
      blocks.push({ t: "line", text: line, font, size, color, x, gapAfter: gap, align });
    }
  };
  const heading = (label: string) => {
    blocks.push({ t: "space", h: st.sectionBefore, keepWithNext: true });
    blocks.push({
      t: "line",
      text: label.toUpperCase(),
      font: fonts.regular,
      size: st.h2,
      color: INK,
      x: MARGIN,
      gapAfter: st.headingGap,
      keepWithNext: true,
    });
    blocks.push({ t: "rule", gapBefore: 0, gapAfter: st.sectionRuleGap, keepWithNext: true });
  };
  const titleLine = (
    left: string,
    right: string,
    font: PDFFont,
    size: number,
    gap: number,
    keepWithNext = true,
  ) => {
    const rightW = right ? fonts.regular.widthOfTextAtSize(right, st.expMeta) : 0;
    const lines = wrap(left, font, size, CONTENT_W - rightW - (right ? 14 : 0));
    lines.forEach((line, i) =>
      blocks.push({
        t: "line",
        text: line,
        font,
        size,
        color: INK,
        x: MARGIN + 12,
        gapAfter: i === lines.length - 1 ? gap : st.lineGap,
        right: i === 0 && right ? { text: right, size: st.expMeta, color: INK } : undefined,
        keepWithNext: i === lines.length - 1 ? keepWithNext : undefined,
      }),
    );
  };
  const metaLine = (left: string, right: string) => {
    const rightW = right ? fonts.italic.widthOfTextAtSize(right, st.expMeta) : 0;
    const lines = wrap(left, fonts.italic, st.expMeta, CONTENT_W - rightW - (right ? 14 : 0));
    lines.forEach((line, i) =>
      blocks.push({
        t: "line",
        text: line,
        font: fonts.italic,
        size: st.expMeta,
        color: INK,
        x: MARGIN + 12,
        gapAfter: i === lines.length - 1 ? st.metaGap : st.lineGap,
        right: i === 0 && right ? { text: right, size: st.expMeta, color: INK } : undefined,
      }),
    );
  };
  const bullet = (text: string) => {
    const lines = wrap(text, fonts.regular, st.bullet, CONTENT_W - 34);
    lines.forEach((line, i) =>
      blocks.push({
        t: "line",
        text: i === 0 ? `- ${line}` : line,
        font: fonts.regular,
        size: st.bullet,
        color: INK,
        x: MARGIN + (i === 0 ? 24 : 34),
        gapAfter: st.bulletGap,
      }),
    );
  };
  const skillLine = (label: string, values: string[]) => {
    const prefix = `${label}:`;
    const valueText = values.join(", ");
    const prefixW = fonts.bold.widthOfTextAtSize(prefix, st.skills) + 4;
    const lines = wrap(valueText, fonts.regular, st.skills, CONTENT_W - prefixW);
    if (lines.length === 0) return;
    blocks.push({
      t: "skillLine",
      label: prefix,
      text: lines[0]!,
      labelFont: fonts.bold,
      font: fonts.regular,
      size: st.skills,
      color: INK,
      x: MARGIN,
      gapAfter: st.tight,
      keepWithNext: lines.length > 1,
    });
    for (const line of lines.slice(1)) {
      blocks.push({
        t: "line",
        text: line,
        font: fonts.regular,
        size: st.skills,
        color: INK,
        x: MARGIN + 18,
        gapAfter: st.tight,
      });
    }
  };

  para(resume.name || "Your Name", fonts.bold, st.name, INK, st.headingGap, MARGIN, CONTENT_W, "center");
  if (resume.headline) {
    para(resume.headline, fonts.italic, st.headline, INK, st.contactGap, MARGIN, CONTENT_W, "center");
  }
  const links = resume.links
    .map((link) => clean(link.url))
    .filter(Boolean);
  const contact = [resume.phone, resume.email, ...links, resume.location].filter(Boolean).join(" | ");
  if (contact) para(contact, fonts.regular, st.contact, INK, st.contactGap, MARGIN, CONTENT_W, "center");

  if (resume.summary) {
    heading("Summary");
    para(resume.summary, fonts.regular, st.summary, INK, st.summaryGap);
  }

  if (resume.experience.length > 0) {
    heading("Work Experience");
    for (const job of resume.experience) {
      const title = job.title || job.company;
      const dates = dateRange(job.startDate, job.endDate, job.current);
      if (title) titleLine(title, dates, fonts.bold, st.expTitle, st.tight);
      const meta = [job.company && job.title ? job.company : "", job.location].filter(Boolean).join(" - ");
      if (meta) metaLine(meta, "");
      for (const item of job.bullets) {
        bullet(item);
      }
      blocks.push({ t: "space", h: st.itemAfter });
    }
  }

  if (resume.projects.length > 0) {
    heading("Projects");
    for (const project of resume.projects) {
      const name = project.name || "Project";
      const tech = (project.technologies ?? []).map(clean).filter(Boolean).join(", ");
      titleLine(name, "", fonts.bold, st.expTitle, st.tight);
      if (tech) {
        metaLine(tech, "");
      }
      if (project.description) {
        para(project.description, fonts.regular, st.summary, INK, st.summaryGap, MARGIN + 12, CONTENT_W - 12);
      }
      for (const item of project.bullets ?? []) {
        bullet(item);
      }
      if (project.url) {
        metaLine(project.url, "");
      }
      blocks.push({ t: "space", h: st.itemAfter });
    }
  }

  if (resume.education.length > 0) {
    heading("Education");
    for (const e of resume.education) {
      const dates = dateRange(e.startDate, e.endDate);
      titleLine(e.school || [e.degree, e.field].filter(Boolean).join(", "), dates, fonts.bold, st.eduTitle, st.tight);
      const degreeLine = [
        [e.degree, e.field].filter(Boolean).join(", "),
        e.gpa ? `GPA: ${e.gpa}` : "",
      ].filter(Boolean).join(", ");
      if (degreeLine) metaLine(degreeLine, "");
      blocks.push({ t: "space", h: st.itemTight });
    }
  }

  if (resume.certifications.length > 0) {
    heading("Certifications");
    for (const certification of resume.certifications) {
      titleLine(certification.name || certification.issuer || "Certification", certification.date ?? "", fonts.bold, st.expTitle, st.tight);
      const details = [certification.issuer, certification.url].filter(Boolean).join(" - ");
      if (details) metaLine(details, "");
      blocks.push({ t: "space", h: st.itemTight });
    }
  }

  if (resume.skills.length > 0 || resume.languages.length > 0 || resume.interests.length > 0) {
    heading("Skills");
    for (const section of groupedSkillSections(resume.skills)) {
      skillLine(section.label, section.values);
    }
    if (resume.languages.length > 0) {
      skillLine("Languages", resume.languages);
    }
    if (resume.interests.length > 0) {
      skillLine("Interests", resume.interests);
    }
  }

  if (resume.awards.length > 0) {
    heading("Awards");
    for (const award of resume.awards) {
      titleLine(award.title || award.issuer || "Award", award.date ?? "", fonts.bold, st.expTitle, st.tight);
      const details = [award.issuer, award.url].filter(Boolean).join(" - ");
      if (details) metaLine(details, "");
      blocks.push({ t: "space", h: st.itemTight });
    }
  }

  if (resume.publications.length > 0) {
    heading("Publications");
    for (const publication of resume.publications) {
      titleLine(publication.title || publication.publisher || "Publication", publication.date ?? "", fonts.bold, st.expTitle, st.tight);
      const details = [publication.publisher, publication.url].filter(Boolean).join(" - ");
      if (details) metaLine(details, "");
      blocks.push({ t: "space", h: st.itemTight });
    }
  }

  if (resume.references.length > 0) {
    heading("References");
    for (const reference of resume.references) {
      para(reference, fonts.regular, st.summary, INK, st.summaryGap);
    }
  }

  return blocks;
}

function blockHeight(b: Block): number {
  if (b.t === "line" || b.t === "skillLine") return b.size + b.gapAfter;
  if (b.t === "rule") return b.gapBefore + 1 + b.gapAfter;
  return b.h;
}

type PagePlan = { pages: number; lastFill: number };

/**
 * The single pagination routine used for BOTH measuring and drawing. When `doc` is null it only
 * measures (page count + how full the last page is); when given, it draws identically — so what we
 * measured during the fit search is exactly what renders. Honors keep-together runs.
 */
function paginate(doc: PDFDocument | null, blocks: Block[], fonts: Fonts): PagePlan {
  let page = doc ? doc.addPage([PAGE_W, PAGE_H]) : null;
  let y = PAGE_H - MARGIN;
  let pages = 1;
  const atPageTop = () => y >= PAGE_H - MARGIN - 0.01;
  const breakPage = () => {
    page = doc ? doc.addPage([PAGE_W, PAGE_H]) : null;
    y = PAGE_H - MARGIN;
    pages += 1;
  };

  for (let i = 0; i < blocks.length; ) {
    // Gather the keep-together run starting at i (this block + the chain it must not split from).
    let j = i;
    let runH = blockHeight(blocks[i]!);
    while (blocks[j]!.keepWithNext && j + 1 < blocks.length) {
      j += 1;
      runH += blockHeight(blocks[j]!);
    }
    // If the whole run can fit on a page but not in the remaining space, break before it.
    if (runH <= USABLE_H && y - runH < MARGIN && !atPageTop()) breakPage();

    for (let k = i; k <= j; k++) {
      const b = blocks[k]!;
      if (b.t === "line") {
        if (y - b.size < MARGIN && !atPageTop()) breakPage(); // safety for runs taller than a page
        y -= b.size;
        if (doc && page) {
          const text = clean(b.text);
          const x = b.align === "center" ? MARGIN + (CONTENT_W - b.font.widthOfTextAtSize(text, b.size)) / 2 : b.x;
          page.drawText(text, { x, y, size: b.size, font: b.font, color: b.color });
          if (b.right) {
            const rightText = clean(b.right.text);
            const w = fonts.regular.widthOfTextAtSize(rightText, b.right.size);
            page.drawText(rightText, { x: MARGIN + CONTENT_W - w, y, size: b.right.size, font: fonts.regular, color: b.right.color });
          }
        }
        y -= b.gapAfter;
      } else if (b.t === "skillLine") {
        if (y - b.size < MARGIN && !atPageTop()) breakPage();
        y -= b.size;
        if (doc && page) {
          const label = clean(b.label);
          const text = clean(b.text);
          page.drawText(label, { x: b.x, y, size: b.size, font: b.labelFont, color: b.color });
          const offset = b.labelFont.widthOfTextAtSize(label, b.size) + 4;
          page.drawText(text, { x: b.x + offset, y, size: b.size, font: b.font, color: b.color });
        }
        y -= b.gapAfter;
      } else if (b.t === "rule") {
        y -= b.gapBefore;
        if (doc && page) page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: MARGIN + CONTENT_W, y: y + 1 }, thickness: 1, color: RULE });
        y -= 1 + b.gapAfter;
      } else if (!atPageTop()) {
        // Collapse leading whitespace at the top of a fresh page (keeps measure == render).
        y -= b.h;
      }
    }
    i = j + 1;
  }

  const consumedLast = PAGE_H - MARGIN - y;
  return { pages, lastFill: Math.max(0, Math.min(1, consumedLast / USABLE_H)) };
}

type FitPlan = { density: number; vertical: number; plan: PagePlan };
type PlanAt = (d: number, vertical?: number) => PagePlan;

/** Densest (largest-type) layout scanning high→low density that still renders in exactly `pages`. */
function densestPlanAtPages(planAt: PlanAt, pages: number, dMin: number, dMax: number, vertical = 1): FitPlan | null {
  for (let i = DENSITY_STEPS; i >= 0; i--) {
    const density = dMin + ((dMax - dMin) * i) / DENSITY_STEPS;
    const plan = planAt(density, vertical);
    if (plan.pages === pages) return { density, vertical, plan };
  }
  return null;
}

/**
 * Pick the densest font/spacing scale that still renders in the minimum feasible number of pages.
 * Because larger density ⇒ taller content ⇒ more pages (monotone), the densest layout at the
 * minimum page count fills those pages as fully as possible — so a slightly-too-long resume packs
 * back onto one full page instead of orphaning a line, and a true two-pager fills both pages.
 */
function fitResume(resume: ResumeContent, fonts: Fonts): FitPlan {
  const planAt: PlanAt = (d, vertical = 1) => paginate(null, layout(resume, makeStyle(d, vertical), fonts), fonts);
  const minPlan = planAt(MIN_DENSITY);
  const target = Math.max(1, minPlan.pages); // fewest pages achievable

  // Orphan rescue: when even the most-compact layout still spills only a sliver onto a trailing
  // page (a 1–2 line orphan above a near-empty page), tighten spacing and allow an emergency
  // density floor to pull it back onto one fewer page. Genuine multi-pagers, whose trailing page
  // is already well filled, never trip this and keep their natural page count.
  if (target > 1 && minPlan.lastFill < ORPHAN_RESCUE_FILL) {
    for (let i = 0; i <= ORPHAN_TIGHTEN_STEPS; i++) {
      const vertical = 1 - ((1 - MIN_VERTICAL) * i) / ORPHAN_TIGHTEN_STEPS;
      const rescued = densestPlanAtPages(planAt, target - 1, EMERGENCY_DENSITY, MAX_DENSITY, vertical);
      if (rescued) return rescued;
    }
  }

  let best = densestPlanAtPages(planAt, target, MIN_DENSITY, MAX_DENSITY) ?? { density: MIN_DENSITY, vertical: 1, plan: minPlan };

  // Bottom-fill: a sparse final page (a big blank gap) reads as unprofessional whether the resume
  // is one page or three. Expand structural whitespace until the last page is reasonably full,
  // capped so we never spill onto a new page or balloon the type.
  const fillTarget = target === 1 ? TARGET_SINGLE_PAGE_FILL : TARGET_LAST_PAGE_FILL;
  if (best.plan.lastFill < fillTarget) {
    let filled = best;
    for (let i = 1; i <= VERTICAL_FILL_STEPS; i++) {
      const vertical = 1 + ((MAX_VERTICAL_FILL - 1) * i) / VERTICAL_FILL_STEPS;
      const plan = planAt(best.density, vertical);
      if (plan.pages !== target) break;
      filled = { density: best.density, vertical, plan };
      if (plan.lastFill >= fillTarget) break;
    }
    best = filled;
  }

  return best;
}

/** Diagnostics: the page count + last-page fill the renderer will produce (used in tests). */
export async function measureResumePdf(resume: ResumeContent): Promise<{ pages: number; lastFill: number; density: number; vertical: number }> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const { density, vertical, plan } = fitResume(resume, fonts);
  return { pages: plan.pages, lastFill: plan.lastFill, density, vertical };
}

export async function renderResumePdf(resume: ResumeContent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(resume.name || "Resume"));
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const { density, vertical } = fitResume(resume, fonts);
  paginate(doc, layout(resume, makeStyle(density, vertical), fonts), fonts);
  return doc.save();
}
