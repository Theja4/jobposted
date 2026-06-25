import type { AtsType, FormQuestionType } from "./types";

export interface MasterProfileIdentity {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  email: string;
  phone: string;
}

export interface MasterProfileLocation {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface MasterProfileLinks {
  portfolio?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website: string[];
}

export interface MasterProfileWorkAuth {
  authorizedToWork: boolean | null;
  requiresSponsorship: boolean | null;
  country?: string | null;
}

export interface MasterProfileCompensation {
  currentMin?: number | null;
  currentMax?: number | null;
  currentCurrency?: string | null;
  expectedMin?: number | null;
  expectedMax?: number | null;
  currency?: string | null;
}

export interface MasterProfileDemographics {
  gender?: string | null;
  race?: string[];
  veteranStatus?: string | null;
  disabilityStatus?: string | null;
  hispanicLatino?: boolean | null;
}

export interface MasterProfileExperience {
  title: string;
  company: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean | null;
  bullets: string[];
}

export interface MasterProfileEducation {
  school: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string | null;
}

export interface ReusableAnswer {
  key: string;
  prompt: string;
  value: string;
}

export interface MasterProfileDocuments {
  resumeUrl?: string | null;
  resumeName?: string | null;
  coverLetterUrl?: string | null;
  coverLetterName?: string | null;
}

export interface MasterProfile {
  identity: MasterProfileIdentity;
  location: MasterProfileLocation;
  links: MasterProfileLinks;
  workAuth: MasterProfileWorkAuth;
  compensation?: MasterProfileCompensation;
  demographics?: MasterProfileDemographics;
  experience: MasterProfileExperience[];
  education: MasterProfileEducation[];
  skills: string[];
  answers: ReusableAnswer[];
  documents: MasterProfileDocuments;
  completeness?: number;
  source?: "jobposted" | "rezoomed" | "fallback";
}

export type ExtensionPlatform =
  | AtsType
  | "greenhouse_embedded"
  | "workday_tenant"
  | "generic";

export type CanonicalFieldKey =
  | "identity.fullName"
  | "identity.firstName"
  | "identity.lastName"
  | "identity.preferredName"
  | "identity.email"
  | "identity.phone"
  | "identity.phoneCountryCode"
  | "identity.phoneNational"
  | "location.street"
  | "location.city"
  | "location.state"
  | "location.postalCode"
  | "location.country"
  | "links.portfolio"
  | "links.linkedin"
  | "links.github"
  | "links.website"
  | "workAuth.authorizedToWork"
  | "workAuth.requiresSponsorship"
  | "workAuth.country"
  | "compensation.current"
  | "compensation.currentCurrency"
  | "compensation.expected"
  | "compensation.expectedCurrency"
  | "demographics.gender"
  | "demographics.race"
  | "demographics.veteranStatus"
  | "demographics.disabilityStatus"
  | "demographics.hispanicLatino"
  | "documents.resume"
  | "documents.coverLetter"
  | "experience.currentCompany"
  | "experience"
  | "education"
  | "skills"
  | `answers.${string}`
  | "unknown";

export type ExtensionFieldControl =
  | FormQuestionType
  | "date"
  | "combobox"
  | "typeahead"
  | "chips"
  | "hidden";

export interface ExtensionFieldContext {
  signature: string;
  platform: ExtensionPlatform;
  url: string;
  label: string;
  context?: string;
  type: ExtensionFieldControl;
  required?: boolean;
  options?: string[];
}

export interface ExtensionFieldMapping {
  canonicalKey: CanonicalFieldKey;
  value?: string | string[] | boolean | null;
  confidence: number;
  source: "adapter" | "heuristic" | "answer" | "llm" | "cache" | "user" | "skip";
  reason?: string;
}

export interface ExtensionFieldFillRecord {
  signature: string;
  label: string;
  required?: boolean;
  canonicalKey: CanonicalFieldKey;
  status: "filled" | "skipped" | "needs_user" | "failed";
  confidence: number;
  valuePreview?: string;
  source: ExtensionFieldMapping["source"];
  error?: string;
}

export interface ExtensionAutofillPageField {
  fieldId: string;
  label: string;
  type: ExtensionFieldControl;
  options: string[];
  optionMode?: "full" | "local_dictionary" | "ranked_subset" | null;
  optionDictionary?:
    | "phone_country_code"
    | "country"
    | "region"
    | "school"
    | "language"
    | "skill"
    | "currency"
    | "timezone"
    | "large_unknown"
    | null;
  optionCount?: number | null;
  required: boolean;
  currentValue?: string | null;
  section?: string | null;
  repeater?: "education" | "experience" | null;
  repeaterIndex?: number | null;
}

export type ExtensionAutofillPlanAction =
  | "fill"
  | "select"
  | "check"
  | "uncheck"
  | "attach"
  | "skip";

export interface ExtensionAutofillPlanItem {
  fieldId: string;
  action: ExtensionAutofillPlanAction;
  value?: string | string[] | boolean | null;
  optionLabel?: string | null;
  confidence: number;
  note?: string | null;
}

export interface ExtensionAutofillPlan {
  stepName: string;
  fields: ExtensionAutofillPlanItem[];
  summary?: string | null;
}

export interface ExtensionAutofillPlanRequest {
  platform: ExtensionPlatform;
  url: string;
  title?: string | null;
  stepName?: string | null;
  fields: ExtensionAutofillPageField[];
}

export interface ExtensionResumeResponse {
  ok: true;
  jobId?: string | null;
  documentId?: string | null;
  resumeUrl: string | null;
  resumeName?: string | null;
  coverLetterUrl?: string | null;
  coverLetterName?: string | null;
  genericResumeUsed: boolean;
  expiresAt?: string | null;
}

export interface ExtensionApplicationUpsert {
  source: "extension";
  platform: ExtensionPlatform;
  company: string;
  role: string;
  jobUrl: string;
  jobId?: string | null;
  status: "filled" | "submitted";
  appliedAt: string;
  resumeUsed?: string | null;
  genericResumeUsed?: boolean;
  fieldsFilled: ExtensionFieldFillRecord[];
  screenshotUrl?: string | null;
}

export interface ExtensionApplicationResponse {
  ok: true;
  applicationId: string | null;
  jobId: string | null;
  duplicate?: boolean;
  queued?: boolean;
  attempts?: number;
  queuedAt?: string | null;
}

export interface ExtensionJobContext {
  platform: ExtensionPlatform;
  company: string;
  role: string;
  jobUrl: string;
  jobDescription: string;
}

export interface ExtensionTailorResponse {
  ok: true;
  kind: "tailor";
  jobId: string | null;
  applicationId?: string | null;
  resumeUrl: string | null;
  resumeDocxUrl?: string | null;
  matchScore?: number | null;
  changed?: boolean;
}

export interface ExtensionCoverLetterResponse {
  ok: true;
  kind: "cover_letter";
  jobId: string | null;
  applicationId?: string | null;
  documentId?: string | null;
  coverLetterUrl: string | null;
  preview?: string | null;
}

export interface ExtensionSyncQueueStatus {
  pending: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
}

export interface ExtensionAutofillRunResult {
  platform: ExtensionPlatform;
  stepName: string;
  jobUrl: string;
  company: string;
  role: string;
  filled: number;
  needsUser: number;
  skipped: number;
  failed: number;
  total: number;
  fields: ExtensionFieldFillRecord[];
  tracker?: ExtensionApplicationResponse | null;
  trackerError?: string | null;
}

export interface ExtensionAutofillDiscoveryResult {
  platform: ExtensionPlatform;
  stepName: string;
  jobUrl: string;
  company: string;
  role: string;
  total: number;
  fields: ExtensionAutofillPageField[];
}

export interface ExtensionSettings {
  submissionPolicy: "review" | "auto";
  autoAdvance: boolean;
  overwriteFilledFields: boolean;
  enableGenericFallback: boolean;
  autoTrackAutofill: boolean;
  enabledPlatforms: Partial<Record<ExtensionPlatform, boolean>>;
  demographicsEnabled: boolean;
  humanPace: "careful" | "balanced" | "fast";
}

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  submissionPolicy: "review",
  autoAdvance: true,
  overwriteFilledFields: false,
  enableGenericFallback: false,
  autoTrackAutofill: true,
  enabledPlatforms: {},
  demographicsEnabled: false,
  humanPace: "balanced",
};

