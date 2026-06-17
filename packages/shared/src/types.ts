/**
 * Cross-app domain types for JobPosted.
 *
 * These mirror the Supabase schema in `@jobposted/db` (design doc §8 and §11.8) and the
 * field-matching contract (§11.2). Keep them in sync with the SQL migrations — this module
 * is the single source of truth shared by apps/web, apps/ingest, and (later) the worker and
 * extension.
 */

// ── Enumerations ──────────────────────────────────────────────────────────────

/** The applicant-tracking system a job/apply form lives on. */
export type AtsType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "workday"
  | "linkedin"
  | "icims"
  | "taleo"
  | "oracle"
  | "successfactors"
  | "jobvite"
  | "bamboohr"
  | "dover"
  | "indeed"
  | "rippling"
  | "paylocity"
  | "other";

/** Where a job row was ingested from. A single role can appear across several sources. */
export type JobSource =
  | "lever"
  | "greenhouse"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "workday"
  | "linkedin"
  | "icims"
  | "extension"
  | "adzuna"
  | "jsearch"
  | "apify"
  | "manual";

/** Normalized remote/work arrangement (design doc §9.4). */
export type RemoteType = "remote" | "hybrid" | "on-site" | "unknown";

/** Work-authorization status captured on the profile (design doc §8, §10.2). */
export type WorkAuthorization =
  | "citizen"
  | "OPT"
  | "STEM-OPT"
  | "H1B"
  | "needs_sponsorship"
  | "india_citizen";

/**
 * Application lifecycle (design doc §8). The first run covers queued → submitted; the CRM
 * outcome statuses (`rejected`, `interview`) and the extended set in §23.3 (viewed, replied,
 * offer) are tracked once the apply engine and applications page land.
 */
export type ApplicationStatus =
  | "saved"
  | "queued"
  | "tailoring"
  | "filled"
  | "ready_for_review"
  | "submitting"
  | "applied"
  | "submitted"
  | "viewed"
  | "failed"
  | "rejected"
  | "interview"
  | "offer";

/** Which path submitted the application (design doc §2, §8). */
export type ApplyPath = "server" | "extension" | "manual" | "job_board";

/** Paid plans — no free tier (design doc §12). */
export type Plan = "starter_20" | "pro_50";

/** Subscription lifecycle (design doc §8, §12). */
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/** Referral message tone (design doc §10.7). */
export type ReferralType = "cold" | "warm";

// ── Ingestion: form questions & raw jobs ─────────────────────────────────────

/** Supported input control for an ATS application question. */
export type FormQuestionType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "file"
  | "boolean"
  | "url"
  | "email"
  | "phone";

/**
 * A single application question captured from the ATS before the worker opens the page
 * (design doc §9.2/§9.3 — stored on the job as `form_questions`).
 */
export interface FormQuestion {
  /** Stable id from the source ATS where available, else a derived slug. */
  id: string;
  label: string;
  type: FormQuestionType;
  required: boolean;
  /** Options for select/radio/multiselect controls. */
  options?: string[];
}

/** A pay range parsed from a source feed (design doc §9.4 normalization). */
export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: string | null;
}

/**
 * The raw, source-shaped result of a fetcher *before* normalization. Fetchers return these;
 * `normalizeJob` maps them into `Job`. Kept deliberately permissive: HTML descriptions,
 * un-split locations, etc.
 */
export interface RawJob {
  source: JobSource;
  sourceJobId: string;
  atsType: AtsType;
  company: string;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  companyLogoResolvedAt?: string | null;
  title: string;
  /** Free-text location as the source gave it (e.g. "San Francisco, CA / Remote"). */
  location: string | null;
  /** Raw remote signal from the source, if any (mapped to RemoteType during normalize). */
  remoteRaw?: string | null;
  /** Job description as HTML or plain text; normalized to markdown. */
  descriptionHtml: string | null;
  applyUrl: string;
  formQuestions: FormQuestion[];
  salary?: SalaryRange | null;
  visaSponsorship?: boolean | null;
  postedAt?: string | null; // ISO 8601
}

// ── Normalized job (matches jobposted.jobs) ──────────────────────────────────

