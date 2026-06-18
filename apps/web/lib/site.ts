/** Site-wide constants and metadata. Domain is undecided — driven by NEXT_PUBLIC_SITE_URL. */

export const SITE_NAME = "JobPosted";

export const SITE_TAGLINE =
  "Tailored job applications, queued for you.";

export const SITE_DESCRIPTION =
  "JobPosted finds jobs that match you, tailors your resume to each role with Rezoomed, and queues prepared applications for you.";

export const SUPPORT_EMAIL = "hello@jobposted.app";

export const REZOOMED_URL =
  process.env.NEXT_PUBLIC_REZOOMED_URL?.trim().replace(/\/+$/, "") || "https://rezoomed.com";

export const REZOOMED_ACCOUNT_URL =
  process.env.NEXT_PUBLIC_REZOOMED_ACCOUNT_URL?.trim() || `${REZOOMED_URL}/dashboard/account`;

/** Normalized origin (no trailing slash). Falls back to localhost for local dev. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (raw && raw.replace(/\/+$/, "")) || "http://localhost:3000";
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
