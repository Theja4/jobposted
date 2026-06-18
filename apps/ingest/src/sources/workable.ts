/**
 * Workable public career-page endpoint. No auth for public account postings.
 *   GET https://www.workable.com/api/accounts/{account}?details=true
 */

import type { RawJob } from "@jobposted/shared";
import {
  companyDomainFromHints,
  companyNameFromSlug,
  fetchJson,
  type CompanyHints,
} from "../util";

const BASE = "https://www.workable.com/api/accounts";

interface WorkableAccountResponse {
  name?: string | null;
  jobs?: WorkableJob[];
}

interface WorkableLocation {
  country?: string | null;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  hidden?: boolean | null;
}

interface WorkableJob {
  title?: string | null;
  shortcode?: string | null;
  code?: string | null;
  employment_type?: string | null;
  telecommuting?: boolean | null;
  department?: string | null;
  url?: string | null;
  shortlink?: string | null;
  application_url?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  locations?: WorkableLocation[] | null;
  description?: string | null;
}

function locationPart(location: WorkableLocation) {
  if (location.hidden) return "";
  return [location.city, location.region, location.country].filter(Boolean).join(", ").trim();
}

function locationText(job: WorkableJob) {
  const locations = (job.locations ?? []).map(locationPart).filter(Boolean);
  if (locations.length > 0) return Array.from(new Set(locations)).join(" / ");
  return [job.city, job.state, job.country].filter(Boolean).join(", ").trim() || null;
}

function toRawJob(account: string, accountName: string | null, job: WorkableJob, hints: CompanyHints): RawJob {
  const sourceJobId =
    job.shortcode || job.code || job.application_url || job.shortlink || job.url || `${account}:${job.title}`;
  return {
    source: "workable",
    sourceJobId: String(sourceJobId),
    atsType: "workable",
    company: hints.companyName?.trim() || accountName || companyNameFromSlug(account, hints),
    companyDomain: companyDomainFromHints(hints),
    title: job.title || "Untitled role",
    location: locationText(job),
    remoteRaw: job.telecommuting ? "remote" : job.employment_type ?? null,
    descriptionHtml: job.description ?? null,
    applyUrl: job.application_url || job.url || job.shortlink || "",
    formQuestions: [],
    salary: null,
    visaSponsorship: null,
    postedAt: job.published_on || job.created_at || null,
  };
}

export async function fetchWorkableAccount(
  account: string,
  hints: CompanyHints = {},
): Promise<RawJob[]> {
  const response = await fetchJson<WorkableAccountResponse>(
    `${BASE}/${encodeURIComponent(account)}?details=true`,
  );
  return (response.jobs ?? [])
    .filter((job) => job.title)
    .map((job) => toRawJob(account, response.name ?? null, job, hints))
    .filter((job) => job.applyUrl);
}
