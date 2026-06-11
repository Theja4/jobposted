/** Site-wide constants and metadata. Domain is undecided — driven by NEXT_PUBLIC_SITE_URL. */

export const SITE_NAME = "JobPosted";

export const SITE_TAGLINE =
  "Queue tailored applications for roles worth your time.";

export const SITE_DESCRIPTION =
  "JobPosted finds jobs that match you, tailors your resume to each role with Rezoomed, fills the application, and waits for your confirmation before anything is submitted.";

/** Normalized origin (no trailing slash). Falls back to localhost for local dev. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (raw && raw.replace(/\/+$/, "")) || "http://localhost:3000";
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
