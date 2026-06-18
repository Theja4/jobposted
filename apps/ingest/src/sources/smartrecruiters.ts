/**
 * SmartRecruiters public Posting API. No auth for public company postings.
 *   List:   GET https://api.smartrecruiters.com/v1/companies/{identifier}/postings
 *   Detail: GET https://api.smartrecruiters.com/v1/companies/{identifier}/postings/{id}
 */

import type { RawJob } from "@jobposted/shared";
import {
  companyDomainFromHints,
  companyNameFromSlug,
  fetchJson,
  mapLimit,
  type CompanyHints,
} from "../util";

const BASE = "https://api.smartrecruiters.com/v1/companies";
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

interface SmartRecruitersListResponse {
  offset?: number;
  limit?: number;
  totalFound?: number;
  content?: SmartRecruitersPosting[];
}

interface SmartRecruitersPosting {
  id?: string | null;
  uuid?: string | null;
  name?: string | null;
  company?: { identifier?: string | null; name?: string | null } | null;
  releasedDate?: string | null;
  location?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
    fullLocation?: string | null;
    remote?: boolean | null;
    hybrid?: boolean | null;
  } | null;
  ref?: string | null;
  postingUrl?: string | null;
  applyUrl?: string | null;
  active?: boolean | null;
  visibility?: string | null;
  typeOfEmployment?: { label?: string | null } | null;
  jobAd?: {
    sections?: Record<string, { title?: string | null; text?: string | null } | undefined>;
  } | null;
}

function locationText(job: SmartRecruitersPosting) {
  const location = job.location;
  if (!location) return null;
  return (
    location.fullLocation ||
    [location.city, location.region, location.country].filter(Boolean).join(", ")
  ).trim() || null;
}

function remoteSignal(job: SmartRecruitersPosting) {
  if (job.location?.remote) return "remote";
  if (job.location?.hybrid) return "hybrid";
  return locationText(job) || job.typeOfEmployment?.label || null;
}

function descriptionHtml(job: SmartRecruitersPosting) {
  const sections = job.jobAd?.sections;
  if (!sections) return null;
  const ordered = [
    sections.companyDescription,
    sections.jobDescription,
    sections.qualifications,
    sections.additionalInformation,
  ];
  const html = ordered
    .map((section) => {
      if (!section?.text) return "";
      return [section.title ? `<h3>${section.title}</h3>` : "", section.text].join("");
    })
    .filter(Boolean)
    .join("\n\n");
  return html || null;
}

function detailUrl(identifier: string, postingId: string) {
  return `${BASE}/${encodeURIComponent(identifier)}/postings/${encodeURIComponent(postingId)}`;
}

function listUrl(identifier: string, offset: number) {
  return `${BASE}/${encodeURIComponent(identifier)}/postings?limit=${PAGE_LIMIT}&offset=${offset}`;
}

function toRawJob(identifier: string, job: SmartRecruitersPosting, hints: CompanyHints): RawJob {
  const sourceJobId = job.uuid || job.id || job.applyUrl || job.postingUrl || `${identifier}:${job.name}`;
  return {
    source: "smartrecruiters",
    sourceJobId: String(sourceJobId),
    atsType: "smartrecruiters",
    company: hints.companyName?.trim() || job.company?.name || companyNameFromSlug(identifier, hints),
    companyDomain: companyDomainFromHints(hints),
    title: job.name || "Untitled role",
    location: locationText(job),
    remoteRaw: remoteSignal(job),
    descriptionHtml: descriptionHtml(job),
    applyUrl: job.applyUrl || job.postingUrl || job.ref || "",
    formQuestions: [],
    salary: null,
    visaSponsorship: null,
    postedAt: job.releasedDate ?? null,
  };
}

async function fetchPostings(identifier: string) {
  const postings: SmartRecruitersPosting[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetchJson<SmartRecruitersListResponse>(listUrl(identifier, offset));
    const content = response.content ?? [];
    postings.push(...content);
    if (content.length === 0) break;

    offset += response.limit ?? PAGE_LIMIT;
    if (typeof response.totalFound === "number" && offset >= response.totalFound) break;
  }

  return postings;
}

export async function fetchSmartRecruitersCompany(
  identifier: string,
  hints: CompanyHints = {},
): Promise<RawJob[]> {
  const postings = await fetchPostings(identifier);
  const detailed = await mapLimit(postings, 4, async (posting) => {
    if (!posting.id) return posting;
    try {
      return await fetchJson<SmartRecruitersPosting>(detailUrl(identifier, posting.id));
    } catch {
      return posting;
    }
  });

  return detailed
    .filter((posting) => posting.name && posting.active !== false && posting.visibility !== "PRIVATE")
    .map((posting) => toRawJob(identifier, posting, hints))
    .filter((job) => job.applyUrl);
}
