// Portal-independent job identity resolution.
//
// Company career pages have endless per-site quirks (Airbnb's tabbed apply,
// Databricks proxying Greenhouse off its own domain, bespoke one-off portals),
// so we never try to recognize the portal to read the org/role. Instead we run a
// confidence-scored cascade of *portal-independent* signals and take the best:
//
//   1. JSON-LD `JobPosting`   — SEO/Google-for-Jobs metadata, present on most
//                               career pages regardless of ATS.            (0.95)
//   2. Open Graph / meta tags — og:title / og:site_name.                   (0.70)
//   3. Platform DOM hints     — e.g. Workday's jobPostingHeader/company.   (0.85)
//   4. Heading / <title>      — <h1> and document.title heuristics.        (0.45)
//   5. URL-derived company    — tenant/board slug from the host/path.      (0.50)
//
// When the best result is below `JOB_CONTEXT_CONFIDENCE_THRESHOLD`, the caller
// asks the user to confirm rather than writing a wrong tracker entry — so a new,
// unseen quirk degrades to a one-field correction instead of bad data.

export type JobContextSource =
  | "json-ld"
  | "open-graph"
  | "platform-dom"
  | "heading"
  | "url"
  | "none";

export interface ResolvedJobContext {
  company: string;
  role: string;
  location: string;
  /** 0..1 — the lower of the chosen role/company field confidences. */
  confidence: number;
  /** Where the role (the primary identity signal) came from. */
  source: JobContextSource;
}

export interface JobContextHints {
  /** Company already extracted by a platform adapter (e.g. Workday). */
  company?: string | null;
  /** Role already extracted by a platform adapter. */
  role?: string | null;
}

export const JOB_CONTEXT_CONFIDENCE_THRESHOLD = 0.7;

const SOURCE_CONFIDENCE: Record<Exclude<JobContextSource, "none">, number> = {
  "json-ld": 0.95,
  "platform-dom": 0.85,
  "open-graph": 0.7,
  url: 0.5,
  heading: 0.45,
};

type Candidate = { value: string; source: JobContextSource };

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function firstString(value: unknown): string {
  if (typeof value === "string") return clean(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
    return "";
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return clean(record.name) || clean(record.legalName) || clean(record.value) || clean(record.title);
  }
  return "";
}

// ── JSON-LD ────────────────────────────────────────────────────────────────

function pushNodes(value: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const entry of value) pushNodes(entry, out);
    return;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    out.push(record);
    if (Array.isArray(record["@graph"])) pushNodes(record["@graph"], out);
  }
}

function isJobPosting(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => /jobposting/i.test(String(entry ?? "")));
}

function jsonLdLocation(node: Record<string, unknown>): string {
  const location = node.jobLocation;
  const first = Array.isArray(location) ? location[0] : location;
  if (!first || typeof first !== "object") return clean(typeof location === "string" ? location : "");
  const address = (first as Record<string, unknown>).address;
  const addr = (Array.isArray(address) ? address[0] : address) as Record<string, unknown> | undefined;
  if (!addr || typeof addr !== "object") return firstString(address);
  const city = clean(addr.addressLocality);
  const region = clean(addr.addressRegion);
  const country = clean(addr.addressCountry);
  return [city, region || country].filter(Boolean).join(", ");
}

export function parseJobPostingJsonLd(doc: Document): Partial<ResolvedJobContext> | null {
  const nodes: Record<string, unknown>[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    const text = script.textContent?.trim();
    if (!text) return;
    try {
      pushNodes(JSON.parse(text), nodes);
    } catch {
      // Tolerant: some sites emit malformed or concatenated JSON-LD. Skip it.
    }
  });
  const posting = nodes.find(isJobPosting);
  if (!posting) return null;
  const role = firstString(posting.title);
  const company = firstString(posting.hiringOrganization);
  const location = jsonLdLocation(posting);
  if (!role && !company) return null;
  return { role, company, location };
}

// ── Open Graph / meta ────────────────────────────────────────────────────────

function metaContent(doc: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const value = clean(doc.querySelector(selector)?.getAttribute("content"));
    if (value) return value;
  }
  return "";
}

const TITLE_SPLIT = /\s+(?:[-–—|·•]|at|@)\s+/i;

