/**
 * Cross-source deduplication (design doc §9.4). The same role appears 3–5 times across Lever,
 * Greenhouse, and aggregators. We collapse on normalized (company, title, location) and keep
 * the row with the most direct apply_url (prefer Greenhouse/Lever over an aggregator redirect),
 * the richest description, and the most complete question set.
 */

import type { AtsType, Job, JobSource } from "./types";

/** Lower → strip punctuation/diacritics → collapse whitespace, for stable comparison keys. */
export function canonical(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The grouping key: same company + title + location ⇒ same posting (design doc §9.4). */
export function dedupeKey(
  company: string | null,
  title: string | null,
  location: string | null,
): string {
  return [canonical(company), canonical(title), canonical(location)].join("|");
}

// ── apply_url directness ranking ─────────────────────────────────────────────

/**
 * Higher = more direct. Direct ATS apply links beat aggregator redirects (design doc §9.4).
 * Source and ATS both contribute so an aggregator row that happens to carry a real ATS link
 * still outranks a pure redirect.
 */
const ATS_RANK: Record<AtsType, number> = {
  greenhouse: 5,
  lever: 5,
  ashby: 4,
  smartrecruiters: 3,
  workable: 3,
  workday: 2,
  icims: 2,
  taleo: 2,
  oracle: 2,
  successfactors: 2,
  jobvite: 2,
  bamboohr: 2,
  dover: 2,
  indeed: 1,
  rippling: 2,
  paylocity: 2,
  linkedin: 1,
  other: 0,
};

const SOURCE_RANK: Record<JobSource, number> = {
  greenhouse: 5,
  lever: 5,
  ashby: 4,
  smartrecruiters: 3,
  workable: 3,
  workday: 2,
  linkedin: 2,
  icims: 2,
  extension: 2,
  manual: 2,
  adzuna: 1,
  jsearch: 1,
  apify: 1,
};

export function applyUrlDirectness(job: Pick<Job, "source" | "atsType">): number {
  return (SOURCE_RANK[job.source] ?? 0) * 10 + (ATS_RANK[job.atsType] ?? 0);
}

/** Return whichever job has the more direct apply_url (ties → `a`). */
export function pickBestApplyUrl<T extends Pick<Job, "source" | "atsType">>(a: T, b: T): T {
  return applyUrlDirectness(b) > applyUrlDirectness(a) ? b : a;
}

// ── Fuzzy description similarity (Jaccard over word shingles) ─────────────────

function shingles(text: string | null, size = 2): Set<string> {
  const words = canonical(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < size) {
    for (const w of words) out.add(w);
    return out;
  }
  for (let i = 0; i <= words.length - size; i++) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

/** Jaccard similarity (0..1) of two descriptions; used to confirm near-duplicates. */
export function descriptionSimilarity(a: string | null, b: string | null): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const s of sa) if (sb.has(s)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// ── Merge ────────────────────────────────────────────────────────────────────

/** Combine two same-role rows: most direct apply_url, richer description, fuller questions. */
export function mergeJobs(a: Job, b: Job): Job {
  const best = pickBestApplyUrl(a, b);
  const other = best === a ? b : a;
  const descriptionMd =
    (a.descriptionMd?.length ?? 0) >= (b.descriptionMd?.length ?? 0)
      ? a.descriptionMd
      : b.descriptionMd;
  const formQuestions =
    best.formQuestions.length >= other.formQuestions.length
      ? best.formQuestions
      : other.formQuestions;
  return {
    ...best,
    descriptionMd,
    formQuestions,
    // Keep any salary/visa signal that either source provided.
    salaryMin: best.salaryMin ?? other.salaryMin,
    salaryMax: best.salaryMax ?? other.salaryMax,
    salaryCurrency: best.salaryCurrency ?? other.salaryCurrency,
    visaSponsorship: best.visaSponsorship ?? other.visaSponsorship,
    postedAt: best.postedAt ?? other.postedAt,
  };
}

/**
 * Collapse a batch of jobs from one or more sources into unique postings. Groups on
 * (company, title, location); within a group, merges into a single best row.
 */
export function dedupeJobs(jobs: Job[]): Job[] {
  const byKey = new Map<string, Job>();
  for (const job of jobs) {
    const key = dedupeKey(job.company, job.title, job.location);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeJobs(existing, job) : job);
  }
  return [...byKey.values()];
}
