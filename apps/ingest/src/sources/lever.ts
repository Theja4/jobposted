/**
 * Lever public Postings API (design doc §9.3). No auth.
 *   GET https://api.lever.co/v0/postings/{company}?mode=json
 *
 * Each posting includes applyUrl, workplaceType, categories.location, description(Plain),
 * and an optional salaryRange. Custom application questions are not exposed by the public
 * postings API — the apply worker captures those at fill time, so formQuestions starts empty.
 */

import type { RawJob, SalaryRange } from "@jobposted/shared";
import { fetchJson, humanizeSlug } from "../util.js";

const BASE = "https://api.lever.co/v0/postings";

interface LeverPosting {
  id: string;
  text: string; // title
  hostedUrl?: string;
  applyUrl?: string;
  categories?: { location?: string; team?: string; commitment?: string };
  description?: string; // HTML
  descriptionPlain?: string;
  createdAt?: number; // ms epoch
  workplaceType?: string; // remote | on-site | hybrid
  salaryRange?: { min?: number; max?: number; currency?: string };
}

function toSalary(range: LeverPosting["salaryRange"]): SalaryRange | null {
  if (!range) return null;
  return {
    min: typeof range.min === "number" ? range.min : null,
    max: typeof range.max === "number" ? range.max : null,
    currency: range.currency ?? null,
  };
}

function toRawJob(company: string, p: LeverPosting): RawJob {
  return {
    source: "lever",
    sourceJobId: p.id,
    atsType: "lever",
    company: humanizeSlug(company),
    title: p.text,
    location: p.categories?.location ?? null,
    remoteRaw: p.workplaceType ?? p.categories?.location ?? null,
    descriptionHtml: p.description ?? p.descriptionPlain ?? null,
    applyUrl: p.applyUrl ?? p.hostedUrl ?? "",
    formQuestions: [],
    salary: toSalary(p.salaryRange),
    visaSponsorship: null,
    postedAt: typeof p.createdAt === "number" ? new Date(p.createdAt).toISOString() : null,
  };
}

/** Fetch all public postings for a Lever company slug. */
export async function fetchLeverCompany(company: string): Promise<RawJob[]> {
  const postings = await fetchJson<LeverPosting[]>(
    `${BASE}/${encodeURIComponent(company)}?mode=json`,
  );
  return (postings ?? []).filter((p) => p.id && p.text).map((p) => toRawJob(company, p));
}
