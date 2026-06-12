/** Site-wide constants and metadata. Domain is undecided — driven by NEXT_PUBLIC_SITE_URL. */

export const SITE_NAME = "JobPosted";

export const SITE_TAGLINE =
  "Tailored job applications, sent for you automatically.";

export const SITE_DESCRIPTION =
  "JobPosted finds jobs that match you, tailors your resume to each role with Rezoomed, and submits the application automatically. Log in daily to acknowledge what was sent and keep tomorrow's applications running.";

/** Normalized origin (no trailing slash). Falls back to localhost for local dev. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (raw && raw.replace(/\/+$/, "")) || "http://localhost:3000";
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
