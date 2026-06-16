import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { ResumeContent } from "@jobposted/shared";

/**
 * Render a ResumeContent to an ATS-friendly .docx: single column, real headings/paragraphs (no
 * text boxes, tables, or images), comma-listed skills. Page-fit isn't applied to DOCX — Word
 * reflows by design and recruiters often edit it — so this mirrors the PDF's content/structure
 * without the fixed-page density tuning.
 */

const ACCENT = "1F40A0";
const GRAY = "53606F";

function dateRange(start?: string, end?: string, current?: boolean): string {
  const right = current ? "Present" : end ?? "";
  return [start ?? "", right].filter(Boolean).join(" – ");
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    border: { bottom: { color: "DBEAFE", size: 6, style: BorderStyle.SINGLE, space: 2 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: ACCENT, size: 21, characterSpacing: 12 })],
  });
}

/** Left-bold + right-gray on one line via a right tab stop (e.g. "Title, Company …… 2021 – Present"). */
function titleWithDate(title: string, dates: string): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9360 }], // ~6.5in content width
    spacing: { after: 20 },
    children: [
      new TextRun({ text: title, bold: true, size: 22 }),
      ...(dates ? [new TextRun({ text: `\t${dates}`, color: GRAY, size: 19 })] : []),
    ],
  });
}

export async function renderResumeDocx(resume: ResumeContent): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 40 },
      children: [new TextRun({ text: resume.name || "Your Name", bold: true, size: 40 })],
    }),
  );
  if (resume.headline) {
    children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: resume.headline, bold: true, color: ACCENT, size: 23 })] }));
  }
  const contact = [resume.email, resume.phone, resume.location, ...resume.links.map((l) => l.url)].filter(Boolean).join("  |  ");
  if (contact) children.push(new Paragraph({ children: [new TextRun({ text: contact, color: GRAY, size: 19 })] }));

  if (resume.summary) {
    children.push(sectionHeading("Summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: resume.summary, size: 20 })] }));
  }

  if (resume.experience.length > 0) {
    children.push(sectionHeading("Experience"));
    for (const job of resume.experience) {
      const title = [job.title, job.company].filter(Boolean).join(", ");
      children.push(titleWithDate(title, dateRange(job.startDate, job.endDate, job.current)));
      if (job.location) children.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: job.location, color: GRAY, size: 19 })] }));
      for (const bullet of job.bullets) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text: bullet, size: 20 })] }));
      }
    }
  }

  if (resume.education.length > 0) {
    children.push(sectionHeading("Education"));
    for (const e of resume.education) {
      const head = [e.degree, e.field].filter(Boolean).join(", ") || e.school;
      const suffix = (e.degree || e.field) && e.school ? ` – ${e.school}` : "";
      children.push(titleWithDate(`${head}${suffix}`, dateRange(e.startDate, e.endDate)));
    }
  }

  if (resume.skills.length > 0) {
    children.push(sectionHeading("Skills"));
    children.push(new Paragraph({ children: [new TextRun({ text: resume.skills.join(", "), size: 20 })] }));
  }

  const doc = new Document({
    creator: "JobPosted",
    title: resume.name || "Resume",
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 780, right: 780 } } }, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