export interface Job {
  id?: string;
  source: JobSource;
  sourceJobId: string;
  atsType: AtsType;
  company: string;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  companyLogoResolvedAt?: string | null;
  title: string;
  location: string | null;
  remote: RemoteType;
  /** Description converted to markdown (design doc §9.4). */
  descriptionMd: string | null;
  applyUrl: string;
  formQuestions: FormQuestion[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  visaSponsorship: boolean | null;
  postedAt: string | null;
  ingestedAt?: string;
  /** 1536-dim match embedding; null until embedded (design doc §9.4). */
  embedding?: number[] | null;
}

// ── Profile (matches jobposted.profiles) ─────────────────────────────────────

export interface Profile {
  id: string; // = auth.users.id
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  workAuthorization: WorkAuthorization | null;
  needsSponsorship: boolean | null;
  relocationOk: boolean | null;
  relocationNotes: string | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  salaryCurrency: string | null;
  currentSalaryMin: number | null;
  currentSalaryMax: number | null;
  currentSalaryCurrency: string | null;
  noticePeriodDays: number | null;
  createdAt?: string;
}

// ── Field-matching contract (design doc §11.2) ───────────────────────────────

export interface FieldMapEntry {
  selector: string;
  value: string;
  type: FormQuestionType;
}

export interface OpenEndedAnswer {
  questionId: string;
  text: string;
}

/** What the field-matching service returns: data, never code (design doc §11.1, §13.2). */
export interface FieldMap {
  fields: FieldMapEntry[];
  openEndedAnswers: OpenEndedAnswer[];
}

// ── Application (matches jobposted.applications) ─────────────────────────────

export interface Application {
  id?: string;
  userId: string;
  jobId: string;
  status: ApplicationStatus;
  applyPath: ApplyPath;
  resumeDocId: string | null;
  coverLetterDocId: string | null;
  fieldMap: FieldMap | null;
  screenshotPath: string | null;
  failureReason: string | null;
  // §11.8 resume-at-scale columns
  baseVersionId: string | null;
  resumeVariantId: string | null;
  tailoringDelta: Record<string, unknown> | null;
  renderedPdfPath: string | null;
  // §10.7 persisted referral messages
  referralCold: string | null;
  referralWarm: string | null;
  referralGeneratedAt: string | null;
  submittedAt: string | null;
  createdAt?: string;
}

// ── Subscription (matches jobposted.subscriptions) ───────────────────────────

export interface Subscription {
  userId: string;
  provider: string | null; // 'polar' | 'razorpay'
  plan: Plan | null;
  dailyLimit: number | null; // 20 for starter_20, 50 for pro_50
  status: SubscriptionStatus | null;
  trialApplicationsUsed: number; // counts toward the 5-application trial
  renewsAt: string | null;
}

// ── Resume-at-scale (design doc §11.8) ───────────────────────────────────────

export interface ResumeBaseVersion {
  id?: string;
  userId: string;
  /** Structured resume JSON — the immutable source of truth. */
  content: Record<string, unknown>;
  createdAt?: string;
}

export interface ResumeVariant {
  id?: string;
  userId: string;
  baseVersionId: string;
  label: string; // e.g. "Backend / Go"
  jdCentroid?: number[] | null; // the JD cluster this variant serves
  /** Delta vs base: summary, skills order, keywords, selected bullets. */
  tailoring: Record<string, unknown>;
  jobsCount: number;
  createdAt?: string;
}

// ── Waitlist (matches jobposted.waitlist) ────────────────────────────────────

export interface WaitlistEntry {
  id?: string;
  email: string;
  createdAt?: string;
}

// ── Plan catalogue (single source for pricing copy + daily limits) ───────────

export interface PlanInfo {
  id: Plan;
  name: string;
  priceUsd: number;
  /** Upper bound, gated by relevant roles in the pool (design doc §12, §23.1). */
  dailyLimit: number;
}

/** Honest "up to" daily caps (design doc §7.1, §12). */
export const PLANS: Record<Plan, PlanInfo> = {
  starter_20: { id: "starter_20", name: "Starter", priceUsd: 19, dailyLimit: 20 },
  pro_50: { id: "pro_50", name: "Pro", priceUsd: 49, dailyLimit: 50 },
};

/** Applications a user gets free before the card is charged (design doc §12, §23.7). */
export const TRIAL_APPLICATION_LIMIT = 5;
