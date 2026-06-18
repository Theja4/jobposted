/**
 * Ashby public Job Posting API. No auth.
 *   GET https://api.ashbyhq.com/posting-api/job-board/{organization}
 *
 * The response shape is intentionally normalized defensively because Ashby boards vary in how much
 * location/compensation metadata they expose.
 */

import { createHash } from "node:crypto";
import type { RawJob, SalaryRange } from "@jobposted/shared";
import {
  companyDomainFromHints,
  companyNameFromSlug,
  fetchJson,
  type CompanyHints,
} from "../util";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

type AshbyLocation = {
  name?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isRemote?: boolean | null;
};

type AshbyCompensationComponent = {
  compensationType?: string | null;
  interval?: string | null;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
};

type AshbyJob = {
  id?: string | null;
  title?: string | null;
  department?: string | null;
  team?: string | null;
  location?: AshbyLocation | string | null;
  secondaryLocations?: Array<AshbyLocation | string> | null;
  employmentType?: string | null;
  workplaceType?: string | null;
  isRemote?: boolean | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  applyUrl?: string | null;
  jobUrl?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  isListed?: boolean | null;
  compensation?: {
    compensationTierSummary?: string | null;
    summaryComponents?: AshbyCompensationComponent[] | null;
  } | null;
};

type AshbyBoardResponse = {
  jobs?: AshbyJob[];
};

function stableId(org: string, job: AshbyJob) {
  const raw = job.id || job.applyUrl || job.jobUrl || `${org}:${job.title ?? ""}:${locationText(job)}`;
  return createHash("sha256").update(raw.toLowerCase()).digest("hex").slice(0, 32);
}

function locationPart(location: AshbyLocation | string | null | undefined) {
  if (!location) return "";
  if (typeof location === "string") return location.trim();
  return (
    location.name ||
    [location.city, location.region, location.country].filter(Boolean).join(", ")
  ).trim();
}

function locationText(job: AshbyJob) {
  const locations = [
    locationPart(job.location),
    ...(job.secondaryLocations ?? []).map((location) => locationPart(location)),
  ].filter(Boolean);
  return Array.from(new Set(locations)).join(" / ") || null;
}

function remoteSignal(job: AshbyJob) {
  const primaryRemote =
    typeof job.location === "object" && job.location !== null ? Boolean(job.location.isRemote) : false;
  const secondaryRemote = (job.secondaryLocations ?? []).some(
    (location) => typeof location === "object" && location !== null && Boolean(location.isRemote),
  );
  if (job.isRemote || primaryRemote || secondaryRemote) return "remote";
  return job.workplaceType || locationText(job);
}

function salary(job: AshbyJob): SalaryRange | null {
  const salaryComponent = job.compensation?.summaryComponents?.find((component) =>
    /salary|base/i.test(component.compensationType ?? ""),
  );
  if (!salaryComponent) return null;
  return {
    min: typeof salaryComponent.minValue === "number" ? salaryComponent.minValue : null,
    max: typeof salaryComponent.maxValue === "number" ? salaryComponent.maxValue : null,
    currency: salaryComponent.currencyCode ?? null,
  };
}

function toRawJob(org: string, job: AshbyJob, hints: CompanyHints = {}): RawJob {
  const applyUrl = job.applyUrl || job.jobUrl || "";
  return {
    source: "ashby",
    sourceJobId: stableId(org, job),
    atsType: "ashby",
    company: companyNameFromSlug(org, hints),
    companyDomain: companyDomainFromHints(hints),
    title: job.title ?? "Untitled role",
    location: locationText(job),
    remoteRaw: remoteSignal(job),
    descriptionHtml: job.descriptionHtml ?? job.descriptionPlain ?? null,
    applyUrl,
    formQuestions: [],
    salary: salary(job),
    visaSponsorship: null,
    postedAt: job.publishedAt ?? job.updatedAt ?? null,
  };
}

/** Fetch all listed public postings for an Ashby organization slug. */
export async function fetchAshbyBoard(
  organization: string,
  hints: CompanyHints = {},
): Promise<RawJob[]> {
  const response = await fetchJson<AshbyBoardResponse>(
    `${BASE}/${encodeURIComponent(organization)}`,
  );
  return (response.jobs ?? [])
    .filter((job) => job.title && job.isListed !== false && (job.applyUrl || job.jobUrl))
    .map((job) => toRawJob(organization, job, hints));
}
