import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ResumeContent } from "@jobposted/shared";

/**
 * Render a ResumeContent to a clean, ATS-safe PDF: US Letter, single column (stable parse order),
 * standard Helvetica (selectable/extractable text — no text-in-images), comma-listed skills (no
 * background-filled pills). Pure JS (pdf-lib), so it runs in a serverless Node route.
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
const MARGIN = 54; // 0.75in
const CONTENT_W = PAGE_W - MARGIN * 2;
const USABLE_H = PAGE_H - MARGIN * 2;

const MIN_DENSITY = 0.82;
const MAX_DENSITY = 1.12;
const DENSITY_STEPS = 20;

const INK = rgb(0.04, 0.07, 0.13);
const GRAY = rgb(0.32, 0.38, 0.45);
const ACCENT = rgb(0.12, 0.25, 0.57);
const RULE = rgb(0.8, 0.86, 0.95);
type Color = ReturnType<typeof rgb>;

type Fonts = { regular: PDFFont; bold: PDFFont };

type Style = {
  name: number; headline: number; contact: number; h2: number; summary: number;
  expTitle: number; expMeta: number; bullet: number; eduTitle: number; skills: number;
  lineGap: number; summaryGap: number; bulletGap: number; metaGap: number; tight: number;
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

function makeStyle(d: number): Style {
  const f = (base: number, floor: number) => Math.max(floor, base * d);
  const g = (base: number) => Math.max(1.4, base * d);
  return {
    name: f(20, 15), headline: f(11, 9.5), contact: f(9.5, 8), h2: f(10.5, 9), summary: f(10, 8.5),
    expTitle: f(11, 9.5), expMeta: f(9.5, 8), bullet: f(10, 8.5), eduTitle: f(11, 9.5), skills: f(10, 8.5),
    lineGap: g(3), summaryGap: g(3.5), bulletGap: g(2.5), metaGap: g(3), tight: g(2),
    sectionBefore: g(10), sectionRuleGap: g(6), headingGap: g(4), itemAfter: g(6), contactGap: g(2),
  };
}

function dateRange(start?: string, end?: string, current?: boolean): string {
  const right = current ? "Present" : end ?? "";
  return [start ?? "", right].filter(Boolean).join(" - ");
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
  const para = (text: string, font: PDFFont, size: number, color: Color, gap: number, x = MARGIN, width = CONTENT_W) => {
    for (const line of wrap(text, font, size, width)) blocks.push({ t: "line", text: line, font, size, color, x, gapAfter: gap });
  };
  // A heading stays glued to its rule AND the first line of its section (no dangling heading).
  const heading = (label: string) => {
    blocks.push({ t: "space", h: st.sectionBefore, keepWithNext: true });
    blocks.push({ t: "line", text: label.toUpperCase(), font: fonts.bold, size: st.h2, color: ACCENT, x: MARGIN, gapAfter: st.headingGap, keepWithNext: true });
    blocks.push({ t: "rule", gapBefore: 0, gapAfter: st.sectionRuleGap, keepWithNext: true });
  };

  para(resume.name || "Your Name", fonts.bold, st.name, INK, st.headingGap);
  if (resume.headline) para(resume.headline, fonts.bold, st.headline, ACCENT, st.contactGap);
  const contact = [resume.email, resume.phone, resume.location, ...resume.links.map((l) => l.url)].filter(Boolean).join("  |  ");
  if (contact) para(contact, fonts.regular, st.contact, GRAY, st.contactGap);

  if (resume.summary) {
    heading("Summary");
    para(resume.summary, fonts.regular, st.summary, INK, st.summaryGap);
  }

  if (resume.experience.length > 0) {
    heading("Experience");
    for (const job of resume.experience) {
      const title = [job.title, job.company].filter(Boolean).join(", ");
      const dates = dateRange(job.startDate, job.endDate, job.current);
      const dateW = dates ? fonts.regular.widthOfTextAtSize(dates, st.expMeta) : 0;
      const titleLines = wrap(title, fonts.bold, st.expTitle, CONTENT_W - dateW - 12);
      titleLines.forEach((line, i) =>
        blocks.push({
          t: "line",
          text: line,
          font: fonts.bold,
          size: st.expTitle,
          color: INK,
          x: MARGIN,
          gapAfter: i === titleLines.length - 1 ? st.tight : st.lineGap,
          right: i === 0 && dates ? { text: dates, size: st.expMeta, color: GRAY } : undefined,
          // The title's last line stays with the line that follows (location or first bullet).
          keepWithNext: i === titleLines.length - 1,
        }),
      );
      if (job.location) blocks.push({ t: "line", text: job.location, font: fonts.regular, size: st.expMeta, color: GRAY, x: MARGIN, gapAfter: st.metaGap });
      for (const bullet of job.bullets) {
        const lines = wrap(bullet, fonts.regular, st.bullet, CONTENT_W - 14);
        lines.forEach((line, i) =>
          blocks.push({
            t: "line",
            text: i === 0 ? `- ${line}` : line,
            font: fonts.regular,
            size: st.bullet,
            color: INK,
            x: MARGIN + (i === 0 ? 0 : 10),
            gapAfter: st.bulletGap,
          }),
        );
      }
      blocks.push({ t: "space", h: st.itemAfter });
    }
  }

  if (resume.education.length > 0) {
    heading("Education");
    for (const e of resume.education) {
      const head = [e.degree, e.field].filter(Boolean).join(", ") || e.school;
      const suffix = (e.degree || e.field) && e.school ? ` - ${e.school}` : "";
      const dates = dateRange(e.startDate, e.endDate);
      const dateW = dates ? fonts.regular.widthOfTextAtSize(dates, st.expMeta) : 0;
      const lines = wrap(`${head}${suffix}`, fonts.bold, st.eduTitle, CONTENT_W - dateW - 12);
      lines.forEach((line, i) =>
        blocks.push({
          t: "line",
          text: line,
          font: fonts.bold,
          size: st.eduTitle,
          color: INK,
          x: MARGIN,
          gapAfter: st.tight,
          right: i === 0 && dates ? { text: dates, size: st.expMeta, color: GRAY } : undefined,
        }),
      );
      blocks.push({ t: "space", h: st.metaGap });
    }
  }

  if (resume.skills.length > 0) {
    heading("Skills");
    para(resume.skills.join(", "), fonts.regular, st.skills, INK, st.lineGap);
  }

  return blocks;
}

function blockHeight(b: Block): number {
  if (b.t === "line") return b.size + b.gapAfter;
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
          page.drawText(clean(b.text), { x: b.x, y, size: b.size, font: b.font, color: b.color });
          if (b.right) {
            const w = fonts.regular.widthOfTextAtSize(b.right.text, b.right.size);
            page.drawText(b.right.text, { x: MARGIN + CONTENT_W - w, y, size: b.right.size, font: fonts.regular, color: b.right.color });
          }
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

/**
 * Pick the densest font/spacing scale that still renders in the minimum feasible number of pages.
 * Because larger density ⇒ taller content ⇒ more pages (monotone), the densest layout at the
 * minimum page count fills those pages as fully as possible — so a slightly-too-long resume packs
 * back onto one full page instead of orphaning a line, and a true two-pager fills both pages.
 */