/** "Senior Engineer at Acme" / "Senior Engineer | Acme" → { role, company }. */
export function splitRoleAndCompany(title: string): { role: string; company: string } {
  const cleaned = clean(title);
  const parts = cleaned.split(TITLE_SPLIT).map(clean).filter(Boolean);
  if (parts.length < 2) return { role: cleaned, company: "" };
  // The longest segment is almost always the role; the trailing segment the company.
  const company = parts[parts.length - 1];
  const role = parts.slice(0, -1).join(" - ");
  return { role, company };
}

export function parseOpenGraph(doc: Document): Partial<ResolvedJobContext> | null {
  const ogTitle = metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']);
  const siteName = metaContent(doc, [
    'meta[property="og:site_name"]',
    'meta[name="application-name"]',
    'meta[name="author"]',
  ]);
  if (!ogTitle && !siteName) return null;
  const split = splitRoleAndCompany(ogTitle);
  // Only trust an explicit og:site_name for the company. Deriving it from the
  // title split is unreliable — titles like "Program Manager, Professional
  // Services - East" would yield "East" (a region qualifier) as the company and
  // wrongly outrank a known ATS board slug. The title-split company still
  // survives at low confidence via parseHeading for sites with no better signal.
  return {
    role: split.role,
    company: siteName,
    location: "",
  };
}

// ── Heading / <title> ────────────────────────────────────────────────────────

function parseHeading(doc: Document): Partial<ResolvedJobContext> | null {
  const h1 = clean(doc.querySelector("h1")?.textContent);
  const titleSplit = splitRoleAndCompany(clean(doc.title));
  const role = h1 || titleSplit.role;
  if (!role) return null;
  return { role, company: titleSplit.company, location: "" };
}

// ── URL-derived company ──────────────────────────────────────────────────────

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => (/^[a-z]/.test(part) ? part.slice(0, 1).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** Best-effort company from the host (tenant/board slug) or first path segment. */
export function companyFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  const host = parsed.hostname.toLowerCase();
  // Workday: {tenant}.wd5.myworkdayjobs.com → tenant
  const workday = host.match(/^([a-z0-9-]+)\.(?:wd\d+\.)?(?:myworkdayjobs|workdayjobs)\.com$/i);
  if (workday) return titleCaseSlug(workday[1]);
  // Greenhouse / Lever / Ashby hosted boards carry the slug in the first path part.
  if (/(?:greenhouse\.io|lever\.co|ashbyhq\.com)$/i.test(host)) {
    const slug = parsed.pathname.split("/").filter(Boolean)[0];
    if (slug && slug !== "embed") return titleCaseSlug(slug);
  }
  return "";
}

// ── Cascade ──────────────────────────────────────────────────────────────────

function pick(candidates: Candidate[]): Candidate | null {
  for (const candidate of candidates) {
    if (candidate.value) return candidate;
  }
  return null;
}

export function resolveJobContext(args: {
  doc: Document;
  url: string;
  hints?: JobContextHints;
}): ResolvedJobContext {
  const { doc, url, hints } = args;
  const jsonLd = parseJobPostingJsonLd(doc);
  const og = parseOpenGraph(doc);
  const heading = parseHeading(doc);
  const urlCompany = companyFromUrl(url);

  // Highest-confidence non-empty value wins per field, independently — so the
  // role can come from JSON-LD while the company falls back to the URL slug.
  const roleCandidates: Candidate[] = [
    { value: clean(jsonLd?.role), source: "json-ld" },
    { value: clean(hints?.role), source: "platform-dom" },
    { value: clean(og?.role), source: "open-graph" },
    { value: clean(heading?.role), source: "heading" },
  ];
  const companyCandidates: Candidate[] = [
    { value: clean(jsonLd?.company), source: "json-ld" },
    { value: clean(hints?.company), source: "platform-dom" },
    { value: clean(og?.company), source: "open-graph" },
    { value: urlCompany, source: "url" },
    { value: clean(heading?.company), source: "heading" },
  ];
  const locationCandidates: Candidate[] = [
    { value: clean(jsonLd?.location), source: "json-ld" },
    { value: clean(og?.location), source: "open-graph" },
  ];

  const role = pick(roleCandidates);
  const company = pick(companyCandidates);
  const location = pick(locationCandidates);

  const roleConfidence = role ? SOURCE_CONFIDENCE[role.source as Exclude<JobContextSource, "none">] : 0;
  const companyConfidence = company
    ? SOURCE_CONFIDENCE[company.source as Exclude<JobContextSource, "none">]
    : 0;

  return {
    role: role?.value || "",
    company: company?.value || "",
    location: location?.value || "",
    confidence: Math.min(roleConfidence, companyConfidence),
    source: role?.source ?? "none",
  };
}
