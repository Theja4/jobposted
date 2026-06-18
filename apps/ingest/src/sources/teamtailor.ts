/**
 * Teamtailor public JSON feed. No auth for career-site jobs.
 *   GET https://{company}.teamtailor.com/jobs.json
 */

import type { RawJob } from "@jobposted/shared";
import {
  companyDomainFromHints,
  companyNameFromSlug,
  fetchJson,
  type CompanyHints,
} from "../util";

interface TeamtailorFeed {
  title?: string | null;
  home_page_url?: string | null;
  items?: TeamtailorItem[];
}

interface TeamtailorItem {
  id?: string | null;
  title?: string | null;
  url?: string | null;
  date_published?: string | null;
  content_html?: string | null;
  _jobposting?: {
    title?: string | null;
    description?: string | null;
    datePosted?: string | null;
    employmentType?: string | string[] | null;
    hiringOrganization?: {
      name?: string | null;
      sameAs?: string | null;
    } | null;
    jobLocation?: unknown;
    jobLocationType?: string | null;
    applicantLocationRequirements?: unknown;
    identifier?: { value?: string | number | null } | string | number | null;
  } | null;
}

function textFromLocation(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(textFromLocation);
  if (typeof value === "string") return [value];
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const address = typeof record.address === "object" && record.address ? record.address as Record<string, unknown> : record;
  const country = address.addressCountry;
  const countryText =
    typeof country === "string"
      ? country
      : typeof country === "object" && country
        ? String((country as Record<string, unknown>).name ?? "")
        : "";
  const parts = [address.addressLocality, address.addressRegion, countryText]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? [parts.join(", ")] : [];
}

function locationText(item: TeamtailorItem) {
  const locations = textFromLocation(item._jobposting?.jobLocation);
  return locations.length > 0 ? Array.from(new Set(locations)).join(" / ") : null;
}

function remoteSignal(item: TeamtailorItem) {
  const posting = item._jobposting;
  const employmentType = Array.isArray(posting?.employmentType)
    ? posting?.employmentType.join(" ")
    : posting?.employmentType;
  return [posting?.jobLocationType, employmentType, locationText(item)].filter(Boolean).join(" ") || null;
}

function sourceJobId(company: string, item: TeamtailorItem) {
  const identifier = item._jobposting?.identifier;
  if (typeof identifier === "string" || typeof identifier === "number") return String(identifier);
  if (typeof identifier === "object" && identifier?.value) return String(identifier.value);
  return item.id || item.url || `${company}:${item.title}`;
}

function toRawJob(company: string, feed: TeamtailorFeed, item: TeamtailorItem, hints: CompanyHints): RawJob {
  const posting = item._jobposting;
  return {
    source: "teamtailor",
    sourceJobId: sourceJobId(company, item),
    atsType: "teamtailor",
    company:
      hints.companyName?.trim() ||
      posting?.hiringOrganization?.name ||
      feed.title ||
      companyNameFromSlug(company, hints),
    companyDomain: companyDomainFromHints(hints),
    title: item.title || posting?.title || "Untitled role",
    location: locationText(item),
    remoteRaw: remoteSignal(item),
    descriptionHtml: item.content_html || posting?.description || null,
    applyUrl: item.url || "",
    formQuestions: [],
    salary: null,
    visaSponsorship: null,
    postedAt: item.date_published || posting?.datePosted || null,
  };
}

export async function fetchTeamtailorCompany(
  company: string,
  hints: CompanyHints = {},
): Promise<RawJob[]> {
  const feed = await fetchJson<TeamtailorFeed>(
    `https://${encodeURIComponent(company)}.teamtailor.com/jobs.json`,
  );
  return (feed.items ?? [])
    .filter((item) => item.title || item._jobposting?.title)
    .map((item) => toRawJob(company, feed, item, hints))
    .filter((job) => job.applyUrl);
}