function fitResume(resume: ResumeContent, fonts: Fonts): { density: number; plan: PagePlan } {
  const planAt = (d: number) => paginate(null, layout(resume, makeStyle(d), fonts), fonts);
  const target = Math.max(1, planAt(MIN_DENSITY).pages); // fewest pages achievable

  let best: { density: number; plan: PagePlan } | null = null;
  for (let i = DENSITY_STEPS; i >= 0; i--) {
    const density = MIN_DENSITY + ((MAX_DENSITY - MIN_DENSITY) * i) / DENSITY_STEPS;
    const plan = planAt(density);
    if (plan.pages === target) {
      best = { density, plan }; // first match scanning high→low = densest layout at target pages
      break;
    }
  }
  return best ?? { density: MIN_DENSITY, plan: planAt(MIN_DENSITY) };
}

/** Diagnostics: the page count + last-page fill the renderer will produce (used in tests). */
export async function measureResumePdf(resume: ResumeContent): Promise<{ pages: number; lastFill: number; density: number }> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const { density, plan } = fitResume(resume, fonts);
  return { pages: plan.pages, lastFill: plan.lastFill, density };
}

export async function renderResumePdf(resume: ResumeContent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(resume.name || "Resume"));
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const { density } = fitResume(resume, fonts);
  paginate(doc, layout(resume, makeStyle(density), fonts), fonts);
  return doc.save();
}
