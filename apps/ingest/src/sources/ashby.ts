/**
 * Ashby public Job Board API (design doc §9.1 — "Ashby … public feeds next"). No auth.
 *   GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
 *
 * Each job includes title, location, workplaceType/isRemote, descriptionHtml, and an applyUrl
 * that points straight at the application form (which the apply worker already handles). Many
 * AI companies live here (OpenAI, ElevenLabs, Cohere, Perplexity, Ramp, Vanta, Linear…).
 */

import type { RawJob, SalaryRange } from "@jobposted/shared";
import { fetchJson, humanizeSlug } from "../util.js";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

interface AshbyComp {
  compensationTierSummary?: string | null;
  summaryComponents?: { compensationType?: string; minValue?: number; maxValue?: number; currencyCode?: string }[];
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string | null;
  workplaceType?: string | null; // "Remote" | "Hybrid" | "Onsite"
  isRemote?: boolean;
  isListed?: boolean;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  publishedAt?: string | null;
  compensation?: AshbyComp | null;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

/** Best-effort salary from Ashby's compensation block (skips when not a simple numeric range). */
function toSalary(comp: AshbyComp | null | undefined): SalaryRange | null {
  const salaryComp = comp?.summaryComponents?.find(
    (c) => typeof c.minValue === "number" || typeof c.maxValue === "number",
  );
  if (!salaryComp) return null;
  return {
    min: typeof salaryComp.minValue === "number" ? salaryComp.minValue : null,
    max: typeof salaryComp.maxValue === "number" ? salaryComp.maxValue : null,
    currency: salaryComp.currencyCode ?? null,
  };
}

function toRawJob(org: string, job: AshbyJob): RawJob {
  return {
    source: "ashby",
    sourceJobId: job.id,
    atsType: "ashby",
    company: humanizeSlug(org),
    title: job.title,
    location: job.location ?? null,
    remoteRaw: job.workplaceType ?? (job.isRemote ? "remote" : null),
    descriptionHtml: job.descriptionHtml ?? job.descriptionPlain ?? null,
    applyUrl: job.applyUrl ?? job.jobUrl ?? `https://jobs.ashbyhq.com/${org}/${job.id}`,
    formQuestions: [],
    salary: toSalary(job.compensation),
    visaSponsorship: null,
    postedAt: job.publishedAt ?? null,
  };
}

/** Fetch all listed postings for an Ashby job-board org (the slug in jobs.ashbyhq.com/<org>). */
export async function fetchAshbyBoard(org: string): Promise<RawJob[]> {
  const res = await fetchJson<AshbyResponse>(
    `${BASE}/${encodeURIComponent(org)}?includeCompensation=true`,
  );
  return (res.jobs ?? [])
    .filter((j) => j.id && j.title && j.isListed !== false)
    .map((j) => toRawJob(org, j));
}