export interface ExtensionAuthSession {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  user?: {
    id: string;
    email?: string | null;
  } | null;
}

export type ExtensionMessage =
  | { type: "AUTH_START" }
  | { type: "AUTH_STATUS" }
  | { type: "AUTH_SIGN_OUT" }
  | { type: "AUTH_SESSION_DELIVERY"; requestId?: string; session: ExtensionAuthSession }
  | { type: "PROFILE_GET"; forceRefresh?: boolean; cachedOnly?: boolean }
  | { type: "RESUME_GET"; jobId?: string | null }
  | { type: "FIELD_MAP"; field: ExtensionFieldContext; profile: MasterProfile }
  | { type: "AUTOFILL_PLAN"; payload: ExtensionAutofillPlanRequest }
  | { type: "PANEL_OPEN_ACTIVE_TAB" }
  | { type: "AUTOFILL_DISCOVER_ACTIVE_TAB" }
  | { type: "AUTOFILL_ACTIVE_TAB"; continueSteps?: boolean }
  | { type: "TRACKER_ADD_ACTIVE_TAB" }
  | { type: "TAILOR_ACTIVE_TAB" }
  | { type: "COVER_LETTER_ACTIVE_TAB" }
  | { type: "APPLICATION_SYNC"; payload: ExtensionApplicationUpsert }
  | { type: "APPLICATION_SYNC_RETRY" }
  | { type: "SYNC_QUEUE_STATUS" }
  | { type: "ANSWER_SAVE"; answer: ReusableAnswer }
  | { type: "SETTINGS_GET" }
  | { type: "SETTINGS_SET"; settings: Partial<ExtensionSettings> }
  | { type: "OVERLAY_STATUS"; tabUrl?: string };

