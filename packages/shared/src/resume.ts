/**
 * JobPosted's own resume model + tailoring contract. This is a deliberately
 * leaner shape than Rezoomed's full builder schema — enough to render an
 * ATS-clean resume and to tailor it per job, owned entirely by JobPosted.
 */

export interface ResumeLink {
  label: string;
  url: string;
}

export interface ResumeExperience {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
}

export interface ResumeContent {
  name: string;
  headline: string;
  summary: string;
  email: string;
  phone: string;
  location: string;
  links: ResumeLink[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  skills: string[];
}

export type TailorMatchTier = "STRONG_FIT" | "MODERATE_FIT" | "STRETCH" | "LONG_SHOT";

export interface TailorBulletRewrite {
  /** Company the bullet belongs to, used to disambiguate identical bullets. */
  company: string;
  /** Exact original bullet text so the apply step can match it. */
  original: string;
  tailored: string;
}

/** The structured tailoring plan an LLM returns; applied back onto ResumeContent. */
export interface TailorAnalysis {
  matchScore: number;
  matchTier: TailorMatchTier;
  tailoredHeadline: string;
  tailoredSummary: string;
  /** Existing skills, reordered to front-load JD relevance. */
  skillsOrder: string[];
  /** Skills to add — must already be evidenced in the resume. */
  skillsAdd: string[];
  bulletRewrites: TailorBulletRewrite[];
  /** JD requirements the resume does not support; surfaced, never faked. */
  missingKeywords: string[];
  honestAssessment: string;
}

export interface TailorResult {
  analysis: TailorAnalysis;
  resume: ResumeContent;
  changed: boolean;
}

export function emptyResumeContent(): ResumeContent {
  return {
    name: "",
    headline: "",
    summary: "",
    email: "",
    phone: "",
    location: "",
    links: [],
    experience: [],
    education: [],
    skills: [],
  };
}

/**
 * Canonical text used to embed a resume for vector recall. Shared by the web app (upload-time
 * embedding) and the ingest backfill so a resume always hashes to the same vector space.
 */
export function resumeEmbeddingText(resume: Partial<ResumeContent> | Record<string, unknown>): string {
  const r = resume as Record<string, unknown>;
  const text = [
    r.headline,
    r.summary,
    Array.isArray(r.skills) ? r.skills.join(", ") : "",
    Array.isArray(r.experience)
      ? r.experience
          .map((item) => {
            const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            return [row.title, row.company, Array.isArray(row.bullets) ? row.bullets.join(" ") : ""]
              .filter(Boolean)
              .join(" ");
          })
          .join("\n")
      : "",
    Array.isArray(r.education)
      ? r.education
          .map((item) => {
            const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            return [row.degree, row.field, row.school].filter(Boolean).join(" ");
          })
          .join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return text.replace(/\s+/g, " ").trim().slice(0, 8000);
}
