/** Shared types for the server-side apply runner. */
import type { MasterProfile } from "./field-resolver.js";

export type ApplyJob = {
  id: string;
  userId: string;
  jobId: string;
  fieldMap: Record<string, unknown>;
  baseVersionId: string | null;
  resumeVariantId: string | null;
  renderedPdfPath: string | null;
  attempts: number;
};

export type ApplicantProfile = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  github: string;
};

export type ResumeArtifact = {
  path: string;
  bytes: Uint8Array;
  filename: string;
  contentType: string;
};

export type PageBlocker =
  | "login_required"
  | "captcha_required"
  | "closed_job"
  | "unsupported_flow";

export type AdapterRisk = "server_safe" | "review_only" | "extension_only";

export type AdapterValidation = {
  ok: boolean;
  confidence: number;
  blocker?: PageBlocker | null;
  reason?: string | null;
  requiredFields: string[];
  missingRequired: string[];
  submitFound: boolean;
  resumeInputFound: boolean;
  screenshot?: Uint8Array | null;
};

/** Outcome of an adapter attempting one application. */
export type SubmitOutcome =
  | { status: "submitted"; screenshot?: Uint8Array | null }
  | { status: "skipped"; reason: string; screenshot?: Uint8Array | null } // dry run: filled, not submitted
  | { status: "failed"; reason: string; permanent: boolean; screenshot?: Uint8Array | null };

/** Per-ATS submission strategy. `page` is a Playwright Page (typed loosely so the core stays
 *  browser-agnostic and unit-testable with fakes). */
export interface Adapter {
  readonly id: string;
  readonly version: string;
  readonly risk: AdapterRisk;
  matches(ctx: { platform: string; jobUrl: string }): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate(page: any, ctx: AdapterContext): Promise<AdapterValidation>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submit(page: any, ctx: AdapterContext): Promise<SubmitOutcome>;
}

export type AdapterContext = {
  job: ApplyJob;
  jobUrl: string;
  applicant: ApplicantProfile;
  /** Full setup profile used to answer screening questions (work auth, sponsorship, reusable answers). */
  masterProfile?: MasterProfile;
  /** Whether EEO/demographic questions may be auto-filled (default false → decline-to-answer). */
  demographicsEnabled?: boolean;
  resume: ResumeArtifact;
  dryRun: boolean;
  log: (message: string) => void;
};