export type ExtensionMessageResponse =
  | { ok: true; type: "AUTH_STATUS"; authenticated: boolean; email?: string | null }
  | { ok: true; type: "AUTH_START"; requestId: string }
  | { ok: true; type: "AUTH_SIGN_OUT" }
  | { ok: true; type: "PROFILE_GET"; profile: MasterProfile | null }
  | { ok: true; type: "RESUME_GET"; resume: ExtensionResumeResponse }
  | { ok: true; type: "FIELD_MAP"; mapping: ExtensionFieldMapping }
  | { ok: true; type: "AUTOFILL_PLAN"; plan: ExtensionAutofillPlan }
  | { ok: true; type: "PANEL_OPEN_ACTIVE_TAB" }
  | { ok: true; type: "AUTOFILL_DISCOVER_ACTIVE_TAB"; result: ExtensionAutofillDiscoveryResult }
  | { ok: true; type: "AUTOFILL_ACTIVE_TAB"; result: ExtensionAutofillRunResult }
  | { ok: true; type: "TRACKER_ADD_ACTIVE_TAB"; result: ExtensionApplicationResponse }
  | { ok: true; type: "TAILOR_ACTIVE_TAB"; result: ExtensionTailorResponse }
  | { ok: true; type: "COVER_LETTER_ACTIVE_TAB"; result: ExtensionCoverLetterResponse }
  | { ok: true; type: "APPLICATION_SYNC"; result: ExtensionApplicationResponse }
  | { ok: true; type: "APPLICATION_SYNC_RETRY"; status: ExtensionSyncQueueStatus }
  | { ok: true; type: "SYNC_QUEUE_STATUS"; status: ExtensionSyncQueueStatus }
  | { ok: true; type: "ANSWER_SAVE" }
  | { ok: true; type: "SETTINGS_GET"; settings: ExtensionSettings }
  | { ok: true; type: "SETTINGS_SET"; settings: ExtensionSettings }
  | { ok: true; type: "OVERLAY_STATUS"; supported: boolean; platform: ExtensionPlatform }
  | { ok: false; error: string; status?: number };

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type.length > 0;
}
