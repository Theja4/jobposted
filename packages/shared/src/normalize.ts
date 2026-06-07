/**
 * Normalization helpers (design doc §9.4): HTML → markdown, location/salary/remote cleanup,
 * and the `RawJob` → `Job` mapping. Intentionally dependency-free so the shared package stays
 * light and the ingest CLI runs with no extra install.
 */

import type { Job, RawJob, RemoteType, SalaryRange } from "./types";

// ── HTML → Markdown ──────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
};

/** Decode the small set of HTML entities common in ATS job descriptions. */
export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m);
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Convert an HTML (or already-plain) job description to lightweight markdown. Handles the
 * tags ATS feeds actually emit (p, br, headings, lists, bold/italic, links) and strips the
 * rest. Good enough for storage + embedding; not a general-purpose converter.
 */
export function htmlToMarkdown(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input;

  // Drop script/style blocks entirely.
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Block-level structure → markdown.
  s = s.replace(/<\s*(h1)[^>]*>([\s\S]*?)<\/\s*h1\s*>/gi, (_m, _t, c) => `\n\n# ${strip(c)}\n\n`);
  s = s.replace(/<\s*(h2)[^>]*>([\s\S]*?)<\/\s*h2\s*>/gi, (_m, _t, c) => `\n\n## ${strip(c)}\n\n`);
  s = s.replace(
    /<\s*(h3|h4|h5|h6)[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi,
    (_m, _t, c) => `\n\n### ${strip(c)}\n\n`,
  );

  // Inline emphasis.
  s = s.replace(/<\s*(strong|b)[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_m, _t, c) => `**${strip(c)}**`);
  s = s.replace(/<\s*(em|i)[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_m, _t, c) => `*${strip(c)}*`);

  // Links → [text](href).
  s = s.replace(
    /<\s*a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/\s*a\s*>/gi,
    (_m, href, text) => {
      const t = strip(text);
      return href ? `[${t || href}](${href})` : t;
    },
  );

  // List items → "- ".
  s = s.replace(/<\s*li[^>]*>([\s\S]*?)<\/\s*li\s*>/gi, (_m, c) => `\n- ${strip(c)}`);
  s = s.replace(/<\/\s*(ul|ol)\s*>/gi, "\n");
  s = s.replace(/<\s*(ul|ol)[^>]*>/gi, "\n");

  // Paragraphs & breaks → newlines.
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/\s*p\s*>/gi, "\n\n");
  s = s.replace(/<\s*p[^>]*>/gi, "");

  // Strip any remaining tags, decode entities, tidy whitespace.
  s = strip(s);
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  return s.length ? s : null;
}

/** Remove tags, decode entities, collapse intra-line whitespace. */
function strip(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/[ \t]{2,}/g, " ").trim();
}

// ── Location ─────────────────────────────────────────────────────────────────

/** Trim and collapse whitespace on a free-text location; null when empty/unknown. */
export function normalizeLocation(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = decodeEntities(input).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (/^(n\/?a|none|unknown)$/i.test(cleaned)) return null;
  return cleaned;
}

// ── Remote arrangement ───────────────────────────────────────────────────────

/**
 * Map a raw remote signal (and/or location text) to a `RemoteType`. ATS feeds use varied
 * vocab — Lever's `workplaceType` is remote|on-site|hybrid; descriptions say "fully remote",
 * "in office", etc.
 */
export function normalizeRemote(
  remoteRaw: string | null | undefined,
  location?: string | null,
): RemoteType {
  const hay = `${remoteRaw ?? ""} ${location ?? ""}`.toLowerCase();
  if (!hay.trim()) return "unknown";
  if (/\bhybrid\b/.test(hay)) return "hybrid";
  if (/\b(remote|work from home|wfh|distributed|anywhere)\b/.test(hay)) return "remote";
  if (/\b(on[\s-]?site|in[\s-]?office|in[\s-]?person)\b/.test(hay)) return "on-site";
  return "unknown";
}

// ── Salary ───────────────────────────────────────────────────────────────────

/** Split a SalaryRange into the three flat columns the jobs table stores. */
export function normalizeSalary(salary: SalaryRange | null | undefined): {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
} {
  if (!salary) return { salaryMin: null, salaryMax: null, salaryCurrency: null };
  const min = isFiniteNumber(salary.min) ? salary.min : null;
  const max = isFiniteNumber(salary.max) ? salary.max : null;
  const currency = salary.currency ? salary.currency.toUpperCase().slice(0, 3) : null;
  return { salaryMin: min, salaryMax: max, salaryCurrency: currency };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// ── RawJob → Job ─────────────────────────────────────────────────────────────

/** Map a source-shaped `RawJob` into the normalized `Job` stored in `jobposted.jobs`. */
export function normalizeJob(raw: RawJob): Job {
  const location = normalizeLocation(raw.location);
  const { salaryMin, salaryMax, salaryCurrency } = normalizeSalary(raw.salary);
  return {
    source: raw.source,
    sourceJobId: raw.sourceJobId,
    atsType: raw.atsType,
    company: raw.company.trim(),
    title: raw.title.trim(),
    location,
    remote: normalizeRemote(raw.remoteRaw, location),
    descriptionMd: htmlToMarkdown(raw.descriptionHtml),
    applyUrl: raw.applyUrl,
    formQuestions: raw.formQuestions ?? [],
    salaryMin,
    salaryMax,
    salaryCurrency,
    visaSponsorship: raw.visaSponsorship ?? null,
    postedAt: raw.postedAt ?? null,
    embedding: null,
  };
}
