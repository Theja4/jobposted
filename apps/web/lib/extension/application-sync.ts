import type { CompanyAssets, ExtensionApplicationUpsert } from "@jobposted/shared";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// Tracking/analytics query params that never identify a posting. Stripping them
// keeps the same job from being saved twice just because it was opened from a
// different referrer. Anything not on this list (e.g. Greenhouse's `gh_jid`,
// Workday's job tokens) is preserved because it can be part of the job's identity.
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set([
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_hsenc",
  "_hsmi",
  "gh_src",
  "ref",
  "referrer",
  "trk",
  "trackingid",
  "refid",
  "li_fat_id",
]);

/**
 * Canonicalize a job apply URL so the same posting always maps to one identity.
 * The link is the authoritative dedup key for the tracker — company and title are
 * scraped from the page and too noisy to dedup on — so this normalization is what
 * makes "already present" reliable: lowercase scheme/host, drop the hash and
 * tracking params, and collapse a trailing slash.
 */
export function canonicalizeJobUrl(value: unknown) {
  const trimmed = asString(value);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

export type ExistingExtensionApplicationRow = {
  id: string;
  job_id: string | null;
  status: string | null;
  resume_doc_id: string | null;
  cover_letter_doc_id: string | null;
  field_map: unknown;
  screenshot_path: string | null;
  base_version_id: string | null;
  resume_variant_id: string | null;
  tailoring_delta: unknown;
  rendered_pdf_path: string | null;
  submitted_at: string | null;
};

export function buildExtensionApplicationRow(args: {
  userId: string;
  jobId: string | null;
  payload: ExtensionApplicationUpsert;
  jobUrl: string;
  company: string;
  companyAssets?: CompanyAssets;
  role: string;
  activeResumeVersionId: string | null;
  existingApplication: ExistingExtensionApplicationRow | null;
}) {
  const {
    userId,
    jobId,
    payload,
    jobUrl,
    company,
    companyAssets,
    role,
    activeResumeVersionId,
    existingApplication,
  } = args;
  const existingFieldMap = asRecord(existingApplication?.field_map);
  const payloadResumeUsed = asString(payload.resumeUsed) || null;
  const existingResumeUsed = asString(existingFieldMap.resumeUsed) || existingApplication?.rendered_pdf_path || null;
  const resumeUsed = payloadResumeUsed ?? existingResumeUsed;
  const genericResumeUsed =
    typeof payload.genericResumeUsed === "boolean"
      ? payload.genericResumeUsed
      : Boolean(existingFieldMap.genericResumeUsed);

  return {
    user_id: userId,
    job_id: jobId,
    status: existingApplication?.status === "submitted" && payload.status === "filled" ? "submitted" : payload.status,
    apply_path: "extension",
    resume_doc_id: existingApplication?.resume_doc_id ?? null,
    cover_letter_doc_id: existingApplication?.cover_letter_doc_id ?? null,
    field_map: {
      ...existingFieldMap,
      source: "extension",
      platform: payload.platform,
      company,
      companyDomain: companyAssets?.companyDomain ?? existingFieldMap.companyDomain ?? null,
      companyLogoUrl: companyAssets?.companyLogoUrl ?? existingFieldMap.companyLogoUrl ?? null,
      role,
      jobUrl,
      resumeUsed,
      genericResumeUsed,
      fieldsFilled: payload.fieldsFilled,
    },
    screenshot_path: payload.screenshotUrl ?? existingApplication?.screenshot_path ?? null,
    failure_reason: null,
    base_version_id: existingApplication?.base_version_id ?? activeResumeVersionId,
    resume_variant_id: existingApplication?.resume_variant_id ?? null,
    tailoring_delta: payload.genericResumeUsed ? { genericResumeUsed: true } : existingApplication?.tailoring_delta ?? null,
    rendered_pdf_path: payloadResumeUsed ?? existingApplication?.rendered_pdf_path ?? null,
    submitted_at: payload.status === "submitted" ? payload.appliedAt : existingApplication?.submitted_at ?? null,
  };
}
