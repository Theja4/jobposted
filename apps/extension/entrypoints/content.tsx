import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderGit2,
  GraduationCap,
  Link2,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquareText,
  Pencil,
  Settings,
  Sparkles,
  StickyNote,
  Upload,
  User,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import type {
  ExtensionApplicationResponse,
  ExtensionAutofillDiscoveryResult,
  ExtensionAutofillPlan,
  ExtensionAutofillRunResult,
  ExtensionAuthSession,
  ExtensionFieldFillRecord,
  ExtensionJobContext,
  ExtensionJobState,
  ExtensionMessageResponse,
  ExtensionResumeOption,
  ExtensionTrackerItem,
  MasterProfileEducation,
  MasterProfileExperience,
  MasterProfileProject,
  ExtensionPlatform,
  ExtensionResumeResponse,
  ExtensionSettings,
  MasterProfile,
} from "@jobposted/shared";
import { JOBPOSTED_WEB_ORIGIN, REZOOMED_BUILDER_IMPORT_PATH, REZOOMED_WEB_ORIGIN } from "../src/config/env";
import { detectAdapter } from "../src/adapters";
import { fillCurrentStep, humanDelay } from "../src/autofill/engine";
import type { FieldDescriptor } from "../src/autofill/types";
import {
  applyAutofillPlan,
  compactFields,
  countVisibleApplicationControls,
  ensureRepeaters,
  extractPageFields,
  hydrateChoiceFieldOptions,
  mergeProfileEducationPlan,
  type PageField,
} from "../src/content/autofill";
import { strategyForPlatform } from "../src/content/fill-strategy";
import { isApplicationHostUrl, shouldDeferToEmbeddedApplication } from "../src/content/embedded-application";
import { isGreenhousePage, isLeverPage } from "../src/content/open-ats";
import { isWorkdayPage, workdayCompany, workdayJobHeading, workdayStepName } from "../src/content/workday";
import {
  JOB_CONTEXT_CONFIDENCE_THRESHOLD,
  resolveJobContext,
  type ResolvedJobContext,
} from "../src/content/job-context";

const includeLocalhost =
  import.meta.env.MODE !== "production" ||
  import.meta.env.WXT_INCLUDE_LOCALHOST === "1" ||
  /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(JOBPOSTED_WEB_ORIGIN);

function originMatch(origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.protocol}//${url.hostname}/*`;
    }
    return `${url.origin}/*`;
  } catch {
    return "https://jobposted.app/*";
  }
}

const CONTENT_MATCHES = [
  "https://*.myworkdayjobs.com/*",
  "https://boards.greenhouse.io/*",
  "https://*.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://*.ashbyhq.com/*",
  "https://www.linkedin.com/*",
  "https://*.icims.com/*",
  "https://*.workable.com/*",
  "https://*.smartrecruiters.com/*",
  "https://*.taleo.net/*",
  "https://*.oraclecloud.com/*",
  "https://*.successfactors.com/*",
  "https://*.jobvite.com/*",
  "https://*.bamboohr.com/*",
  "https://*.dover.com/*",
  "https://*.indeed.com/*",
  "https://*.rippling.com/*",
  "https://*.paylocity.com/*",
  originMatch(JOBPOSTED_WEB_ORIGIN),
  "https://jobposted.app/*",
  "https://www.jobposted.app/*",
  "https://jobposted.ai/*",
  "https://www.jobposted.ai/*",
  ...(includeLocalhost ? ["http://localhost/*", "http://127.0.0.1/*"] : []),
].filter((value, index, all) => all.indexOf(value) === index);

const CONTENT_AUTOFILL_MESSAGE = "JOBPOSTED_AUTOFILL_CURRENT_PAGE";
const CONTENT_DISCOVER_MESSAGE = "JOBPOSTED_DISCOVER_CURRENT_PAGE";
const CONTENT_TRACK_MESSAGE = "JOBPOSTED_TRACK_CURRENT_PAGE";
const CONTENT_JOB_CONTEXT_MESSAGE = "JOBPOSTED_JOB_CONTEXT";
const CONTENT_PANEL_TOGGLE_MESSAGE = "JOBPOSTED_TOGGLE_IN_PAGE_PANEL";
const PANEL_HOST_ID = "jobposted-autofill-panel-host";
const PANEL_OPEN_EVENT = "jobposted-panel-open";

type PanelStatus = "idle" | "scanning" | "planning" | "filling" | "done" | "error";
type PanelFieldStatus = "pending" | "active" | "filled" | "skipped" | "needs_user" | "failed";

const PANEL_STEP_SIGNATURE_SELECTOR = [
  "[data-automation-id='progressBarActiveStep']",
  "[data-automation-id='progressTrackerActiveStep']",
  "[data-automation-id='stepName']",
  "[aria-current='step']",
  "main h1",
  "form h1",
  "h1",
].join(",");

interface PanelField {
  fieldId: string;
  label: string;
  required: boolean;
  status: PanelFieldStatus;
  confidence: number;
  note?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function configuredHostname() {
  try {
    return new URL(JOBPOSTED_WEB_ORIGIN).hostname.toLowerCase();
  } catch {
    return "jobposted.app";
  }
}

function isJobPostedWebAppHost(hostname = location.hostname) {
  const host = hostname.toLowerCase();
  return (
    host === configuredHostname() ||
    host === "jobposted.app" ||
    host === "www.jobposted.app" ||
    host === "jobposted.ai" ||
    host === "www.jobposted.ai" ||
    (includeLocalhost && (host === "localhost" || host === "127.0.0.1"))
  );
}

function normalizeSupabaseSession(value: unknown): ExtensionAuthSession | null {
  const root = asRecord(value);
  const session = asRecord(root.currentSession ?? root.session ?? value);
  const accessToken = str(session.access_token ?? session.accessToken);
  if (!accessToken) return null;
  const refreshToken = str(session.refresh_token ?? session.refreshToken) || null;
  const expiresAt = num(session.expires_at ?? session.expiresAt ?? root.expiresAt);
  const user = asRecord(session.user);
  const userId = str(user.id);

  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: userId ? { id: userId, email: str(user.email) || null } : null,
  };
}

function readStoredWebSession(): ExtensionAuthSession | null {
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) ?? "";
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const session = normalizeSupabaseSession(JSON.parse(window.localStorage.getItem(key) ?? "null"));
      if (session) return session;
    }
  } catch {
    return null;
  }
  return null;
}

async function syncStoredWebSession() {
  if (!isJobPostedWebAppHost()) return;
  const session = readStoredWebSession();
  if (!session) return;
  await message({ type: "AUTH_SESSION_DELIVERY", session });
}

function extensionContextValid(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function assetUrl(path: string): string {
  try {
    return extensionContextValid() ? chrome.runtime.getURL(path) : "";
  } catch {
    return "";
  }
}

const HANDLE_TOP_STORAGE_KEY = "jp-handle-top-pct";

function readStoredHandleTop(): number {
  try {
    const saved = Number(window.localStorage.getItem(HANDLE_TOP_STORAGE_KEY));
    return Number.isFinite(saved) && saved >= 6 && saved <= 94 ? saved : 50;
  } catch {
    return 50;
  }
}

function writeStoredHandleTop(pct: number) {
  try {
    window.localStorage.setItem(HANDLE_TOP_STORAGE_KEY, String(pct));
  } catch {
    // Storage can be unavailable (private mode, disabled cookies) — position just resets next load.
  }
}

// Best-effort favicon for the site the user is applying on, shown as a small
// badge on the collapsed handle so it's obvious which ATS/board it belongs to.
function pageFaviconUrl(): string | null {
  try {
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
    const withHref = links.map((link) => link.href).find((href) => Boolean(href));
    if (withHref) return withHref;
    return `${new URL(window.location.href).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

// After the extension is reloaded/updated, content scripts left in already-open
// tabs are orphaned: any chrome.* call throws "Extension context invalidated".
// Guard every call so an orphaned panel degrades quietly instead of throwing
// uncaught errors into the page console.
function message<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  if (!extensionContextValid()) {
    return Promise.resolve({ ok: false, error: "extension_reloaded" } as unknown as T);
  }
  try {
    return Promise.resolve(chrome.runtime.sendMessage(payload) as Promise<T>).catch(
      () => ({ ok: false, error: "extension_reloaded" }) as unknown as T,
    );
  } catch {
    return Promise.resolve({ ok: false, error: "extension_reloaded" } as unknown as T);
  }
}

function isTopFrame() {
  try {
    return window.self === window.top;
  } catch {
    return true;
  }
}

function shouldDeferAutofillToEmbeddedApplication(doc: Document = document) {
  return shouldDeferToEmbeddedApplication(doc, window.location.href, isTopFrame());
}

function installBridgeListener() {
  const state = globalThis as typeof globalThis & { __jobpostedBridgeListener?: boolean };
  if (state.__jobpostedBridgeListener) return;
  state.__jobpostedBridgeListener = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.type !== "JOBPOSTED_EXTENSION_SESSION") return;
    const session = normalizeSupabaseSession(data.session);
    if (!session) return;
    if (!extensionContextValid()) return;
    const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
    void chrome.runtime
      .sendMessage({ type: "AUTH_SESSION_DELIVERY", requestId, session })
      .then((response: ExtensionMessageResponse) => {
        window.postMessage(
          {
            type: "JOBPOSTED_EXTENSION_SESSION_ACK",
            requestId,
            ok: response.ok && response.type === "AUTH_STATUS" && response.authenticated,
            email: response.ok && response.type === "AUTH_STATUS" ? response.email ?? null : null,
          },
          window.location.origin,
        );
      })
      .catch((error: unknown) => {
        window.postMessage(
          {
            type: "JOBPOSTED_EXTENSION_SESSION_ACK",
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : "extension_unavailable",
          },
          window.location.origin,
        );
      });
  });
}

function injectPageHighlightStyle() {
  if (document.getElementById("jobposted-page-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "jobposted-page-highlight-style";
  style.textContent = `
    .jp-field-highlight {
      outline: 2px solid rgba(31, 100, 224, 0.72) !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 5px rgba(31, 100, 224, 0.12) !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function pageSnapshot(adapter: ReturnType<typeof detectAdapter>) {
  const step = adapter.detectStep(document);
  return {
    href: window.location.href,
    stepName: step.name,
    stepIndex: step.index ?? null,
    stepTotal: step.total ?? null,
    submitVisible: Boolean(adapter.findSubmit(document)),
  };
}

function snapshotChanged(before: ReturnType<typeof pageSnapshot>, after: ReturnType<typeof pageSnapshot>) {
  return (
    before.href !== after.href ||
    before.stepName !== after.stepName ||
    before.stepIndex !== after.stepIndex ||
    before.stepTotal !== after.stepTotal ||
    (!before.submitVisible && after.submitVisible)
  );
}

function waitForAdvanceOutcome(
  adapter: ReturnType<typeof detectAdapter>,
  before: ReturnType<typeof pageSnapshot>,
  shouldStop?: () => boolean,
) {
  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    let done = false;
    let observer: MutationObserver | null = null;
    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    const finish = (advanced: boolean) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      if (intervalId != null) window.clearInterval(intervalId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
      window.setTimeout(() => resolve(advanced), advanced ? 350 : 0);
    };

    const check = () => {
      if (shouldStop?.()) {
        finish(false);
        return;
      }
      if (snapshotChanged(before, pageSnapshot(adapter))) {
        finish(true);
        return;
      }
      if (Date.now() - startedAt >= 4500) finish(false);
    };

    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    intervalId = window.setInterval(check, 150);
    timeoutId = window.setTimeout(() => finish(false), 4700);
    check();
  });
}

function needsUserReview(records: ExtensionFieldFillRecord[]) {
  return records.some((record) => record.status === "needs_user" || record.status === "failed");
}

function advanceBlockedRecord(stepName: string): ExtensionFieldFillRecord {
  return {
    signature: `jobposted-advance-blocked:${window.location.href}:${stepName}`,
    label: "Required fields need review",
    required: true,
    canonicalKey: "unknown",
    status: "needs_user",
    confidence: 0,
    source: "skip",
    error: "Could not continue because this step stayed open. Fill the missing required fields, then try again.",
  };
}

function detectPlatform(url = window.location.href, doc: Document = document): ExtensionPlatform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = window.location.hostname.toLowerCase();
  }
  if (isWorkdayPage(url, doc)) return "workday";
  if (isGreenhousePage(url, doc)) return "greenhouse";
  if (isLeverPage(url)) return "lever";
  if (host.includes("ashbyhq.com") || doc.querySelector("[data-testid='CandidateApplicationForm']")) return "ashby";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("icims.com")) return "icims";
  if (host.includes("workable.com")) return "workable";
  if (host.includes("smartrecruiters.com")) return "smartrecruiters";
  if (host.includes("taleo.net")) return "taleo";
  if (host.includes("oraclecloud.com")) return "oracle";
  if (host.includes("successfactors.com")) return "successfactors";
  if (host.includes("jobvite.com")) return "jobvite";
  if (host.includes("bamboohr.com")) return "bamboohr";
  if (host.includes("dover.com")) return "dover";
  if (host.includes("indeed.com")) return "indeed";
  if (host.includes("rippling.com")) return "rippling";
  if (host.includes("paylocity.com")) return "paylocity";
  return "generic";
}

function pageFieldFromDescriptor(field: FieldDescriptor): PageField {
  return {
    fieldId: field.signature,
    label: field.label || field.context || field.id,
    type: field.type,
    options: field.options,
    required: field.required,
    currentValue: null,
    section: null,
    repeater: null,
    repeaterIndex: null,
    element: field.element,
    elements: [field.element],
    signature: field.signature,
  };
}

function detectStepName(doc: Document = document) {
  return (
    workdayStepName(doc) ||
    doc.querySelector("h1,h2,[aria-current='step']")?.textContent?.trim() ||
    "Current page"
  );
}

function compactText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function panelStepMarker(doc: Document = document) {
  const marker = doc.querySelector<HTMLElement>(PANEL_STEP_SIGNATURE_SELECTOR);
  return compactText(marker?.textContent) || detectStepName(doc);
}

function embeddedApplicationFrameSignature(doc: Document = document) {
  return Array.from(doc.querySelectorAll<HTMLIFrameElement>("iframe[src]"))
    .map((frame) => frame.getAttribute("src") ?? "")
    .filter((src) => isApplicationHostUrl(src, window.location.href))
    .join("|");
}

function controlLabelText(control: HTMLElement, doc: Document = document) {
  const labelElements = "labels" in control ? Array.from((control as HTMLInputElement).labels ?? []) : [];
  const labelledBy = (control.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => doc.getElementById(id)?.textContent ?? "")
    .join(" ");
  return compactText(
    [
      control.getAttribute("aria-label"),
      labelledBy,
      labelElements.map((label) => label.textContent ?? "").join(" "),
      control.closest("label")?.textContent,
    ].join(" "),
  );
}

function panelControlSignature(doc: Document = document) {
  return Array.from(doc.querySelectorAll<HTMLElement>("input,select,textarea,[role='combobox'],[contenteditable='true']"))
    .map((control) =>
      compactText(
        [
          control.tagName,
          control.getAttribute("type"),
          control.getAttribute("role"),
          control.getAttribute("id"),
          control.getAttribute("name"),
          control.getAttribute("data-automation-id"),
          controlLabelText(control, doc),
        ].join(" "),
      ),
    )
    .filter(Boolean)
    .slice(0, 30)
    .join("|");
}

function panelPageSignature(doc: Document = document) {
  return [
    window.location.href,
    detectPlatform(window.location.href, doc),
    detectStepName(doc),
    panelStepMarker(doc),
    panelControlSignature(doc),
    embeddedApplicationFrameSignature(doc),
  ].join("\n");
}

function resolvePageJobContext(platform: ExtensionPlatform, doc: Document = document): ResolvedJobContext {
  return resolveJobContext({
    doc,
    url: window.location.href,
    hints:
      platform === "workday"
        ? { role: workdayJobHeading(doc), company: workdayCompany(doc) }
        : undefined,
  });
}

// User-confirmed overrides from the panel's job-context card. When the resolver
// is unsure and the user corrects the company/role, this is what gets written to
// the tracker instead of the DOM-derived guess. Cleared on every page change.
let jobIdentityOverride: { company: string; role: string } | null = null;
function setJobIdentityOverride(value: { company: string; role: string } | null) {
  jobIdentityOverride = value;
}

function applicationMetadata(platform: ExtensionPlatform) {
  const resolved = resolvePageJobContext(platform);
  return {
    source: "extension" as const,
    platform,
    company: jobIdentityOverride?.company || resolved.company || "Unknown company",
    role: jobIdentityOverride?.role || resolved.role || "Unknown role",
    jobUrl: window.location.href,
    confidence: resolved.confidence,
    contextSource: resolved.source,
  };
}

function jobContextForCurrentPage(): ExtensionJobContext {
  const platform = detectPlatform();
  const metadata = applicationMetadata(platform);
  const mainText =
    document.querySelector("main")?.textContent ||
    document.querySelector("[data-testid*='job' i], [class*='job' i], article")?.textContent ||
    document.body?.textContent ||
    "";
  return {
    platform,
    company: metadata.company,
    role: metadata.role,
    jobUrl: metadata.jobUrl,
    jobDescription: mainText.replace(/\s+/g, " ").trim().slice(0, 25_000),
  };
}

async function loadAdapterAutofillPrereqs(adapter: ReturnType<typeof detectAdapter>, forceGenericFallback: boolean) {
  const [settingsResponse, profileResponse] = await Promise.all([
    message<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
    message<ExtensionMessageResponse>({ type: "PROFILE_GET", forceRefresh: false }),
  ]);
  if (!settingsResponse.ok || settingsResponse.type !== "SETTINGS_GET") {
    throw new Error(settingsResponse.ok ? "Settings unavailable." : settingsResponse.error);
  }
  if (!profileResponse.ok || profileResponse.type !== "PROFILE_GET" || !profileResponse.profile) {
    throw new Error(profileResponse.ok ? "Profile unavailable." : profileResponse.error);
  }

  const settings = settingsResponse.settings as ExtensionSettings;
  if (settings.enabledPlatforms[adapter.id] === false) {
    throw new Error(`${adapter.label} is disabled in JobPosted options.`);
  }
  if (adapter.id === "generic" && !settings.enableGenericFallback && !forceGenericFallback) {
    throw new Error("Generic fallback is off. Enable it in options for unknown forms.");
  }

  return {
    settings,
    profile: profileResponse.profile as MasterProfile,
  };
}

async function loadAutofillPrereqs(forceGenericFallback: boolean) {
  const platform = detectPlatform();
  const [settingsResponse, profileResponse] = await Promise.all([
    message<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
    message<ExtensionMessageResponse>({ type: "PROFILE_GET", forceRefresh: false }),
  ]);
  if (!settingsResponse.ok || settingsResponse.type !== "SETTINGS_GET") {
    throw new Error(settingsResponse.ok ? "Settings unavailable." : settingsResponse.error);
  }
  if (!profileResponse.ok || profileResponse.type !== "PROFILE_GET" || !profileResponse.profile) {
    throw new Error(profileResponse.ok ? "Profile unavailable." : profileResponse.error);
  }
  const settings = settingsResponse.settings;
  if (settings.enabledPlatforms[platform] === false) {
    throw new Error(`${platform} is disabled in JobPosted options.`);
  }
  if (platform === "generic" && !settings.enableGenericFallback && !forceGenericFallback) {
    throw new Error("Generic fallback is off. Enable it in options for unknown forms.");
  }
  return { platform, settings, profile: profileResponse.profile };
}

async function syncAutofill(
  fieldsFilled: ExtensionFieldFillRecord[],
  platform: ExtensionPlatform,
  status: "filled" | "submitted" = "filled",
) {
  const payload = {
    ...applicationMetadata(platform),
    status,
    appliedAt: new Date().toISOString(),
    fieldsFilled,
  };
  return message<ExtensionMessageResponse>({ type: "APPLICATION_SYNC", payload });
}

async function trackCurrentPage() {
  const platform = detectPlatform();
  const response = await syncAutofill([], platform);
  if (!response.ok || response.type !== "APPLICATION_SYNC") {
    throw new Error(response.ok ? "Tracker did not return a result." : response.error);
  }
  return response.result;
}

function summarizeRunResult(args: {
  platform: ExtensionPlatform;
  stepName: string;
  fields: ExtensionFieldFillRecord[];
  tracker?: ExtensionApplicationResponse | null;
  trackerError?: string | null;
}): ExtensionAutofillRunResult {
  const metadata = applicationMetadata(args.platform);
  return {
    platform: args.platform,
    stepName: args.stepName,
    jobUrl: metadata.jobUrl,
    company: metadata.company,
    role: metadata.role,
    fields: args.fields,
    filled: args.fields.filter((record) => record.status === "filled").length,
    needsUser: args.fields.filter((record) => record.status === "needs_user").length,
    skipped: args.fields.filter((record) => record.status === "skipped").length,
    failed: args.fields.filter((record) => record.status === "failed").length,
    total: args.fields.length,
    tracker: args.tracker,
    trackerError: args.trackerError,
  };
}

function noParsedFieldsMessage(visibleControls: number) {
  if (visibleControls > 0) {
    return `Found ${visibleControls} visible form controls, but no application questions were parsed. This run did not autofill anything.`;
  }
  return "No application fields were detected in the active tab.";
}

function noParsedFieldsRecord(platform: ExtensionPlatform, stepName: string, visibleControls: number): ExtensionFieldFillRecord | null {
  if (visibleControls <= 0) return null;
  return {
    signature: `jobposted-parser-empty:${platform}:${stepName}:${window.location.href}`,
    label: "Application questions were not parsed",
    required: true,
    canonicalKey: "unknown",
    status: "failed",
    confidence: 0,
    source: "skip",
    error: noParsedFieldsMessage(visibleControls),
  };
}

function summarizeNoParsedFieldsResult(platform: ExtensionPlatform, stepName: string): ExtensionAutofillRunResult {
  const visibleControls = countVisibleApplicationControls(document);
  const record = noParsedFieldsRecord(platform, stepName, visibleControls);
  return summarizeRunResult({
    platform,
    stepName,
    fields: record ? [record] : [],
    tracker: null,
    trackerError: noParsedFieldsMessage(visibleControls),
  });
}

function summarizeDiscoveryResult(args: {
  platform: ExtensionPlatform;
  stepName: string;
  fields: PageField[];
  profile?: MasterProfile;
}): ExtensionAutofillDiscoveryResult {
  const metadata = applicationMetadata(args.platform);
  const fields = compactFields(args.fields, args.profile);
  return {
    platform: args.platform,
    stepName: args.stepName,
    jobUrl: metadata.jobUrl,
    company: metadata.company,
    role: metadata.role,
    fields,
    total: fields.length,
  };
}

async function planCurrentPage(args: {
  platform: ExtensionPlatform;
  stepName: string;
  fields: PageField[];
  profile: MasterProfile;
}): Promise<ExtensionAutofillPlan> {
  const response = await message<ExtensionMessageResponse>({
    type: "AUTOFILL_PLAN",
    payload: {
      platform: args.platform,
      url: window.location.href,
      title: document.title,
      stepName: args.stepName,
      fields: compactFields(args.fields, args.profile),
    },
  });
  if (!response.ok || response.type !== "AUTOFILL_PLAN") {
    throw new Error(response.ok ? "Autofill plan was unavailable." : response.error);
  }
  return response.plan;
}

function shouldKeepAdapterResult(adapter: ReturnType<typeof detectAdapter>, result: ExtensionAutofillRunResult) {
  if (result.total === 0) return false;
  if (result.filled > 0 || result.needsUser > 0 || result.failed > 0) return true;
  if (adapter.id === "generic") return false;
  return result.fields.some(
    (record) =>
      record.canonicalKey !== "unknown" ||
      record.source === "adapter" ||
      record.source === "heuristic" ||
      record.confidence >= 0.65,
  );
}

async function runAdapterAutofillPage(args: {
  continueSteps?: boolean;
  forceGenericFallback: boolean;
  suppressAutoTrack?: boolean;
  shouldStop?: () => boolean;
  onStatus?: (status: PanelStatus) => void;
  onFieldsDiscovered?: (fields: PageField[]) => void;
  onFieldStart?: (field: PageField) => void;
  onField?: (record: ExtensionFieldFillRecord) => void;
}): Promise<ExtensionAutofillRunResult | null> {
  args.onStatus?.("scanning");
  const adapter = detectAdapter();
  const { settings, profile } = await loadAdapterAutofillPrereqs(adapter, args.forceGenericFallback);
  const allRecords: ExtensionFieldFillRecord[] = [];
  let stepName = adapter.detectStep(document).name;
  let keptAnyAdapterStep = false;

  for (let step = 0; step < (args.continueSteps ? 8 : 1); step += 1) {
    if (args.shouldStop?.()) break;
    stepName = adapter.detectStep(document).name;
    args.onStatus?.("filling");
    const stepRecords: ExtensionFieldFillRecord[] = [];
    const result = await fillCurrentStep({
      adapter,
      profile,
      settings,
      shouldStop: args.shouldStop,
      onFieldsDiscovered: (fields) => args.onFieldsDiscovered?.(fields.map(pageFieldFromDescriptor)),
      onFieldStart: (field) => args.onFieldStart?.(pageFieldFromDescriptor(field)),
      onField: (record) => {
        stepRecords.push(record);
      },
    });

    const stepSummary = summarizeRunResult({ platform: adapter.id, stepName, fields: stepRecords });
    const keepStep = shouldKeepAdapterResult(adapter, stepSummary);
    if (!keepStep && allRecords.length === 0) return null;
    keptAnyAdapterStep = keptAnyAdapterStep || keepStep;

    for (const record of stepRecords) {
      allRecords.push(record);
      args.onField?.(record);
    }

    const submit = adapter.findSubmit(document);
    const canAdvance = args.continueSteps && settings.autoAdvance;
    if (!canAdvance || args.shouldStop?.()) break;
    if (needsUserReview(result.fields)) break;
    if (submit) break;

    const next = adapter.findAdvance(document);
    if (!next) break;
    const beforeAdvance = pageSnapshot(adapter);
    await humanDelay(settings, args.shouldStop);
    if (args.shouldStop?.()) break;
    next.click();
    const advanced = await waitForAdvanceOutcome(adapter, beforeAdvance, args.shouldStop);
    if (args.shouldStop?.()) break;
    if (!advanced) {
      const record = advanceBlockedRecord(stepName);
      allRecords.push(record);
      args.onField?.(record);
      break;
    }
    if (result.total === 0) break;
  }

  if (!keptAnyAdapterStep && allRecords.length === 0) return null;

  let tracker: ExtensionApplicationResponse | null = null;
  let trackerError: string | null = null;
  if (!args.suppressAutoTrack && settings.autoTrackAutofill && allRecords.length > 0) {
    try {
      const response = await syncAutofill(allRecords, adapter.id, "submitted");
      if (response.ok && response.type === "APPLICATION_SYNC") tracker = response.result;
      else if (!response.ok) trackerError = response.error;
    } catch (error) {
      trackerError = error instanceof Error ? error.message : "Could not sync this application.";
    }
  }

  args.onStatus?.("done");
  return summarizeRunResult({ platform: adapter.id, stepName, fields: allRecords, tracker, trackerError });
}

async function extractFieldsWithRetry(doc: Document, attempts = 6, delayMs = 300): Promise<PageField[]> {
  // Many ATS forms (Greenhouse/Workday/Ashby embeds) mount fields asynchronously
  // after the page settles. Re-scan briefly so we don't report "no fields" on a
  // form that simply hadn't rendered yet.
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const fields = extractPageFields(doc);
    if (fields.length > 0) return hydrateChoiceFieldOptions(fields);
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  return hydrateChoiceFieldOptions(extractPageFields(doc));
}

async function discoverAutofillPage(): Promise<ExtensionAutofillDiscoveryResult> {
  const platform = detectPlatform();
  const stepName = detectStepName();
  if (shouldDeferAutofillToEmbeddedApplication()) {
    return summarizeDiscoveryResult({ platform, stepName, fields: [] });
  }

  const { profile, settings } = await loadAutofillPrereqs(true);
  const discovered = await extractFieldsWithRetry(document);
  const fields = discovered.filter((field) => {
    if (settings.overwriteFilledFields) return true;
    return !field.currentValue || field.type === "file" || field.type === "checkbox" || field.type === "radio";
  });
  return summarizeDiscoveryResult({ platform, stepName, fields, profile });
}

async function runAutofillPage(args: {
  continueSteps?: boolean;
  forceGenericFallback: boolean;
  suppressAutoTrack?: boolean;
  shouldStop?: () => boolean;
  onStatus?: (status: PanelStatus) => void;
  onFieldsDiscovered?: (fields: PageField[]) => void;
  onFieldStart?: (field: PageField) => void;
  onField?: (record: ExtensionFieldFillRecord) => void;
  onPlan?: (plan: ExtensionAutofillPlan) => void;
}): Promise<ExtensionAutofillRunResult> {
  if (shouldDeferAutofillToEmbeddedApplication()) {
    return summarizeRunResult({ platform: detectPlatform(), stepName: detectStepName(), fields: [] });
  }

  // Workday's multi-step "My Experience" UI needs the dedicated adapter; every
  // other ATS goes straight to the AI-driven extract -> plan -> apply engine so the
  // legacy heuristic matcher can't fill one field and shadow the AI result.
  if (detectPlatform() === "workday") {
    const adapterResult = await runAdapterAutofillPage(args);
    if (adapterResult) return adapterResult;
  }

  args.onStatus?.("scanning");
  const { platform, profile, settings } = await loadAutofillPrereqs(args.forceGenericFallback);
  const strategy = strategyForPlatform(platform);
  const stepName = detectStepName();
  if (strategy?.preparePage) {
    await strategy.preparePage({ doc: document, profile, shouldStop: args.shouldStop });
  } else {
    await ensureRepeaters(document, profile);
  }
  if (args.shouldStop?.()) return summarizeRunResult({ platform, stepName, fields: [] });

  const discovered = await extractFieldsWithRetry(document);
  const fields = discovered.filter((field) => {
    if (settings.overwriteFilledFields) return true;
    return !field.currentValue || field.type === "file" || field.type === "checkbox" || field.type === "radio";
  });
  args.onFieldsDiscovered?.(fields);
  if (fields.length === 0) return summarizeNoParsedFieldsResult(platform, stepName);

  args.onStatus?.("planning");
  const plan = mergeProfileEducationPlan(fields, await planCurrentPage({ platform, stepName, fields, profile }), profile);
  args.onPlan?.(plan);
  if (args.shouldStop?.()) return summarizeRunResult({ platform, stepName, fields: [] });

  let resumeCache: ExtensionResumeResponse | null | undefined;
  const getResume = async () => {
    if (resumeCache !== undefined) return resumeCache;
    const response = await message<ExtensionMessageResponse>({ type: "RESUME_GET", jobId: null });
    if (response.ok && response.type === "RESUME_GET") {
      resumeCache = response.resume;
    } else {
      resumeCache = {
        ok: true,
        resumeUrl: profile.documents.resumeUrl ?? null,
        resumeName: profile.documents.resumeName ?? null,
        coverLetterUrl: profile.documents.coverLetterUrl ?? null,
        coverLetterName: profile.documents.coverLetterName ?? null,
        genericResumeUsed: true,
      };
    }
    return resumeCache;
  };

  args.onStatus?.("filling");
  const records = await applyAutofillPlan({
    fields,
    plan: plan.fields,
    getResume,
    strategy,
    shouldStop: args.shouldStop,
    onFieldStart: (field) => args.onFieldStart?.(field),
    onField: args.onField,
  });

  let tracker: ExtensionApplicationResponse | null = null;
  let trackerError: string | null = null;
  if (!args.suppressAutoTrack && settings.autoTrackAutofill && records.length > 0) {
    try {
      const response = await syncAutofill(records, platform, "submitted");
      if (response.ok && response.type === "APPLICATION_SYNC") tracker = response.result;
    } catch (error) {
      trackerError = error instanceof Error ? error.message : "Could not sync this application.";
    }
  }

  args.onStatus?.("done");
  return summarizeRunResult({ platform, stepName, fields: records, tracker, trackerError });
}

type SuccessfulTypedMessageResponse = Extract<ExtensionMessageResponse, { ok: true; type: string }>;

function assertBackgroundResponse<T extends SuccessfulTypedMessageResponse>(
  response: ExtensionMessageResponse,
  type: T["type"],
  fallbackError: string,
): T {
  if (!response.ok) throw new Error(response.error || fallbackError);
  if (response.type !== type) throw new Error(fallbackError);
  return response as T;
}

async function discoverAutofillActiveTab(): Promise<ExtensionAutofillDiscoveryResult> {
  const response = await message<ExtensionMessageResponse>({ type: "AUTOFILL_DISCOVER_ACTIVE_TAB" });
  return assertBackgroundResponse<Extract<ExtensionMessageResponse, { type: "AUTOFILL_DISCOVER_ACTIVE_TAB" }>>(
    response,
    "AUTOFILL_DISCOVER_ACTIVE_TAB",
    "Could not parse this page.",
  ).result;
}

async function runAutofillActiveTab(args: { continueSteps?: boolean }): Promise<ExtensionAutofillRunResult> {
  const response = await message<ExtensionMessageResponse>({
    type: "AUTOFILL_ACTIVE_TAB",
    continueSteps: Boolean(args.continueSteps),
  });
  return assertBackgroundResponse<Extract<ExtensionMessageResponse, { type: "AUTOFILL_ACTIVE_TAB" }>>(
    response,
    "AUTOFILL_ACTIVE_TAB",
    "Autofill failed.",
  ).result;
}

function installAutofillCommandListener() {
  const state = globalThis as typeof globalThis & { __jobpostedAutofillCommandListener?: boolean };
  if (state.__jobpostedAutofillCommandListener) return;
  state.__jobpostedAutofillCommandListener = true;

  chrome.runtime.onMessage.addListener((payload, _sender, sendResponse) => {
    if (!payload || typeof payload !== "object") return false;
    const request = payload as {
      type?: unknown;
      continueSteps?: unknown;
      forceGenericFallback?: unknown;
      suppressAutoTrack?: unknown;
    };

    if (request.type === CONTENT_TRACK_MESSAGE) {
      void trackCurrentPage()
        .then((result) => {
          sendResponse({ ok: true, type: "TRACKER_ADD_ACTIVE_TAB", result } satisfies ExtensionMessageResponse);
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Could not add this job to the tracker.",
          } satisfies ExtensionMessageResponse);
        });
      return true;
    }

    if (request.type === CONTENT_JOB_CONTEXT_MESSAGE) {
      try {
        sendResponse({ ok: true, type: "JOB_CONTEXT", context: jobContextForCurrentPage() });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not read this job page.",
        });
      }
      return true;
    }

    if (request.type === CONTENT_PANEL_TOGGLE_MESSAGE) {
      const mounted = mountInPagePanel({ autoOpen: true });
      if (mounted) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT));
      sendResponse({
        ok: mounted,
        mounted,
        error: mounted ? undefined : "JobPosted can only open in the top frame of a regular web page.",
      });
      return true;
    }

    if (request.type === CONTENT_DISCOVER_MESSAGE) {
      void discoverAutofillPage()
        .then((result) => {
          sendResponse({ ok: true, type: "AUTOFILL_DISCOVER_ACTIVE_TAB", result } satisfies ExtensionMessageResponse);
        })
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Could not parse this page.",
          } satisfies ExtensionMessageResponse);
        });
      return true;
    }

    if (request.type !== CONTENT_AUTOFILL_MESSAGE) return false;
    void runAutofillPage({
      continueSteps: request.continueSteps === true,
      forceGenericFallback: request.forceGenericFallback === true,
      suppressAutoTrack: request.suppressAutoTrack === true,
    })
      .then((result) => {
        sendResponse({ ok: true, type: "AUTOFILL_ACTIVE_TAB", result } satisfies ExtensionMessageResponse);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Autofill failed.",
        } satisfies ExtensionMessageResponse);
      });
    return true;
  });
}

function timeoutResponse(ms: number, error: string): Promise<ExtensionMessageResponse> {
  return new Promise((resolve) => window.setTimeout(() => resolve({ ok: false, error }), ms));
}

function panelStatusIsRunning(status: PanelStatus) {
  return status === "scanning" || status === "planning" || status === "filling";
}

function groupedFields(fields: PanelField[]) {
  return {
    required: fields.filter((field) => field.required),
    optional: fields.filter((field) => !field.required),
  };
}

function statusFromRecord(record: ExtensionFieldFillRecord): PanelFieldStatus {
  if (record.status === "filled") return "filled";
  if (record.status === "failed") return "failed";
  if (record.status === "needs_user") return "needs_user";
  if (record.status === "skipped") return "skipped";
  return "pending";
}

function fieldsFromRunResult(result: ExtensionAutofillRunResult): PanelField[] {
  return result.fields.map((record) => ({
    fieldId: record.signature,
    label: record.label,
    required: record.required ?? record.status !== "skipped",
    status: statusFromRecord(record),
    confidence: record.confidence,
    note: record.error ?? null,
  }));
}

function parserFailedResult(result: ExtensionAutofillRunResult) {
  return result.fields.some((field) => field.signature.startsWith("jobposted-parser-empty:"));
}

function fieldsFromDiscovery(result: ExtensionAutofillDiscoveryResult): PanelField[] {
  return result.fields.map((field) => ({
    fieldId: field.fieldId,
    label: field.label,
    required: field.required,
    status: "pending",
    confidence: 0,
    note: null,
  }));
}

function panelFieldFromPageField(field: PageField, status: PanelFieldStatus = "pending"): PanelField {
  return {
    fieldId: field.fieldId,
    label: field.label,
    required: field.required,
    status,
    confidence: 0,
    note: null,
  };
}

function mergePanelFieldRecord(fields: PanelField[], record: ExtensionFieldFillRecord): PanelField[] {
  const nextField: PanelField = {
    fieldId: record.signature,
    label: record.label,
    required: record.required ?? record.status !== "skipped",
    status: statusFromRecord(record),
    confidence: record.confidence,
    note: record.error ?? null,
  };
  const index = fields.findIndex((field) => field.fieldId === record.signature);
  if (index === -1) return [...fields, nextField];
  return fields.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...nextField } : field));
}

function fieldStatusIcon(field: PanelField) {
  if (field.status === "active") return <Loader2 className="jp-row-icon jp-spin" aria-hidden="true" />;
  if (field.status === "filled") return <CheckCircle2 className="jp-row-icon jp-ok" aria-hidden="true" />;
  if (field.status === "failed" || field.status === "needs_user") return <AlertTriangle className="jp-row-icon jp-warn" aria-hidden="true" />;
  return <Circle className="jp-row-icon" aria-hidden="true" />;
}

function InPagePanel({ initiallyCollapsed = false }: { initiallyCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fields, setFields] = useState<PanelField[]>([]);
  const [result, setResult] = useState<ExtensionAutofillRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobAction, setJobAction] = useState<"tailor" | "cover-letter" | null>(null);
  const [jobPhase, setJobPhase] = useState<"running" | "done" | "error">("running");
  const [jobActionMessage, setJobActionMessage] = useState<string | null>(null);
  const [jobComplete, setJobComplete] = useState<Extract<JobOutcome, { kind: "tailor" | "cover-letter" }> | null>(null);
  const jobResultRef = useRef<JobOutcome | null>(null);
  const [tab, setTab] = useState<"autofill" | "profile" | "tracker">("autofill");
  const [listOpen, setListOpen] = useState(true);
  const [autoTrack, setAutoTrack] = useState(true);
  const [identity, setIdentity] = useState<ResolvedJobContext | null>(null);
  // `identityEdit` is the transient draft shown only while the edit form is open;
  // `identityConfirmed` is the user's saved correction that overrides the resolver.
  const [identityEdit, setIdentityEdit] = useState<{ company: string; role: string } | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState<{ company: string; role: string } | null>(null);
  const [synced, setSynced] = useState(false);
  const [savedStage, setSavedStage] = useState<"applied" | "review">("applied");
  const [alreadyPresent, setAlreadyPresent] = useState(false);
  const [trackerQueued, setTrackerQueued] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const statusRef = useRef<PanelStatus>("idle");
  const pageSignatureRef = useRef(panelPageSignature());
  const [handleTop, setHandleTop] = useState(() => readStoredHandleTop());
  const [siteMark, setSiteMark] = useState<string | null>(() => pageFaviconUrl());
  const dragRef = useRef({ dragging: false, moved: false, startY: 0, startTop: 0 });

  function clampHandleTop(pct: number) {
    return Math.min(94, Math.max(6, pct));
  }

  function onHandlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    dragRef.current = { dragging: true, moved: false, startY: event.clientY, startTop: handleTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onHandlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag.dragging) return;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;
    setHandleTop(clampHandleTop(drag.startTop + (deltaY / window.innerHeight) * 100));
  }

  function onHandlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    drag.dragging = false;
    if (drag.moved) {
      writeStoredHandleTop(handleTop);
    } else {
      setCollapsed(false);
    }
  }

  function updateStatus(nextStatus: PanelStatus) {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }

  function refreshIdentity() {
    try {
      setIdentity(resolvePageJobContext(detectPlatform()));
    } catch {
      setIdentity(null);
    }
    setIdentityEdit(null);
    setIdentityConfirmed(null);
    setJobIdentityOverride(null);
  }

  function startIdentityEdit() {
    setIdentityEdit({ company: displayCompany, role: displayRole });
  }

  function saveIdentityEdit() {
    if (!identityEdit) return;
    const company = identityEdit.company.trim();
    const role = identityEdit.role.trim();
    const next = company || role ? { company, role } : null;
    setJobIdentityOverride(next);
    setIdentityConfirmed(next);
    setIdentityEdit(null);
  }

  async function saveJobToTracker() {
    if (saving || synced) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await syncAutofill([], detectPlatform());
      if (response.ok && response.type === "APPLICATION_SYNC" && response.result.applicationId) {
        setAlreadyPresent(Boolean(response.result.duplicate));
        setSavedStage("review"); // Save is sent as "filled" → lands in the To review column
        setSynced(true);
      } else if (response.ok && response.type === "APPLICATION_SYNC" && response.result.queued) {
        setTrackerQueued(true);
      } else {
        setSaveError(response.ok ? "Saved couldn’t be confirmed — please retry." : response.error);
      }
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save this job.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleAutoTrack(next: boolean) {
    setAutoTrack(next);
    const response = await message<ExtensionMessageResponse>({
      type: "SETTINGS_SET",
      settings: { autoTrackAutofill: next },
    });
    if (response.ok && response.type === "SETTINGS_SET") setAutoTrack(response.settings.autoTrackAutofill);
  }

  async function refreshProfile() {
    const statusResponse = await message<ExtensionMessageResponse>({ type: "AUTH_STATUS" });
    if (!statusResponse.ok || statusResponse.type !== "AUTH_STATUS" || !statusResponse.authenticated) {
      setAuthError("Connect JobPosted to autofill this page.");
      return;
    }
    setAuthError(null);
    const cached = await message<ExtensionMessageResponse>({ type: "PROFILE_GET", cachedOnly: true });
    if (cached.ok && cached.type === "PROFILE_GET" && cached.profile) setProfile(cached.profile);
    const fresh = await message<ExtensionMessageResponse>({ type: "PROFILE_GET", forceRefresh: true });
    if (fresh.ok && fresh.type === "PROFILE_GET" && fresh.profile) setProfile(fresh.profile);
  }

  useEffect(() => {
    void refreshProfile();
    refreshIdentity();
    void (async () => {
      const response = await message<ExtensionMessageResponse>({ type: "SETTINGS_GET" });
      if (response.ok && response.type === "SETTINGS_GET") setAutoTrack(response.settings.autoTrackAutofill);
    })();
  }, []);

  useEffect(() => {
    const openPanel = () => {
      setDismissed(false);
      setCollapsed(false);
      void refreshProfile();
    };
    window.addEventListener(PANEL_OPEN_EVENT, openPanel);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, openPanel);
  }, []);

  // Recover a tailor/cover run that the background worker carried out while this panel
  // was unmounted (tab switch, panel reopen, reload). A finished job shows its
  // completion card immediately; a still-running one re-attaches the loader and polls
  // until the worker resolves it.
  useEffect(() => {
    let cancelled = false;
    let pollId: number | null = null;
    const stopPoll = () => {
      if (pollId != null) window.clearInterval(pollId);
      pollId = null;
    };
    void (async () => {
      const res = await message<ExtensionMessageResponse>({ type: "JOB_STATE_QUERY" });
      if (cancelled || !res.ok || res.type !== "JOB_STATE_QUERY" || !res.state) return;
      const state = res.state;
      if (state.status === "running") {
        setJobAction(state.kind);
        setJobPhase("running");
        pollId = window.setInterval(async () => {
          const poll = await message<ExtensionMessageResponse>({ type: "JOB_STATE_QUERY" });
          if (cancelled || !poll.ok || poll.type !== "JOB_STATE_QUERY") return;
          if (!poll.state || poll.state.status === "running") return;
          jobResultRef.current = outcomeFromJobState(poll.state);
          setJobPhase(poll.state.status === "error" ? "error" : "done");
          stopPoll();
        }, 1500);
        return;
      }
      const outcome = outcomeFromJobState(state);
      if (!outcome || outcome.kind === "error") {
        if (outcome) setJobActionMessage(outcome.message);
        void message({ type: "JOB_STATE_CLEAR" });
        return;
      }
      setJobComplete(outcome);
    })();
    return () => {
      cancelled = true;
      stopPoll();
    };
  }, []);

  useEffect(() => {
    let scheduled = false;
    let intervalId: number | null = null;

    const resetForCurrentPage = () => {
      cancelRef.current = true;
      setError(null);
      setResult(null);
      setFields([]);
      setListOpen(true);
      setSynced(false);
      setSavedStage("applied");
      setAlreadyPresent(false);
      setTrackerQueued(false);
      setSaving(false);
      setSaveError(null);
      setJobComplete(null);
      setJobActionMessage(null);
      refreshIdentity();
      setSiteMark(pageFaviconUrl());
      updateStatus("idle");
    };

    const checkForPageChange = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        if (panelStatusIsRunning(statusRef.current)) return;
        const nextSignature = panelPageSignature();
        if (nextSignature === pageSignatureRef.current) return;
        pageSignatureRef.current = nextSignature;
        resetForCurrentPage();
      });
    };

    const observer = new MutationObserver(checkForPageChange);
    if (document.body) observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    intervalId = window.setInterval(checkForPageChange, 750);
    window.addEventListener("hashchange", checkForPageChange);
    window.addEventListener("popstate", checkForPageChange);

    return () => {
      observer.disconnect();
      if (intervalId != null) window.clearInterval(intervalId);
      window.removeEventListener("hashchange", checkForPageChange);
      window.removeEventListener("popstate", checkForPageChange);
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // While the tracker-sync banner is showing, drive the background queue to
  // a resolution instead of leaving the banner stuck forever. The background only
  // retries on its own backoff alarm (30s → … → 60m), so we kick an immediate
  // flush and then poll the queue status; once it drains we flip to "saved".
  useEffect(() => {
    if (!trackerQueued) return;
    let cancelled = false;
    let intervalId: number | null = null;

    const reconcile = async (forceRetry: boolean) => {
      const response = await message<ExtensionMessageResponse>({
        type: forceRetry ? "APPLICATION_SYNC_RETRY" : "SYNC_QUEUE_STATUS",
      });
      if (cancelled) return;
      const status =
        response.ok &&
        (response.type === "APPLICATION_SYNC_RETRY" || response.type === "SYNC_QUEUE_STATUS")
          ? response.status
          : null;
      if (status && status.pending === 0) {
        setTrackerQueued(false);
        setSynced(true);
        if (intervalId != null) window.clearInterval(intervalId);
      }
    };

    // Attempt a flush right away (covers "back online" without waiting for the alarm),
    // then keep polling the queue so the banner resolves once it syncs.
    void reconcile(true);
    intervalId = window.setInterval(() => void reconcile(true), 15_000);

    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [trackerQueued]);

  const progress = useMemo(() => {
    if (fields.length === 0) return 0;
    const completed = fields.filter((field) => ["filled", "skipped", "needs_user", "failed"].includes(field.status)).length;
    return Math.round((completed / fields.length) * 100);
  }, [fields]);

  const requiredTotal = fields.filter((field) => field.required).length;
  const requiredFilled = fields.filter((field) => field.required && field.status === "filled").length;
  const fillPercent = requiredTotal > 0 ? Math.round((requiredFilled / requiredTotal) * 100) : result && result.total > 0 ? Math.round((result.filled / result.total) * 100) : 0;
  const doneSummary =
    requiredTotal > 0
      ? `${requiredFilled}/${requiredTotal} required filled · ${fillPercent}%`
      : result && result.total > 0
        ? `${result.filled}/${result.total} fields filled · ${fillPercent}%`
        : "No fields parsed";
  const resumeName = profile?.documents.resumeName || "Resume not attached";
  const lowConfidence = fields.some((field) => field.confidence > 0 && field.confidence < 0.7);
  const resultError = error ?? result?.trackerError ?? null;
  const displayCompany = identityEdit?.company ?? identityConfirmed?.company ?? identity?.company ?? "";
  const displayRole = identityEdit?.role ?? identityConfirmed?.role ?? identity?.role ?? "";
  const identityNeedsReview = Boolean(
    identity &&
      !identityEdit &&
      !identityConfirmed &&
      identity.confidence < JOB_CONTEXT_CONFIDENCE_THRESHOLD,
  );

  async function runPanelAutofill() {
    cancelRef.current = false;
    pageSignatureRef.current = panelPageSignature();
    setError(null);
    setResult(null);
    setFields([]);
    updateStatus("scanning");
    try {
      const delegateToApplicationFrame = shouldDeferAutofillToEmbeddedApplication();
      let runResult: ExtensionAutofillRunResult;
      if (delegateToApplicationFrame) {
        // The embedded application frame runs autofill in a child frame via the background,
        // which can't stream discovered fields/status back here — so we keep a quick discovery
        // pass to preview the questions, then fill.
        const discovery = await discoverAutofillActiveTab();
        setFields(fieldsFromDiscovery(discovery));
        if (cancelRef.current) {
          updateStatus("idle");
          return;
        }
        updateStatus("filling");
        runResult = await runAutofillActiveTab({ continueSteps: false });
      } else {
        // Single pass: runAutofillPage extracts the fields once — the costly part is opening
        // each custom dropdown to read its options — streams them back via onFieldsDiscovered
        // so the panel previews the questions, then plans and fills from that same extraction.
        // A separate discovery pass would re-open every dropdown for nothing.
        runResult = await runAutofillPage({
          continueSteps: false,
          // Honor the "Generic fallback" setting; it only gates truly unknown
          // (platform === "generic") hosts, so known ATS pages fill regardless.
          forceGenericFallback: false,
          suppressAutoTrack: false,
          shouldStop: () => cancelRef.current,
          onStatus: updateStatus,
          onFieldsDiscovered: (discoveredFields) => {
            setFields(discoveredFields.map((field) => panelFieldFromPageField(field)));
          },
          onFieldStart: (field) => {
            setFields((currentFields) => {
              if (currentFields.some((currentField) => currentField.fieldId === field.fieldId)) {
                return currentFields.map((currentField) =>
                  currentField.fieldId === field.fieldId ? { ...currentField, status: "active" } : currentField,
                );
              }
              return [...currentFields, panelFieldFromPageField(field, "active")];
            });
          },
          onField: (record) => {
            setFields((currentFields) => mergePanelFieldRecord(currentFields, record));
          },
        });
      }
      if (cancelRef.current) {
        updateStatus("idle");
        return;
      }
      setFields(fieldsFromRunResult(runResult));
      setResult(runResult);
      if (runResult.total === 0 || (runResult.filled === 0 && parserFailedResult(runResult))) {
        setError(runResult.trackerError || "No application questions were parsed.");
        updateStatus("error");
      } else {
        // Only claim "saved" when the server actually persisted a row (returned an
        // applicationId). A queued retry or a swallowed {ok:false} must not read as saved.
        const tracker = runResult.tracker;
        const persisted = Boolean(tracker && tracker.applicationId);
        setSynced(autoTrack && persisted);
        setSavedStage("applied"); // autofill is sent as "submitted" → lands in the Applied column
        setAlreadyPresent(autoTrack && persisted && Boolean(tracker?.duplicate));
        setTrackerQueued(autoTrack && !persisted && Boolean(tracker?.queued));
        updateStatus("done");
      }
      void refreshProfile();
    } catch (caught) {
      updateStatus("error");
      setError(caught instanceof Error ? caught.message : "Autofill failed.");
    }
  }

  async function startSignIn() {
    setAuthError(null);
    const response = await message<ExtensionMessageResponse>({ type: "AUTH_START" });
    if (!response.ok) setAuthError(response.error);
  }

  // Kicks off tailor / cover-letter generation (a 1–2 min backend round-trip) and
  // hands the pacing over to <DocGenLoader>. We stash the outcome in a ref and only
  // flip the phase — the loader decides *when* to reveal it (min ~18s of animation),
  // then calls finishJobAction to open the file and surface the note.
  async function runJobAction(action: "tailor" | "cover-letter") {
    setJobAction(action);
    setJobPhase("running");
    setJobActionMessage(null);
    setJobComplete(null);
    jobResultRef.current = null;
    try {
      const response = await Promise.race([
        message<ExtensionMessageResponse>({ type: action === "tailor" ? "TAILOR_ACTIVE_TAB" : "COVER_LETTER_ACTIVE_TAB" }),
        timeoutResponse(130_000, "The request timed out."),
      ]);
      if (response.ok && response.type === "TAILOR_ACTIVE_TAB") {
        jobResultRef.current = {
          kind: "tailor",
          message: response.result.matchScore ? `Match score ${response.result.matchScore}%` : "Résumé tailored to this role",
          resumeUrl: response.result.resumeUrl ?? response.result.resumeDocxUrl ?? null,
          docId: response.result.docId ?? null,
        };
        setJobPhase("done");
      } else if (response.ok && response.type === "COVER_LETTER_ACTIVE_TAB") {
        jobResultRef.current = { kind: "cover-letter", message: "Cover letter ready", coverLetterUrl: response.result.coverLetterUrl ?? null };
        setJobPhase("done");
      } else {
        jobResultRef.current = { kind: "error", message: response.ok ? "Action did not return a file." : response.error };
        setJobPhase("error");
      }
    } catch (caught) {
      jobResultRef.current = { kind: "error", message: caught instanceof Error ? caught.message : "Action failed." };
      setJobPhase("error");
    }
  }

  // Called by <DocGenLoader> once its progress animation lands (100% on success, or
  // after a short beat on error). Tears down the loader and reveals the Edit/Download
  // completion card; the persisted background state has been consumed, so clear it.
  function finishJobAction() {
    const result = jobResultRef.current;
    jobResultRef.current = null;
    setJobAction(null);
    setJobPhase("running");
    if (!result) return;
    if (result.kind === "error") {
      // Don't persist a failed run — surface the note once and drop it.
      setJobActionMessage(result.message);
      void message({ type: "JOB_STATE_CLEAR" });
    } else {
      // Keep the persisted state so the completion card survives a reload/reopen
      // until the user acts on it; dismissJobComplete clears it.
      setJobComplete(result);
    }
  }

  function dismissJobComplete() {
    setJobComplete(null);
    void message({ type: "JOB_STATE_CLEAR" });
  }

  if (dismissed) return null;

  if (collapsed) {
    return (
      <div className="jp-tab-handle" style={{ top: `${handleTop}%` }}>
        <div className="jp-collapse-wrap">
          <button
            type="button"
            className="jp-collapse-tab"
            title="Open JobPosted · drag to move"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
          >
            <span className="jp-collapse-mark">
              <img src={assetUrl("brand/jobposted-mark.png")} alt="" />
              {siteMark ? (
                <span className="jp-collapse-badge">
                  <img src={siteMark} alt="" onError={() => setSiteMark(null)} />
                </span>
              ) : null}
            </span>
            <span className="jp-handle-grip" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </span>
          </button>
          <button
            type="button"
            className="jp-handle-close"
            title="Hide on this page"
            aria-label="Hide JobPosted on this page"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setDismissed(true)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const groups = groupedFields(fields);
  const filling = panelStatusIsRunning(status);

  return (
    <aside className="jp-panel" aria-label="JobPosted autofill panel">
      <div className="jp-panel-col">
      <header className="jp-panel-header">
        <div className="jp-brand">
          <span className="jp-brand-mark">
            <img src={assetUrl("brand/jobposted-mark.png")} alt="" />
          </span>
          <div>
            <strong>JobPosted</strong>
            <span>{status === "done" && result ? doneSummary : "Application copilot"}</span>
          </div>
        </div>
        <div className="jp-header-actions">
          <button type="button" className="jp-text-action" onClick={() => window.open("mailto:feedback@jobposted.app", "_blank")}>
            Feedback
          </button>
          <button type="button" className="jp-icon-action" title="Settings" onClick={() => { if (extensionContextValid()) chrome.runtime.openOptionsPage(); }}>
            <Settings aria-hidden="true" />
          </button>
          <button type="button" className="jp-icon-action" title="Collapse" onClick={() => setCollapsed(true)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="jp-panel-scroll">
        {authError ? (
          <section className="jp-message jp-message-warn jp-rise">
            <AlertTriangle aria-hidden="true" />
            <span>{authError}</span>
            <button type="button" onClick={() => void startSignIn()}>Connect</button>
          </section>
        ) : null}

        {tab === "profile" ? <ProfileTab profile={profile} onCopy={copyToClipboard} /> : null}

        {tab === "tracker" ? <TrackerTab onOpen={(url) => void message({ type: "OPEN_TAB", url })} /> : null}

        {tab === "autofill" ? (
        <>
        {identity ? (
          <JobIdentityCard
            company={displayCompany}
            role={displayRole}
            location={identity.location}
            needsReview={identityNeedsReview}
            editing={Boolean(identityEdit)}
            draft={identityEdit ?? { company: displayCompany, role: displayRole }}
            onEditStart={startIdentityEdit}
            onDraftChange={setIdentityEdit}
            onSave={saveIdentityEdit}
            onCancel={() => setIdentityEdit(null)}
          />
        ) : null}

        {status === "idle" && jobAction ? (
          <div className="jp-panel-body">
            <DocGenLoader variant={jobAction} phase={jobPhase} onFinish={finishJobAction} />
          </div>
        ) : null}

        {status === "idle" && !jobAction && jobComplete ? (
          <div className="jp-panel-body">
            <JobCompleteCard
              data={jobComplete}
              onEdit={() => void message({ type: "OPEN_TAB", url: rezoomedEditUrl(jobComplete.kind === "tailor" ? jobComplete.docId : null) })}
              onOpen={() => {
                const url = jobComplete.kind === "tailor" ? jobComplete.resumeUrl : jobComplete.coverLetterUrl;
                if (url) void message({ type: "OPEN_TAB", url });
              }}
              onDismiss={dismissJobComplete}
            />
          </div>
        ) : null}

        {status === "idle" && !jobAction && !jobComplete && (
          <div className="jp-panel-body">
            <div className="jp-action-group">
              <button type="button" className="jp-autofill-button" disabled={Boolean(authError)} onClick={() => void runPanelAutofill()}>
                <Wand2 aria-hidden="true" />
                Autofill this page
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={autoTrack}
                className={`jp-autotrack${autoTrack ? " jp-autotrack-on" : ""}`}
                onClick={() => void toggleAutoTrack(!autoTrack)}
              >
                <ClipboardCheck aria-hidden="true" />
                <span className="jp-autotrack-label">Auto-add to job tracker</span>
                <span className="jp-switch jp-switch-sm" aria-hidden="true">
                  <span className="jp-switch-knob" />
                </span>
              </button>
            </div>

            <button
              type="button"
              className={`jp-save-button${synced ? " jp-save-button-done" : ""}`}
              disabled={Boolean(authError) || saving || synced}
              onClick={() => void saveJobToTracker()}
            >
              {saving ? (
                <Loader2 className="jp-spin" aria-hidden="true" />
              ) : synced ? (
                <BookmarkCheck aria-hidden="true" />
              ) : (
                <Bookmark aria-hidden="true" />
              )}
              {saving ? "Saving…" : synced ? "Saved to tracker" : "Save to tracker"}
            </button>

            {saveError ? (
              <div className="jp-message jp-message-warn">
                <AlertTriangle aria-hidden="true" />
                <span>{saveError}</span>
              </div>
            ) : null}

            <DocCard
              variant="resume"
              label="Tailor my résumé"
              file={resumeName}
              busy={jobAction === "tailor"}
              onAction={() => void runJobAction("tailor")}
            />
            <DocCard
              variant="letter"
              label="Write a cover letter"
              file={profile?.documents.coverLetterName || "Cover letter"}
              busy={jobAction === "cover-letter"}
              onAction={() => void runJobAction("cover-letter")}
            />

            {jobActionMessage ? (
              <div className="jp-action-note">
                <Sparkles aria-hidden="true" />
                <span>{jobActionMessage}</span>
              </div>
            ) : null}
          </div>
        )}

        {status === "scanning" || status === "planning" ? (
          <div className="jp-panel-body jp-fill-body">
            <div className="jp-progress-head">
              <strong>{fields.length > 0 ? `${fields.length} questions parsed` : "Parsing questions"}</strong>
              <button type="button" className="jp-cancel" onClick={() => { cancelRef.current = true; updateStatus("idle"); }}>
                Cancel
              </button>
            </div>
            <div className="jp-progress jp-progress-live"><div style={{ width: fields.length > 0 ? (status === "planning" ? "64%" : "34%") : "12%" }} /></div>
            <div className="jp-parse-caption">{status === "planning" ? "Building answers from parsed questions" : "Reading the application frame"}</div>
            {fields.length > 0 ? (
              <div className="jp-checklist">
                <ChecklistGroup title="Required" fields={groups.required} />
                <ChecklistGroup title="Optional" fields={groups.optional} />
              </div>
            ) : (
              <div className="jp-empty-state">Looking for application questions…</div>
            )}
          </div>
        ) : null}

        {status === "filling" || status === "done" || status === "error" ? (
          <div className="jp-panel-body jp-fill-body">
            <div className="jp-progress-head">
              <strong>{status === "done" ? "All set" : status === "error" ? "Needs review" : `Autofilling ${progress}%`}</strong>
              {filling ? (
                <button type="button" className="jp-cancel" onClick={() => { cancelRef.current = true; }}>
                  Cancel
                </button>
              ) : (
                <button type="button" className="jp-icon-action" title={listOpen ? "Collapse list" : "Expand list"} onClick={() => setListOpen((value) => !value)}>
                  {listOpen ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
                </button>
              )}
            </div>
            <div className={`jp-progress${filling ? " jp-progress-live" : ""}`}><div style={{ width: `${Math.max(4, progress || fillPercent)}%` }} /></div>
            {lowConfidence && (
              <div className="jp-review-pill">
                <AlertTriangle aria-hidden="true" />
                <span>Review amber fields before submit</span>
              </div>
            )}
            {resultError && (
              <div className="jp-message jp-message-warn">
                <AlertTriangle aria-hidden="true" />
                <span>{resultError}</span>
              </div>
            )}
            {!filling ? (
              <button type="button" className="jp-autofill-button" disabled={Boolean(authError)} onClick={() => void runPanelAutofill()}>
                <Wand2 aria-hidden="true" />
                Autofill this page
              </button>
            ) : null}
            {listOpen && (
              <div className="jp-checklist">
                <ChecklistGroup title="Required" fields={groups.required} />
                <ChecklistGroup title="Optional" fields={groups.optional} />
              </div>
            )}
          </div>
        ) : null}
        </>
        ) : null}
      </div>

      {tab === "autofill" ? (
      <footer className="jp-panel-footer">
        {synced ? (
          <div className="jp-synced jp-rise">
            <ClipboardCheck aria-hidden="true" />
            <span>
              {alreadyPresent
                ? "Already in your tracker"
                : `Saved to tracker · ${savedStage === "applied" ? "Applied" : "To review"}`}
            </span>
            <button type="button" onClick={() => window.open(`${JOBPOSTED_WEB_ORIGIN}/dashboard/tracker`, "_blank")}>
              View
            </button>
          </div>
        ) : trackerQueued ? (
          <div className="jp-foot-hint jp-rise">
            <Loader2 className="jp-spin" aria-hidden="true" />
            <span>{online ? "Saving to your tracker…" : "You’re offline — we’ll save to your tracker once you reconnect."}</span>
          </div>
        ) : resultError ? (
          <div className="jp-synced jp-synced-error jp-rise">
            <AlertTriangle aria-hidden="true" />
            <span>Couldn’t save to tracker. {resultError}</span>
          </div>
        ) : (
          <div className="jp-foot-hint">
            <Check aria-hidden="true" />
            <span>Fills locally — you stay in control and click submit.</span>
          </div>
        )}
      </footer>
      ) : null}
      </div>

      <nav className="jp-rail" role="tablist" aria-label="Panel sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "autofill"}
          className={`jp-rail-tab${tab === "autofill" ? " jp-rail-tab-on" : ""}`}
          onClick={() => setTab("autofill")}
        >
          <Wand2 aria-hidden="true" />
          <span>Autofill</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tracker"}
          className={`jp-rail-tab${tab === "tracker" ? " jp-rail-tab-on" : ""}`}
          onClick={() => setTab("tracker")}
        >
          <ListChecks aria-hidden="true" />
          <span>Track</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "profile"}
          className={`jp-rail-tab${tab === "profile" ? " jp-rail-tab-on" : ""}`}
          onClick={() => setTab("profile")}
        >
          <User aria-hidden="true" />
          <span>Profile</span>
        </button>
      </nav>
    </aside>
  );
}

function DocCard({
  variant,
  label,
  file,
  busy,
  onAction,
}: {
  variant: "resume" | "letter";
  label: string;
  file: string;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <button
      type="button"
      className={`jp-gen-card jp-gen-${variant}${busy ? " jp-gen-busy" : ""}`}
      disabled={busy}
      onClick={onAction}
    >
      <span className="jp-gen-doc" aria-hidden="true">
        <span className="jp-gen-sheet jp-gen-sheet-back" />
        <span className="jp-gen-sheet jp-gen-sheet-front">
          {variant === "letter" ? (
            <>
              <span className="jp-gen-line jp-gen-line-date" />
              <span className="jp-gen-line" />
              <span className="jp-gen-line" />
              <span className="jp-gen-line jp-gen-line-short" />
              <span className="jp-gen-line jp-gen-sign" />
            </>
          ) : (
            <>
              <span className="jp-gen-line jp-gen-line-head" />
              <span className="jp-gen-line" />
              <span className="jp-gen-line" />
              <span className="jp-gen-line jp-gen-line-short" />
            </>
          )}
          <span className="jp-gen-scan" />
        </span>
      </span>

      <span className="jp-gen-text">
        <span className="jp-gen-title">
          {busy ? (variant === "letter" ? "Writing…" : "Tailoring…") : label}
        </span>
        <span className="jp-gen-file">{file}</span>
      </span>

      <span className="jp-gen-go" aria-hidden="true">
        {busy ? <Loader2 className="jp-spin" /> : <ArrowRight />}
      </span>
    </button>
  );
}

const GEN_COPY = {
  tailor: {
    title: "Tailoring your résumé",
    ready: "Résumé ready — opening",
    steps: [
      { at: 0, label: "Reading the job description" },
      { at: 16, label: "Extracting key requirements" },
      { at: 34, label: "Matching your experience" },
      { at: 55, label: "Tailoring with Frontier AI" },
      { at: 96, label: "Finalizing your résumé" },
    ],
  },
  "cover-letter": {
    title: "Writing your cover letter",
    ready: "Letter ready — opening",
    steps: [
      { at: 0, label: "Reading the job description" },
      { at: 16, label: "Understanding the role & company" },
      { at: 34, label: "Reviewing your background" },
      { at: 55, label: "Drafting with Frontier AI" },
      { at: 96, label: "Polishing the final letter" },
    ],
  },
} as const;

const GEN_RING_R = 52;
const GEN_RING_C = 2 * Math.PI * GEN_RING_R;

// Progress ceiling never finishes on its own — it eases toward ~90% while we wait on
// the backend, so a genuine 60–120s round-trip stays believable. Once `phase` flips to
// "done" we gate the final sprint to 100% behind GEN_MIN_MS so even a fast reply still
// reads as real work; a short RAF loop drives the whole thing (monotonic, never rewinds).
const GEN_MIN_MS = 18_000;

// The revealed result of a finished tailor/cover run — drives the completion card and
// is reconstructed from persisted background state on panel recovery.
type JobOutcome =
  | { kind: "tailor"; message: string; resumeUrl: string | null; docId: string | null }
  | { kind: "cover-letter"; message: string; coverLetterUrl: string | null }
  | { kind: "error"; message: string };

function outcomeFromJobState(state: ExtensionJobState): JobOutcome | null {
  if (state.status === "error") return { kind: "error", message: state.error ?? "Action failed." };
  if (state.status !== "done") return null;
  if (state.kind === "tailor" && state.tailor) {
    return {
      kind: "tailor",
      message: state.tailor.matchScore ? `Match score ${state.tailor.matchScore}%` : "Résumé tailored to this role",
      resumeUrl: state.tailor.resumeUrl ?? state.tailor.resumeDocxUrl ?? null,
      docId: state.tailor.docId ?? null,
    };
  }
  if (state.kind === "cover-letter" && state.coverLetter) {
    return { kind: "cover-letter", message: "Cover letter ready", coverLetterUrl: state.coverLetter.coverLetterUrl ?? null };
  }
  return null;
}

function rezoomedEditUrl(docId: string | null) {
  return docId
    ? `${REZOOMED_WEB_ORIGIN}${REZOOMED_BUILDER_IMPORT_PATH}?doc=${encodeURIComponent(docId)}`
    : `${REZOOMED_WEB_ORIGIN}/dashboard/builder/new`;
}

// Writes to the clipboard from the content script. The async Clipboard API works on a
// user gesture in most hosts; the hidden-textarea path covers the rest.
async function copyToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Clipboard API can reject on some hosts — fall through to execCommand.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function joinDates(start?: string | null, end?: string | null, current?: boolean | null): string {
  const from = (start ?? "").trim();
  const to = current ? "Present" : (end ?? "").trim();
  return from && to ? `${from} – ${to}` : from || to;
}

function formatExperienceText(item: MasterProfileExperience): string {
  const head = [item.title, item.company].filter(Boolean).join(" — ");
  const meta = [joinDates(item.startDate, item.endDate, item.current), item.location ?? ""].filter(Boolean).join(" · ");
  const bullets = (item.bullets ?? []).filter(Boolean).map((bullet) => `• ${bullet}`);
  return [head, meta, ...bullets].filter(Boolean).join("\n");
}

function formatEducationText(item: MasterProfileEducation): string {
  const degree = [item.degree, item.field].filter(Boolean).join(", ");
  const line = [degree, item.school].filter(Boolean).join(" — ");
  const meta = [joinDates(item.startDate, item.endDate), item.gpa ? `GPA ${item.gpa}` : ""].filter(Boolean).join(" · ");
  return [line, meta].filter(Boolean).join("\n");
}

function formatProjectText(item: MasterProfileProject): string {
  const head = [item.name, item.url ?? ""].filter(Boolean).join(" · ");
  const tech = (item.technologies ?? []).filter(Boolean);
  const bullets = (item.bullets ?? []).filter(Boolean).map((bullet) => `• ${bullet}`);
  return [head, item.description ?? "", tech.length ? `Tech: ${tech.join(", ")}` : "", ...bullets]
    .filter(Boolean)
    .join("\n");
}

function DocGenLoader({
  variant,
  phase,
  onFinish,
}: {
  variant: "tailor" | "cover-letter";
  phase: "running" | "done" | "error";
  onFinish: () => void;
}) {
  const copy = GEN_COPY[variant];
  const [pct, setPct] = useState(0);
  const pctRef = useRef(0);
  const phaseRef = useRef(phase);
  const onFinishRef = useRef(onFinish);
  const startRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    let raf = 0;
    let finishTimer = 0;
    const scheduleFinish = (delay: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      finishTimer = window.setTimeout(() => onFinishRef.current(), delay);
    };
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const ph = phaseRef.current;
      const current = pctRef.current;

      if (ph === "error") {
        // Don't fake a completion — freeze the ring where it is and hand back so the
        // parent can surface the real error note.
        scheduleFinish(1400);
        return;
      }

      let target: number;
      let k: number;
      if (ph === "done" && elapsed >= GEN_MIN_MS) {
        target = 100;
        k = 0.14; // satisfying final sprint
      } else if (ph === "done") {
        target = 96 * (1 - Math.exp(-elapsed / 15_000)); // creep past the plateau while gated
        k = 0.06;
      } else {
        target = 90 * (1 - Math.exp(-elapsed / 21_000)); // asymptotic wait — never reaches 90
        k = 0.05;
      }

      let next = current;
      if (target > next) next = next + (target - next) * k;

      if (ph === "done" && elapsed >= GEN_MIN_MS && next >= 99.6) {
        pctRef.current = 100;
        setPct(100);
        scheduleFinish(520);
        return;
      }

      pctRef.current = next;
      setPct(Math.round(next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(finishTimer);
    };
  }, []);

  const isError = phase === "error";
  const complete = pct >= 100;
  let activeIndex = 0;
  copy.steps.forEach((step, i) => {
    if (pct >= step.at) activeIndex = i;
  });

  return (
    <div className={`jp-gl${isError ? " jp-gl-error" : ""}${complete ? " jp-gl-done" : ""}`}>
      <div className="jp-gl-ring-wrap">
        <svg className="jp-gl-ring" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id="jpGlGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5b9dff" />
              <stop offset="0.55" stopColor="#2f6bf0" />
              <stop offset="1" stopColor="#1846b8" />
            </linearGradient>
          </defs>
          <circle className="jp-gl-track" cx="60" cy="60" r={GEN_RING_R} />
          <circle
            className="jp-gl-bar"
            cx="60"
            cy="60"
            r={GEN_RING_R}
            style={{ strokeDasharray: GEN_RING_C, strokeDashoffset: GEN_RING_C * (1 - Math.min(pct, 100) / 100) }}
          />
        </svg>
        <span className="jp-gl-orbit" aria-hidden="true" />
        <div className="jp-gl-center" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          {isError ? (
            <AlertTriangle className="jp-gl-center-warn" aria-hidden="true" />
          ) : complete ? (
            <Check className="jp-gl-center-check" aria-hidden="true" />
          ) : (
            <span className="jp-gl-num">
              <span className="jp-gl-pct">{pct}</span>
              <span className="jp-gl-unit">%</span>
            </span>
          )}
        </div>
      </div>

      <div className="jp-gl-title">{isError ? "Something went wrong" : complete ? copy.ready : copy.title}</div>

      <ol className="jp-gl-steps">
        {copy.steps.map((step, i) => {
          const state = isError
            ? i < activeIndex
              ? "done"
              : i === activeIndex
                ? "error"
                : "todo"
            : complete || i < activeIndex
              ? "done"
              : i === activeIndex
                ? "active"
                : "todo";
          return (
            <li key={step.label} className={`jp-gl-step jp-gl-step-${state}`}>
              <span className="jp-gl-step-dot" aria-hidden="true">
                {state === "done" ? <Check /> : state === "error" ? <X /> : state === "active" ? <span className="jp-gl-step-pulse" /> : null}
              </span>
              <span className="jp-gl-step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="jp-gl-foot">
        <Sparkles aria-hidden="true" />
        <span>{isError ? "Please try again in a moment" : "Powered by Frontier AI · this can take up to a minute"}</span>
      </div>
    </div>
  );
}

function JobCompleteCard({
  data,
  onEdit,
  onOpen,
  onDismiss,
}: {
  data: Extract<JobOutcome, { kind: "tailor" | "cover-letter" }>;
  onEdit: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const isResume = data.kind === "tailor";
  return (
    <div className="jp-done-card">
      <div className="jp-done-top">
        <button type="button" className="jp-done-back" onClick={onDismiss}>
          <ChevronLeft aria-hidden="true" />
          Back
        </button>
      </div>
      <span className="jp-done-badge" aria-hidden="true">
        <Check />
      </span>
      <div className="jp-done-head">
        <strong>{isResume ? "Résumé tailored" : "Cover letter ready"}</strong>
        <span>{data.message}</span>
      </div>
      <div className="jp-done-actions">
        {isResume ? (
          <>
            <button type="button" className="jp-done-primary" onClick={onEdit}>
              <Pencil aria-hidden="true" />
              Edit in Rezoomed
            </button>
            <button type="button" className="jp-done-secondary" onClick={onOpen}>
              <Download aria-hidden="true" />
              Download
            </button>
          </>
        ) : (
          <button type="button" className="jp-done-primary" onClick={onOpen}>
            <Download aria-hidden="true" />
            Open cover letter
          </button>
        )}
      </div>
      {isResume ? <p className="jp-done-hint">Opens in the Rezoomed builder with Jake&apos;s template, pre-filled.</p> : null}
    </div>
  );
}

type CopyFn = (text: string) => Promise<boolean>;

function CopyButton({ text, onCopy, label }: { text: string; onCopy: CopyFn; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  async function run() {
    if (!(await onCopy(text))) return;
    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <button
      type="button"
      className={`jp-copy-btn${copied ? " jp-copy-done" : ""}${label ? " jp-copy-btn-label" : ""}`}
      title="Copy"
      aria-label={label ? undefined : "Copy"}
      onClick={() => void run()}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </button>
  );
}

function ProfileSection({
  icon,
  title,
  copyText,
  onCopy,
  children,
}: {
  icon: ReactNode;
  title: string;
  copyText: string;
  onCopy: CopyFn;
  children: ReactNode;
}) {
  return (
    <section className="jp-pf-section">
      <div className="jp-pf-section-head">
        <span className="jp-pf-section-title">{icon}{title}</span>
        {copyText.trim() ? <CopyButton text={copyText} onCopy={onCopy} label="Copy all" /> : null}
      </div>
      {children}
    </section>
  );
}

function ProfileTab({ profile, onCopy }: { profile: MasterProfile | null; onCopy: CopyFn }) {
  if (!profile) {
    return (
      <div className="jp-profile-empty jp-rise">
        <User aria-hidden="true" />
        <strong>Your profile</strong>
        <span>Connect JobPosted to load your saved setup — experience, education, projects and more, ready to copy into any application.</span>
      </div>
    );
  }

  const { identity, location, links, summary, experience, education, projects, skills, answers } = profile;
  const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(" ");
  const locationLine = [location.city, location.state, location.country].filter(Boolean).join(", ");
  const contactRows = [
    { label: "Name", value: fullName },
    { label: "Email", value: identity.email ?? "" },
    { label: "Phone", value: identity.phone ?? "" },
    { label: "Location", value: locationLine },
    { label: "LinkedIn", value: links.linkedin ?? "" },
    { label: "GitHub", value: links.github ?? "" },
    { label: "Portfolio", value: links.portfolio ?? "" },
    ...(links.website ?? []).map((site) => ({ label: "Website", value: site })),
  ].filter((row) => row.value.trim());

  const projectList = projects ?? [];
  const hasAny =
    contactRows.length > 0 ||
    Boolean(summary) ||
    experience.length > 0 ||
    education.length > 0 ||
    projectList.length > 0 ||
    skills.length > 0 ||
    answers.length > 0;

  if (!hasAny) {
    return (
      <div className="jp-profile-empty jp-rise">
        <User aria-hidden="true" />
        <strong>Nothing saved yet</strong>
        <span>Add your experience, education and projects in JobPosted setup and they’ll show up here to copy.</span>
        <button type="button" className="jp-pf-open" onClick={() => window.open(`${JOBPOSTED_WEB_ORIGIN}/dashboard`, "_blank")}>
          Open JobPosted
        </button>
      </div>
    );
  }

  return (
    <div className="jp-profile jp-rise">
      <p className="jp-profile-hint">
        <Copy aria-hidden="true" />
        Select any text to copy, or tap a copy button.
      </p>

      {contactRows.length ? (
        <ProfileSection icon={<User aria-hidden="true" />} title="Contact" onCopy={onCopy} copyText={contactRows.map((row) => `${row.label}: ${row.value}`).join("\n")}>
          <dl className="jp-pf-fields">
            {contactRows.map((row) => (
              <div className="jp-pf-field" key={row.label + row.value}>
                <dt>{row.label}</dt>
                <dd>
                  <span className="jp-pf-selectable">{row.value}</span>
                  <CopyButton text={row.value} onCopy={onCopy} />
                </dd>
              </div>
            ))}
          </dl>
        </ProfileSection>
      ) : null}

      {summary ? (
        <ProfileSection icon={<FileText aria-hidden="true" />} title="Summary" onCopy={onCopy} copyText={summary}>
          <p className="jp-pf-para jp-pf-selectable">{summary}</p>
        </ProfileSection>
      ) : null}

      {experience.length ? (
        <ProfileSection icon={<Briefcase aria-hidden="true" />} title="Experience" onCopy={onCopy} copyText={experience.map(formatExperienceText).join("\n\n")}>
          {experience.map((item, index) => (
            <article className="jp-pf-item" key={`${item.company}-${index}`}>
              <div className="jp-pf-item-head">
                <div className="jp-pf-item-title jp-pf-selectable">
                  <strong>{[item.title, item.company].filter(Boolean).join(" · ")}</strong>
                  <span className="jp-pf-meta">{[joinDates(item.startDate, item.endDate, item.current), item.location ?? ""].filter(Boolean).join(" · ")}</span>
                </div>
                <CopyButton text={formatExperienceText(item)} onCopy={onCopy} />
              </div>
              {item.bullets?.length ? (
                <ul className="jp-pf-bullets jp-pf-selectable">
                  {item.bullets.filter(Boolean).map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </ProfileSection>
      ) : null}

      {education.length ? (
        <ProfileSection icon={<GraduationCap aria-hidden="true" />} title="Education" onCopy={onCopy} copyText={education.map(formatEducationText).join("\n\n")}>
          {education.map((item, index) => (
            <article className="jp-pf-item" key={`${item.school}-${index}`}>
              <div className="jp-pf-item-head">
                <div className="jp-pf-item-title jp-pf-selectable">
                  <strong>{[item.degree, item.field].filter(Boolean).join(", ") || item.school}</strong>
                  <span className="jp-pf-meta">{[item.school, joinDates(item.startDate, item.endDate), item.gpa ? `GPA ${item.gpa}` : ""].filter(Boolean).join(" · ")}</span>
                </div>
                <CopyButton text={formatEducationText(item)} onCopy={onCopy} />
              </div>
            </article>
          ))}
        </ProfileSection>
      ) : null}

      {projectList.length ? (
        <ProfileSection icon={<FolderGit2 aria-hidden="true" />} title="Projects" onCopy={onCopy} copyText={projectList.map(formatProjectText).join("\n\n")}>
          {projectList.map((item, index) => (
            <article className="jp-pf-item" key={`${item.name}-${index}`}>
              <div className="jp-pf-item-head">
                <div className="jp-pf-item-title jp-pf-selectable">
                  <strong>{item.name}</strong>
                  {item.technologies?.length ? <span className="jp-pf-meta">{item.technologies.join(", ")}</span> : null}
                </div>
                <CopyButton text={formatProjectText(item)} onCopy={onCopy} />
              </div>
              {item.description ? <p className="jp-pf-para jp-pf-selectable">{item.description}</p> : null}
              {item.bullets?.length ? (
                <ul className="jp-pf-bullets jp-pf-selectable">
                  {item.bullets.filter(Boolean).map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </ProfileSection>
      ) : null}

      {skills.length ? (
        <ProfileSection icon={<Wrench aria-hidden="true" />} title="Skills" onCopy={onCopy} copyText={skills.join(", ")}>
          <div className="jp-pf-chips jp-pf-selectable">
            {skills.map((skill, index) => (
              <span className="jp-pf-chip" key={`${skill}-${index}`}>{skill}</span>
            ))}
          </div>
        </ProfileSection>
      ) : null}

      {answers.length ? (
        <ProfileSection icon={<MessageSquareText aria-hidden="true" />} title="Saved answers" onCopy={onCopy} copyText={answers.map((answer) => `${answer.prompt}\n${answer.value}`).join("\n\n")}>
          {answers.map((answer) => (
            <article className="jp-pf-item" key={answer.key}>
              <div className="jp-pf-item-head">
                <div className="jp-pf-item-title jp-pf-selectable"><strong>{answer.prompt}</strong></div>
                <CopyButton text={answer.value} onCopy={onCopy} />
              </div>
              <p className="jp-pf-para jp-pf-selectable">{answer.value}</p>
            </article>
          ))}
        </ProfileSection>
      ) : null}
    </div>
  );
}

const TRACKER_STAGES: { key: string; label: string }[] = [
  { key: "inbox", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "closed", label: "Closed" },
];

function trackerStageKey(stage: string): string {
  return TRACKER_STAGES.some((entry) => entry.key === stage) ? stage : "inbox";
}

function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk${weeks > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

function TrackerTab({ onOpen }: { onOpen: (url: string) => void }) {
  const [items, setItems] = useState<ExtensionTrackerItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await message<ExtensionMessageResponse>({ type: "TRACKER_LIST" });
      if (cancelled) return;
      if (response.ok && response.type === "TRACKER_LIST") {
        setItems(response.items);
      } else {
        setItems([]);
        setError(response.ok ? null : response.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = items ?? [];
  const counts = useMemo(() => {
    const next: Record<string, number> = { all: list.length };
    for (const stage of TRACKER_STAGES) next[stage.key] = 0;
    for (const item of list) next[trackerStageKey(item.stage)] += 1;
    return next;
  }, [list]);
  const filtered = filter === "all" ? list : list.filter((item) => trackerStageKey(item.stage) === filter);

  function applyUpdate(updated: ExtensionTrackerItem) {
    setItems((prev) => (prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev));
  }

  if (items === null) {
    return (
      <div className="jp-tracker-empty">
        <Loader2 className="jp-spin" aria-hidden="true" />
        <span>Loading your tracker…</span>
      </div>
    );
  }

  return (
    <div className="jp-tracker jp-rise">
      <div className="jp-tk-tabs" role="tablist" aria-label="Application status">
        <button type="button" className={`jp-tk-tab${filter === "all" ? " jp-tk-tab-on" : ""}`} onClick={() => setFilter("all")}>
          All <em>{counts.all}</em>
        </button>
        {TRACKER_STAGES.map((stage) => (
          <button
            key={stage.key}
            type="button"
            className={`jp-tk-tab${filter === stage.key ? " jp-tk-tab-on" : ""}`}
            onClick={() => setFilter(stage.key)}
          >
            {stage.label} <em>{counts[stage.key] ?? 0}</em>
          </button>
        ))}
      </div>

      {error ? (
        <div className="jp-message jp-message-warn">
          <AlertTriangle aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="jp-tracker-empty">
          <ListChecks aria-hidden="true" />
          <strong>{list.length === 0 ? "No tracked jobs yet" : "Nothing here"}</strong>
          <span>{list.length === 0 ? "Autofill or save a job and it’ll show up here." : "No applications in this status."}</span>
        </div>
      ) : (
        <div className="jp-tk-list">
          {filtered.map((item) => (
            <TrackerCard key={item.id} item={item} onOpen={onOpen} onUpdate={applyUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrackerCard({
  item,
  onOpen,
  onUpdate,
}: {
  item: ExtensionTrackerItem;
  onOpen: (url: string) => void;
  onUpdate: (item: ExtensionTrackerItem) => void;
}) {
  const [panel, setPanel] = useState<"none" | "mark" | "note" | "resume">("none");
  const [noteDraft, setNoteDraft] = useState(item.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [resumes, setResumes] = useState<ExtensionResumeOption[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mono = monogramFor(item.company);
  const stageKey = trackerStageKey(item.stage);
  const stageLabel = TRACKER_STAGES.find((entry) => entry.key === stageKey)?.label ?? "Saved";

  async function patch(payload: { stage?: string; notes?: string | null; resumeDocId?: string | null }): Promise<boolean> {
    setBusy(true);
    const response = await message<ExtensionMessageResponse>({ type: "TRACKER_UPDATE", id: item.id, ...payload });
    setBusy(false);
    if (response.ok && response.type === "TRACKER_UPDATE" && response.item) {
      onUpdate(response.item);
      return true;
    }
    return false;
  }

  async function openResumePanel() {
    const next = panel === "resume" ? "none" : "resume";
    setPanel(next);
    if (next === "resume" && resumes === null) {
      const response = await message<ExtensionMessageResponse>({ type: "RESUME_LIST" });
      setResumes(response.ok && response.type === "RESUME_LIST" ? response.resumes : []);
    }
  }

  async function attachResume(resumeDocId: string) {
    if (await patch({ resumeDocId })) setPanel("none");
  }

  async function handleResumeFile(file: File) {
    setUploadError(null);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setUploadError("Please choose a PDF file.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError("PDF is too large (max 3 MB).");
      return;
    }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result.split(",")[1] ?? "" : "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (!dataBase64) {
        setUploadError("Could not read the file.");
        return;
      }
      const response = await message<ExtensionMessageResponse>({ type: "RESUME_UPLOAD", name: file.name, dataBase64 });
      if (response.ok && response.type === "RESUME_UPLOAD" && response.resume) {
        const uploaded = response.resume;
        setResumes((prev) => [uploaded, ...(prev ?? [])]);
        await attachResume(uploaded.id);
      } else {
        setUploadError(response.ok ? "Upload failed." : response.error);
      }
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function saveNote() {
    if (await patch({ notes: noteDraft.trim() ? noteDraft.trim() : null })) setPanel("none");
  }

  return (
    <article className="jp-tk-card">
      <div className="jp-tk-card-main">
        <span className="jp-tk-logo" aria-hidden="true">
          {item.companyLogoUrl && logoOk ? (
            <img src={item.companyLogoUrl} alt="" onError={() => setLogoOk(false)} />
          ) : (
            <span className="jp-tk-mono" style={{ background: `hsl(${mono.hue} 68% 92%)`, color: `hsl(${mono.hue} 52% 32%)` }}>
              {mono.letter || <Building2 aria-hidden="true" />}
            </span>
          )}
        </span>
        <div className="jp-tk-card-body">
          <div className="jp-tk-card-top">
            <strong>{item.company}</strong>
            {item.matchScore > 0 ? (
              <span className="jp-tk-match"><CheckCircle2 aria-hidden="true" />{item.matchScore}%</span>
            ) : null}
          </div>
          <div className="jp-tk-role">{item.role}</div>
          <div className="jp-tk-meta">
            <span className={`jp-tk-stage jp-tk-stage-${stageKey}`}>{stageLabel}</span>
            {relativeDay(item.updatedAt) ? <span className="jp-tk-ago">{relativeDay(item.updatedAt)}</span> : null}
          </div>
        </div>
        {item.jobUrl ? (
          <button type="button" className="jp-tk-open" title="Open job" aria-label="Open job" onClick={() => item.jobUrl && onOpen(item.jobUrl)}>
            <ExternalLink aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {item.notes && panel !== "note" ? <p className="jp-tk-note-preview">{item.notes}</p> : null}

      {item.resumeDocId ? (
        <div className="jp-tk-resume">
          <FileText aria-hidden="true" />
          <span>{item.resumeName}</span>
        </div>
      ) : null}

      <div className="jp-tk-actions">
        <button
          type="button"
          className={`jp-tk-action${panel === "mark" ? " jp-tk-action-on" : ""}`}
          onClick={() => setPanel(panel === "mark" ? "none" : "mark")}
        >
          <CircleCheck aria-hidden="true" />
          Mark as
          <ChevronDown aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`jp-tk-action${panel === "note" ? " jp-tk-action-on" : ""}`}
          onClick={() => {
            setNoteDraft(item.notes ?? "");
            setPanel(panel === "note" ? "none" : "note");
          }}
        >
          <StickyNote aria-hidden="true" />
          {item.notes ? "Edit note" : "Add note"}
        </button>
        <button
          type="button"
          className={`jp-tk-action${panel === "resume" ? " jp-tk-action-on" : ""}`}
          onClick={() => void openResumePanel()}
        >
          <FileText aria-hidden="true" />
          Resume
        </button>
      </div>

      {panel === "mark" ? (
        <div className="jp-tk-markmenu">
          {TRACKER_STAGES.map((stage) => (
            <button
              key={stage.key}
              type="button"
              className={`jp-tk-markopt${stageKey === stage.key ? " jp-tk-markopt-on" : ""}`}
              disabled={busy}
              onClick={() => {
                setPanel("none");
                void patch({ stage: stage.key });
              }}
            >
              <span className={`jp-tk-dot jp-tk-dot-${stage.key}`} aria-hidden="true" />
              {stage.label}
              {stageKey === stage.key ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}

      {panel === "note" ? (
        <div className="jp-tk-noteedit">
          <textarea
            value={noteDraft}
            maxLength={300}
            rows={3}
            placeholder="Add your notes here…"
            onChange={(event) => setNoteDraft(event.target.value.slice(0, 300))}
          />
          <div className="jp-tk-noteedit-foot">
            <span className="jp-tk-count">{noteDraft.length}/300</span>
            <div className="jp-tk-noteedit-btns">
              <button type="button" className="jp-tk-note-cancel" onClick={() => setPanel("none")}>Cancel</button>
              <button type="button" className="jp-tk-note-save" disabled={busy} onClick={() => void saveNote()}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {panel === "resume" ? (
        <div className="jp-tk-resumemenu">
          <div className="jp-tk-resumemenu-head">Resume list {resumes ? `(${resumes.length})` : ""}</div>
          {resumes === null ? (
            <div className="jp-tk-resume-loading"><Loader2 className="jp-spin" aria-hidden="true" />Loading…</div>
          ) : resumes.length === 0 ? (
            <div className="jp-tk-resume-loading">No resumes uploaded yet.</div>
          ) : (
            resumes.map((resume) => (
              <button
                key={resume.id}
                type="button"
                className={`jp-tk-resumeopt${item.resumeDocId === resume.id ? " jp-tk-resumeopt-on" : ""}`}
                disabled={busy}
                onClick={() => void attachResume(resume.id)}
              >
                <FileText aria-hidden="true" />
                <span className="jp-tk-resumeopt-name">{resume.name}</span>
                {item.resumeDocId === resume.id ? <Check aria-hidden="true" /> : null}
              </button>
            ))
          )}
          {uploadError ? <div className="jp-tk-resume-err">{uploadError}</div> : null}
          <button
            type="button"
            className="jp-tk-resume-upload"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="jp-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {uploading ? "Uploading…" : "Upload PDF resume"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleResumeFile(file);
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

const JP_MONO_HUES = [210, 248, 280, 330, 160, 190, 24, 132];
function monogramFor(name: string): { letter: string; hue: number } {
  const trimmed = name.trim();
  const letter = trimmed ? trimmed[0].toUpperCase() : "";
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  return { letter, hue: JP_MONO_HUES[hash % JP_MONO_HUES.length] };
}

function JobIdentityCard({
  company,
  role,
  location,
  needsReview,
  editing,
  draft,
  onEditStart,
  onDraftChange,
  onSave,
  onCancel,
}: {
  company: string;
  role: string;
  location: string;
  needsReview: boolean;
  editing: boolean;
  draft: { company: string; role: string };
  onEditStart: () => void;
  onDraftChange: (next: { company: string; role: string }) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <section className="jp-job-card jp-job-card-edit jp-rise">
        <label className="jp-input-label">
          Role
          <input
            className="jp-input"
            value={draft.role}
            placeholder="Role title"
            onChange={(event) => onDraftChange({ ...draft, role: event.target.value })}
          />
        </label>
        <label className="jp-input-label">
          Company
          <input
            className="jp-input"
            value={draft.company}
            placeholder="Company"
            onChange={(event) => onDraftChange({ ...draft, company: event.target.value })}
          />
        </label>
        <div className="jp-job-card-actions">
          <button type="button" className="jp-mini-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="jp-mini-solid" onClick={onSave}>
            <Check aria-hidden="true" /> Save
          </button>
        </div>
      </section>
    );
  }
  const mono = monogramFor(company || role);
  return (
    <section className={`jp-job-card jp-rise${needsReview ? " jp-job-card-review" : ""}`}>
      <span
        className="jp-job-logo"
        style={{ background: `hsl(${mono.hue} 82% 95%)`, color: `hsl(${mono.hue} 64% 40%)` }}
      >
        {mono.letter || <Building2 aria-hidden="true" />}
      </span>
      <div className="jp-job-meta">
        <strong title={role}>{role || "Unknown role"}</strong>
        <span title={company}>{company || "Unknown company"}</span>
        {location ? (
          <span className="jp-job-loc">
            <MapPin aria-hidden="true" />
            {location}
          </span>
        ) : null}
        {needsReview ? (
          <button type="button" className="jp-job-review" onClick={onEditStart}>
            <AlertTriangle aria-hidden="true" /> Confirm details before saving
          </button>
        ) : null}
      </div>
      <button type="button" className="jp-icon-action jp-job-edit" title="Edit job details" onClick={onEditStart}>
        <Pencil aria-hidden="true" />
      </button>
    </section>
  );
}

function ChecklistGroup({ title, fields }: { title: string; fields: PanelField[] }) {
  if (fields.length === 0) return null;
  return (
    <section className="jp-checklist-group">
      <h3>{title}</h3>
      {fields.map((field, index) => (
        <div
          key={field.fieldId}
          className={`jp-field-row jp-row-in${field.confidence > 0 && field.confidence < 0.7 ? " jp-field-row-warn" : ""}`}
          style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
        >
          {fieldStatusIcon(field)}
          <span title={field.label}>{field.label}</span>
        </div>
      ))}
    </section>
  );
}

function PanelStyles() {
  return (
    <style>{`
      :host {
        all: initial;
        color-scheme: light;
        --jp-blue-50: #eff5ff;
        --jp-blue-100: #dce8fe;
        --jp-blue-200: #bcd4fd;
        --jp-blue-500: #2f6bf0;
        --jp-blue-600: #1f5fe0;
        --jp-blue-700: #1846b8;
        --jp-ink: #0b1220;
        --jp-ink-2: #33405a;
        --jp-muted: #6a778c;
        --jp-line: #e7eef9;
        --jp-surface: #ffffff;
        --jp-surface-2: #f5f9ff;
        --jp-ok: #0f9d6e;
        --jp-ok-bg: #e7f7f0;
        --jp-warn: #b45309;
        --jp-warn-bg: #fff7ed;
        font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      button { font: inherit; }
      img { display: block; }

      /* ── Shell ─────────────────────────────────────────────────────────── */
      .jp-panel {
        position: fixed;
        z-index: 2147483646;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(384px, 96vw);
        height: 100vh;
        display: flex;
        flex-direction: row;
        overflow: hidden;
        border-left: 1px solid var(--jp-line);
        background: var(--jp-surface);
        color: var(--jp-ink);
        box-shadow: -22px 0 60px -30px rgba(13, 40, 97, 0.5);
        font-size: 13px;
        line-height: 1.4;
        animation: jp-slide-in 440ms cubic-bezier(.16, 1, .3, 1);
      }
      @keyframes jp-slide-in {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }

      /* Left column (header + scroll + footer) sits beside the right icon rail. */
      .jp-panel-col { flex: 1 1 auto; min-width: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; }

      /* ── Vertical icon rail ────────────────────────────────────────────── */
      .jp-rail {
        flex: 0 0 60px;
        width: 60px;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 6px;
        background: var(--jp-surface-2);
        border-left: 1px solid var(--jp-line);
      }
      .jp-rail-tab {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 10px 2px;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: var(--jp-muted);
        font-size: 10.5px;
        font-weight: 800;
        letter-spacing: -0.01em;
        cursor: pointer;
        transition: background 150ms ease, color 150ms ease;
      }
      .jp-rail-tab svg { width: 19px; height: 19px; }
      .jp-rail-tab:hover { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-rail-tab-on { background: #fff; color: var(--jp-blue-700); box-shadow: 0 6px 16px -10px rgba(13, 40, 97, 0.5), inset 0 0 0 1px var(--jp-line); }

      .jp-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 13px 14px;
        border-bottom: 1px solid var(--jp-line);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(245, 249, 255, 0.92));
        backdrop-filter: blur(8px);
      }
      .jp-brand { display: flex; min-width: 0; align-items: center; gap: 10px; }
      .jp-brand > div { min-width: 0; }
      .jp-brand-mark {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        padding: 4px;
        border-radius: 11px;
        background: var(--jp-blue-50);
        box-shadow: inset 0 0 0 1px var(--jp-blue-100), 0 6px 14px -8px rgba(31, 95, 224, 0.5);
      }
      .jp-brand-mark img { width: 100%; height: 100%; object-fit: contain; object-position: center; display: block; }
      .jp-brand strong { display: block; font-weight: 900; color: var(--jp-ink); font-size: 14px; line-height: 1.15; }
      .jp-brand span {
        display: block;
        max-width: 168px;
        color: var(--jp-muted);
        font-size: 11px;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jp-header-actions { display: flex; align-items: center; gap: 2px; }
      .jp-text-action, .jp-icon-action, .jp-cancel {
        border: 0;
        background: transparent;
        color: var(--jp-muted);
        cursor: pointer;
        font-weight: 800;
        transition: background 150ms ease, color 150ms ease;
      }
      .jp-text-action { padding: 6px 8px; font-size: 11px; border-radius: 8px; }
      .jp-icon-action { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 9px; }
      .jp-icon-action svg { width: 16px; height: 16px; }
      .jp-icon-action:hover, .jp-text-action:hover { background: var(--jp-blue-50); color: var(--jp-blue-700); }

      /* ── Tabs ──────────────────────────────────────────────────────────── */
      .jp-tabs {
        display: flex;
        gap: 4px;
        padding: 8px 14px 0;
        background: var(--jp-surface);
        border-bottom: 1px solid var(--jp-line);
        flex: 0 0 auto;
      }
      .jp-tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 9px 12px;
        border: none;
        background: transparent;
        color: var(--jp-muted);
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        border-radius: 9px 9px 0 0;
        transition: color 140ms ease, background 140ms ease;
      }
      .jp-tab svg { width: 15px; height: 15px; }
      .jp-tab:hover { color: var(--jp-ink-2); background: var(--jp-blue-50); }
      .jp-tab-on { color: var(--jp-blue-700); }
      .jp-tab-on::after {
        content: "";
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: -1px;
        height: 2.5px;
        border-radius: 2px 2px 0 0;
        background: var(--jp-blue-600);
      }

      .jp-panel-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 13px;
        scrollbar-width: thin;
        scrollbar-color: var(--jp-blue-100) transparent;
      }
      .jp-panel-scroll::-webkit-scrollbar { width: 9px; }
      .jp-panel-scroll::-webkit-scrollbar-thumb {
        background: var(--jp-blue-100);
        border-radius: 99px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      .jp-panel-scroll::-webkit-scrollbar-thumb:hover { background: var(--jp-blue-200); }
      .jp-panel-body { display: flex; flex-direction: column; gap: 12px; }
      .jp-panel-body.jp-fill-body { gap: 11px; }

      .jp-panel-footer {
        padding: 10px 13px;
        border-top: 1px solid var(--jp-line);
        background: linear-gradient(0deg, rgba(255, 255, 255, 0.97), rgba(245, 249, 255, 0.9));
        backdrop-filter: blur(8px);
      }
      .jp-foot-hint { display: flex; align-items: center; gap: 8px; color: var(--jp-muted); font-size: 11.5px; font-weight: 650; }
      .jp-foot-hint svg { width: 14px; height: 14px; flex: 0 0 auto; color: var(--jp-ok); }
      .jp-synced { display: flex; align-items: center; gap: 8px; color: var(--jp-ok); font-weight: 850; font-size: 12.5px; }
      .jp-synced-error { color: var(--jp-warn); }
      .jp-synced-error span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .jp-synced svg { width: 16px; height: 16px; flex: 0 0 auto; }
      .jp-synced button {
        margin-left: auto;
        border: 0;
        border-radius: 99px;
        background: var(--jp-ok-bg);
        color: var(--jp-ok);
        padding: 5px 11px;
        font-weight: 850;
        font-size: 12px;
        cursor: pointer;
        transition: filter 150ms ease;
      }
      .jp-synced button:hover { filter: brightness(0.97); }

      /* ── Job identity card ─────────────────────────────────────────────── */
      .jp-job-card {
        position: relative;
        display: flex;
        gap: 11px;
        align-items: flex-start;
        padding: 12px;
        border: 1px solid var(--jp-line);
        border-radius: 14px;
        background: linear-gradient(180deg, #fff, var(--jp-surface-2));
        box-shadow: 0 1px 0 rgba(13, 40, 97, 0.03);
      }
      .jp-job-card-review { border-color: #f3d8a6; background: linear-gradient(180deg, #fffdf7, #fff8ec); }
      .jp-job-logo {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border-radius: 11px;
        font-weight: 900;
        font-size: 17px;
      }
      .jp-job-logo svg { width: 20px; height: 20px; }
      .jp-job-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; padding-right: 22px; }
      .jp-job-meta strong {
        font-size: 14px;
        font-weight: 850;
        color: var(--jp-ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jp-job-meta > span {
        font-size: 12px;
        font-weight: 700;
        color: var(--jp-ink-2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jp-job-loc { display: flex; align-items: center; gap: 4px; color: var(--jp-muted); font-size: 11.5px; font-weight: 650; }
      .jp-job-loc svg { width: 12px; height: 12px; flex: 0 0 auto; }
      .jp-job-review {
        margin-top: 6px;
        display: inline-flex;
        align-self: flex-start;
        align-items: center;
        gap: 6px;
        border: 0;
        border-radius: 99px;
        background: #fef0d8;
        color: #b45309;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
      }
      .jp-job-review svg { width: 13px; height: 13px; }
      .jp-job-edit { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; }
      .jp-job-card-edit { flex-direction: column; gap: 10px; }
      .jp-input-label {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 10.5px;
        font-weight: 850;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--jp-muted);
      }
      .jp-input {
        width: 100%;
        height: 38px;
        border: 1px solid var(--jp-line);
        border-radius: 10px;
        padding: 0 11px;
        background: #fff;
        color: var(--jp-ink);
        font-size: 13px;
        font-weight: 600;
        outline: none;
        transition: border-color 150ms ease, box-shadow 150ms ease;
      }
      .jp-input:focus { border-color: var(--jp-blue-500); box-shadow: 0 0 0 3px var(--jp-blue-100); }
      .jp-job-card-actions { display: flex; gap: 8px; justify-content: flex-end; }
      .jp-mini-ghost, .jp-mini-solid {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 0;
        border-radius: 9px;
        padding: 8px 13px;
        font-weight: 850;
        font-size: 12px;
        cursor: pointer;
        transition: background 150ms ease, color 150ms ease;
      }
      .jp-mini-ghost { background: transparent; color: var(--jp-muted); }
      .jp-mini-ghost:hover { background: var(--jp-surface-2); color: var(--jp-ink); }
      .jp-mini-solid { background: var(--jp-blue-600); color: #fff; }
      .jp-mini-solid:hover { background: var(--jp-blue-700); }
      .jp-mini-ghost svg, .jp-mini-solid svg { width: 14px; height: 14px; }

      /* ── Primary action ────────────────────────────────────────────────── */
      .jp-autofill-button {
        position: relative;
        overflow: hidden;
        display: inline-flex;
        width: 100%;
        height: 46px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 0;
        border-radius: 13px;
        background: linear-gradient(135deg, var(--jp-blue-500), var(--jp-blue-700));
        color: #fff;
        cursor: pointer;
        font-weight: 850;
        font-size: 13.5px;
        box-shadow: 0 12px 24px -12px rgba(31, 95, 224, 0.85);
        transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;
      }
      .jp-autofill-button:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 16px 28px -12px rgba(31, 95, 224, 0.9);
        filter: saturate(1.05);
      }
      .jp-autofill-button:active:not(:disabled) { transform: translateY(0) scale(0.99); }
      .jp-autofill-button:disabled { cursor: not-allowed; opacity: 0.5; box-shadow: none; }
      .jp-autofill-button svg { width: 18px; height: 18px; }
      .jp-autofill-button::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(115deg, transparent 32%, rgba(255, 255, 255, 0.38) 50%, transparent 68%);
        transform: translateX(-130%);
      }
      .jp-autofill-button:hover:not(:disabled)::after { animation: jp-shine 850ms ease; }
      @keyframes jp-shine { to { transform: translateX(130%); } }

      .jp-save-button {
        display: inline-flex;
        width: 100%;
        height: 42px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid var(--jp-blue-200);
        border-radius: 12px;
        background: #fff;
        color: var(--jp-blue-700);
        cursor: pointer;
        font-weight: 850;
        font-size: 13px;
        transition: background 150ms ease, border-color 150ms ease, transform 140ms ease;
      }
      .jp-save-button:hover:not(:disabled) { background: var(--jp-blue-50); transform: translateY(-1px); }
      .jp-save-button:active:not(:disabled) { transform: translateY(0); }
      .jp-save-button svg { width: 17px; height: 17px; }
      .jp-save-button:disabled { cursor: default; }
      .jp-save-button:disabled:not(.jp-save-button-done) { opacity: 0.5; }
      .jp-save-button-done {
        border-color: transparent;
        background: var(--jp-ok-bg);
        color: var(--jp-ok);
        opacity: 1;
      }

      /* ── Primary action group (autofill + auto-track) ──────────────────── */
      .jp-action-group { display: flex; flex-direction: column; gap: 8px; }

      .jp-autotrack {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        text-align: left;
        cursor: pointer;
        border: 1px solid var(--jp-line);
        border-radius: 11px;
        padding: 8px 11px;
        background: #fff;
        color: var(--jp-muted);
        font-size: 12px;
        font-weight: 800;
        transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
      }
      .jp-autotrack:hover { border-color: var(--jp-blue-200); }
      .jp-autotrack > svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--jp-muted); transition: color 160ms ease; }
      .jp-autotrack-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-autotrack-on { border-color: var(--jp-blue-200); background: var(--jp-blue-50); color: var(--jp-ink); }
      .jp-autotrack-on > svg { color: var(--jp-blue-600); }

      .jp-switch {
        position: relative;
        flex: 0 0 auto;
        width: 40px;
        height: 23px;
        border-radius: 99px;
        background: #ccd8ea;
        transition: background 200ms ease;
      }
      .jp-switch-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 19px;
        height: 19px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 2px 5px rgba(13, 40, 97, 0.3);
        transition: transform 230ms cubic-bezier(.16, 1, .3, 1);
      }
      .jp-switch-sm { width: 32px; height: 19px; }
      .jp-switch-sm .jp-switch-knob { width: 15px; height: 15px; }
      .jp-autotrack-on .jp-switch { background: var(--jp-blue-600); }
      .jp-autotrack-on .jp-switch-sm .jp-switch-knob { transform: translateX(13px); }

      /* ── Document generators ───────────────────────────────────────────── */
      .jp-gen-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 13px;
        width: 100%;
        text-align: left;
        padding: 13px 15px 13px 13px;
        border: 1px solid var(--jp-line);
        border-radius: 16px;
        background: #fff;
        cursor: pointer;
        overflow: hidden;
        transition: border-color 220ms ease, box-shadow 240ms ease, transform 240ms ease, background 240ms ease;
      }
      .jp-gen-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(130% 150% at 100% 0%, rgba(47, 107, 240, 0.08), transparent 55%);
        opacity: 1;
        transition: opacity 240ms ease;
        pointer-events: none;
      }
      .jp-gen-card:hover:not(:disabled),
      .jp-gen-busy {
        transform: translateY(-2px);
        border-color: transparent;
        background: linear-gradient(135deg, var(--jp-blue-500), var(--jp-blue-700));
        box-shadow: 0 20px 40px -20px rgba(31, 95, 224, 0.95);
      }
      .jp-gen-busy { transform: none; }
      .jp-gen-card:active:not(:disabled) { transform: translateY(0); }
      .jp-gen-card:disabled { cursor: default; }
      .jp-gen-card:hover:not(:disabled)::before { opacity: 0; }

      /* Document illustration */
      .jp-gen-doc { position: relative; width: 42px; height: 50px; flex: 0 0 auto; }
      .jp-gen-sheet { position: absolute; border-radius: 6px; }
      .jp-gen-sheet-back {
        inset: 7px 1px 1px 9px;
        background: var(--jp-blue-100);
        transform: rotate(7deg);
        transform-origin: bottom right;
        transition: transform 260ms cubic-bezier(.2, .9, .3, 1.2), background 240ms ease;
      }
      .jp-gen-card:hover:not(:disabled) .jp-gen-sheet-back,
      .jp-gen-busy .jp-gen-sheet-back { background: rgba(255, 255, 255, 0.34); transform: rotate(10deg); }
      .jp-gen-sheet-front {
        inset: 1px 7px 1px 1px;
        background: #fff;
        border: 1px solid var(--jp-line);
        box-shadow: 0 7px 16px -9px rgba(13, 40, 97, 0.45);
        padding: 7px 7px 0;
        display: flex;
        flex-direction: column;
        gap: 3.5px;
        overflow: hidden;
      }
      .jp-gen-line { height: 3px; border-radius: 2px; background: #d8e2f4; }
      .jp-gen-line-head { height: 5px; width: 72%; margin-bottom: 1px; background: var(--jp-blue-500); }
      .jp-gen-line-short { width: 54%; }
      .jp-gen-line-date { width: 38%; align-self: flex-end; }
      .jp-gen-sign { width: 40%; height: 4px; margin-top: auto; margin-bottom: 6px; background: var(--jp-blue-200); }
      .jp-gen-scan {
        position: absolute;
        left: 0;
        right: 0;
        top: -45%;
        height: 45%;
        background: linear-gradient(180deg, transparent, rgba(47, 107, 240, 0.4), transparent);
        opacity: 0;
        pointer-events: none;
      }
      .jp-gen-card:hover:not(:disabled) .jp-gen-scan,
      .jp-gen-busy .jp-gen-scan { opacity: 1; animation: jp-scan 1150ms ease-in-out infinite; }
      @keyframes jp-scan { 0% { transform: translateY(0); } 100% { transform: translateY(380%); } }

      /* Text */
      .jp-gen-text { position: relative; display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
      .jp-gen-title {
        font-size: 14px;
        font-weight: 850;
        letter-spacing: -0.01em;
        color: var(--jp-ink);
        transition: color 200ms ease;
      }
      .jp-gen-file {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        font-weight: 650;
        color: var(--jp-muted);
        transition: color 200ms ease;
      }
      .jp-gen-card:hover:not(:disabled) .jp-gen-title,
      .jp-gen-busy .jp-gen-title { color: #fff; }
      .jp-gen-card:hover:not(:disabled) .jp-gen-file,
      .jp-gen-busy .jp-gen-file { color: var(--jp-blue-100); }

      /* Arrow */
      .jp-gen-go {
        position: relative;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
        transition: background 200ms ease, color 200ms ease, transform 260ms cubic-bezier(.2, .9, .3, 1.4);
      }
      .jp-gen-go svg { width: 16px; height: 16px; }
      .jp-gen-card:hover:not(:disabled) .jp-gen-go { background: #fff; transform: translateX(3px); }
      .jp-gen-busy .jp-gen-go { background: rgba(255, 255, 255, 0.22); color: #fff; }

      /* ── Generation loader (tailor / cover letter) ─────────────────────── */
      .jp-gl {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        padding: 14px 4px 6px;
        animation: jp-rise 380ms cubic-bezier(.16, 1, .3, 1) both;
      }
      .jp-gl-ring-wrap { position: relative; width: 152px; height: 152px; flex: 0 0 auto; }
      .jp-gl-ring-wrap::before {
        content: "";
        position: absolute;
        inset: 14px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(47, 107, 240, 0.20), transparent 68%);
        animation: jp-gl-glow 2.4s ease-in-out infinite;
      }
      .jp-gl-done .jp-gl-ring-wrap::before { background: radial-gradient(circle, rgba(15, 157, 110, 0.22), transparent 68%); }
      .jp-gl-error .jp-gl-ring-wrap::before { background: radial-gradient(circle, rgba(180, 83, 9, 0.18), transparent 68%); animation: none; }
      @keyframes jp-gl-glow {
        0%, 100% { opacity: .5; transform: scale(.9); }
        50% { opacity: 1; transform: scale(1.05); }
      }
      .jp-gl-ring { width: 152px; height: 152px; transform: rotate(-90deg); overflow: visible; }
      .jp-gl-track { fill: none; stroke: var(--jp-blue-100); stroke-width: 9; }
      .jp-gl-bar {
        fill: none;
        stroke: url(#jpGlGrad);
        stroke-width: 9;
        stroke-linecap: round;
        transition: stroke-dashoffset 140ms linear, stroke 420ms ease;
        filter: drop-shadow(0 3px 9px rgba(31, 95, 224, 0.4));
      }
      .jp-gl-done .jp-gl-bar { stroke: var(--jp-ok); filter: drop-shadow(0 3px 9px rgba(15, 157, 110, 0.45)); }
      .jp-gl-error .jp-gl-bar { stroke: var(--jp-warn); filter: none; }

      /* Comet dot riding the ring */
      .jp-gl-orbit { position: absolute; inset: 0; animation: jp-spin 2.6s linear infinite; }
      .jp-gl-orbit::after {
        content: "";
        position: absolute;
        top: -1px;
        left: 50%;
        width: 9px;
        height: 9px;
        margin-left: -4.5px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 0 0 3px rgba(91, 157, 255, 0.45), 0 0 12px 2px rgba(47, 107, 240, 0.7);
      }
      .jp-gl-done .jp-gl-orbit, .jp-gl-error .jp-gl-orbit { display: none; }

      .jp-gl-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      .jp-gl-num { display: inline-flex; align-items: baseline; gap: 1px; line-height: 1; }
      .jp-gl-pct { font-size: 42px; font-weight: 900; letter-spacing: -0.035em; color: var(--jp-ink); font-variant-numeric: tabular-nums; }
      .jp-gl-unit { font-size: 18px; font-weight: 850; color: var(--jp-muted); }
      .jp-gl-center-warn { width: 36px; height: 36px; color: var(--jp-warn); }
      .jp-gl-center-check { width: 44px; height: 44px; color: var(--jp-ok); stroke-width: 3; animation: jp-gl-pop 420ms cubic-bezier(.2, .9, .3, 1.5) both; }
      @keyframes jp-gl-pop { 0% { transform: scale(.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }

      .jp-gl-title { font-size: 16px; font-weight: 850; letter-spacing: -0.015em; color: var(--jp-ink); text-align: center; }
      .jp-gl-done .jp-gl-title { color: var(--jp-ok); }
      .jp-gl-error .jp-gl-title { color: var(--jp-warn); }

      .jp-gl-steps { list-style: none; margin: 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 3px; }
      .jp-gl-step {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 9px 12px;
        border-radius: 12px;
        color: var(--jp-muted);
        font-size: 13px;
        font-weight: 750;
        transition: background 280ms ease, color 280ms ease;
      }
      .jp-gl-step-dot {
        position: relative;
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        border: 2px solid var(--jp-line);
        background: #fff;
        color: #fff;
        transition: border-color 280ms ease, background 280ms ease;
      }
      .jp-gl-step-dot svg { width: 12px; height: 12px; }
      .jp-gl-step-active { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-gl-step-active .jp-gl-step-label { font-weight: 850; }
      .jp-gl-step-active .jp-gl-step-dot { border-color: var(--jp-blue-500); }
      .jp-gl-step-pulse { width: 9px; height: 9px; border-radius: 50%; background: var(--jp-blue-500); animation: jp-gl-pulse 1s ease-in-out infinite; }
      @keyframes jp-gl-pulse {
        0%, 100% { transform: scale(.6); opacity: .6; }
        50% { transform: scale(1); opacity: 1; }
      }
      .jp-gl-step-done { color: var(--jp-ink-2); }
      .jp-gl-step-done .jp-gl-step-dot { border-color: var(--jp-ok); background: var(--jp-ok); }
      .jp-gl-step-error { color: var(--jp-warn); }
      .jp-gl-step-error .jp-gl-step-dot { border-color: var(--jp-warn); background: var(--jp-warn); }

      .jp-gl-foot {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        text-align: center;
        font-size: 11.5px;
        font-weight: 750;
        color: var(--jp-muted);
      }
      .jp-gl-foot svg { width: 13px; height: 13px; flex: 0 0 auto; color: var(--jp-blue-500); }
      .jp-gl-error .jp-gl-foot { color: var(--jp-warn); }
      .jp-gl-error .jp-gl-foot svg { color: var(--jp-warn); }

      /* ── Tailor / cover completion card ────────────────────────────────── */
      .jp-done-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 12px 16px 18px;
        border: 1px solid var(--jp-line);
        border-radius: 18px;
        background: linear-gradient(180deg, var(--jp-ok-bg), #fff 62%);
        animation: jp-rise 360ms cubic-bezier(.16, 1, .3, 1) both;
      }
      .jp-done-top { width: 100%; display: flex; justify-content: flex-start; margin-bottom: 2px; }
      .jp-done-back {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 6px 11px 6px 7px;
        border-radius: 10px;
        color: var(--jp-ink-2);
        background: transparent;
        font-size: 12.5px;
        font-weight: 800;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease;
      }
      .jp-done-back:hover { background: rgba(13, 40, 97, 0.06); color: var(--jp-ink); }
      .jp-done-back svg { width: 17px; height: 17px; }
      .jp-done-badge {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--jp-ok);
        color: #fff;
        box-shadow: 0 10px 24px -10px rgba(15, 157, 110, 0.9);
        animation: jp-gl-pop 440ms cubic-bezier(.2, .9, .3, 1.5) both;
      }
      .jp-done-badge svg { width: 28px; height: 28px; stroke-width: 3; }
      .jp-done-head { display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
      .jp-done-head strong { font-size: 16px; font-weight: 850; letter-spacing: -0.015em; color: var(--jp-ink); }
      .jp-done-head span { font-size: 12.5px; font-weight: 700; color: var(--jp-muted); }
      .jp-done-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
      .jp-done-primary, .jp-done-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        font-size: 13.5px;
        font-weight: 850;
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 200ms ease, background 160ms ease, border-color 160ms ease;
      }
      .jp-done-primary svg, .jp-done-secondary svg { width: 16px; height: 16px; }
      .jp-done-primary {
        color: #fff;
        border: none;
        background: linear-gradient(135deg, var(--jp-blue-500), var(--jp-blue-700));
        box-shadow: 0 16px 32px -18px rgba(31, 95, 224, 0.95);
      }
      .jp-done-primary:hover { transform: translateY(-1px); box-shadow: 0 20px 38px -18px rgba(31, 95, 224, 1); }
      .jp-done-secondary {
        color: var(--jp-blue-700);
        border: 1px solid var(--jp-line);
        background: #fff;
      }
      .jp-done-secondary:hover { border-color: var(--jp-blue-200); background: var(--jp-blue-50); }
      .jp-done-primary:active, .jp-done-secondary:active { transform: translateY(0); }
      .jp-done-hint { margin: 0; font-size: 11.5px; font-weight: 650; color: var(--jp-muted); text-align: center; }

      /* ── Profile tab ───────────────────────────────────────────────────── */
      .jp-profile { display: flex; flex-direction: column; gap: 11px; }
      .jp-profile-hint {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin: 0;
        font-size: 11.5px;
        font-weight: 700;
        color: var(--jp-muted);
      }
      .jp-profile-hint svg { width: 13px; height: 13px; flex: 0 0 auto; color: var(--jp-blue-500); }
      .jp-profile-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 30px 18px;
        text-align: center;
      }
      .jp-profile-empty > svg { width: 30px; height: 30px; color: var(--jp-blue-400, var(--jp-blue-500)); opacity: .7; }
      .jp-profile-empty strong { font-size: 15px; font-weight: 850; color: var(--jp-ink); }
      .jp-profile-empty span { font-size: 12.5px; font-weight: 600; color: var(--jp-muted); max-width: 260px; line-height: 1.5; }
      .jp-pf-open {
        margin-top: 4px;
        padding: 9px 16px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 800;
        color: #fff;
        border: none;
        cursor: pointer;
        background: linear-gradient(135deg, var(--jp-blue-500), var(--jp-blue-700));
      }

      .jp-pf-section {
        display: flex;
        flex-direction: column;
        gap: 9px;
        padding: 12px;
        border: 1px solid var(--jp-line);
        border-radius: 14px;
        background: #fff;
      }
      .jp-pf-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .jp-pf-section-title { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 900; color: var(--jp-ink); }
      .jp-pf-section-title svg { width: 15px; height: 15px; color: var(--jp-blue-600); }

      /* Selectable text — the point of this tab */
      .jp-pf-selectable { -webkit-user-select: text; user-select: text; cursor: text; }

      .jp-copy-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex: 0 0 auto;
        padding: 5px;
        border-radius: 8px;
        color: var(--jp-muted);
        background: transparent;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease;
      }
      .jp-copy-btn svg { width: 14px; height: 14px; }
      .jp-copy-btn:hover { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-copy-btn-label { padding: 5px 9px; font-size: 11.5px; font-weight: 800; color: var(--jp-blue-700); background: var(--jp-blue-50); }
      .jp-copy-btn-label:hover { background: var(--jp-blue-100); }
      .jp-copy-done, .jp-copy-done:hover { color: var(--jp-ok); background: var(--jp-ok-bg); }

      .jp-pf-fields { margin: 0; display: flex; flex-direction: column; gap: 2px; }
      .jp-pf-field { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
      .jp-pf-field dt { flex: 0 0 66px; font-size: 11.5px; font-weight: 800; color: var(--jp-muted); }
      .jp-pf-field dd {
        margin: 0;
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        font-weight: 650;
        color: var(--jp-ink);
      }
      .jp-pf-field dd .jp-pf-selectable { min-width: 0; overflow-wrap: anywhere; }
      .jp-pf-field .jp-copy-btn { margin-left: auto; }

      .jp-pf-item { display: flex; flex-direction: column; gap: 6px; padding-top: 9px; border-top: 1px dashed var(--jp-line); }
      .jp-pf-section .jp-pf-item:first-of-type { padding-top: 0; border-top: none; }
      .jp-pf-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .jp-pf-item-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .jp-pf-item-title strong { font-size: 13px; font-weight: 800; color: var(--jp-ink); overflow-wrap: anywhere; }
      .jp-pf-meta { font-size: 11.5px; font-weight: 650; color: var(--jp-muted); overflow-wrap: anywhere; }
      .jp-pf-para { margin: 0; font-size: 12.5px; font-weight: 550; line-height: 1.5; color: var(--jp-ink-2); overflow-wrap: anywhere; }
      .jp-pf-bullets { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
      .jp-pf-bullets li { font-size: 12.5px; font-weight: 550; line-height: 1.45; color: var(--jp-ink-2); }
      .jp-pf-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .jp-pf-chip {
        padding: 4px 10px;
        border-radius: 99px;
        font-size: 12px;
        font-weight: 750;
        color: var(--jp-blue-700);
        background: var(--jp-blue-50);
        border: 1px solid var(--jp-blue-100);
      }

      /* ── Tracker tab ───────────────────────────────────────────────────── */
      .jp-tracker { display: flex; flex-direction: column; gap: 11px; }
      .jp-tracker-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 34px 18px;
        text-align: center;
        color: var(--jp-muted);
      }
      .jp-tracker-empty > svg { width: 26px; height: 26px; color: var(--jp-blue-500); opacity: .8; }
      .jp-tracker-empty strong { font-size: 14px; font-weight: 850; color: var(--jp-ink); }
      .jp-tracker-empty span { font-size: 12px; font-weight: 600; max-width: 240px; line-height: 1.5; }

      .jp-tk-tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 2px;
        scrollbar-width: none;
      }
      .jp-tk-tabs::-webkit-scrollbar { display: none; }
      .jp-tk-tab {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex: 0 0 auto;
        padding: 6px 11px;
        border-radius: 99px;
        border: 1px solid var(--jp-line);
        background: #fff;
        color: var(--jp-ink-2);
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
      }
      .jp-tk-tab em { font-style: normal; font-weight: 800; color: var(--jp-muted); }
      .jp-tk-tab:hover { border-color: var(--jp-blue-200); }
      .jp-tk-tab-on { background: var(--jp-blue-600); border-color: var(--jp-blue-600); color: #fff; }
      .jp-tk-tab-on em { color: rgba(255, 255, 255, 0.75); }

      .jp-tk-list { display: flex; flex-direction: column; gap: 10px; }
      .jp-tk-card {
        display: flex;
        flex-direction: column;
        gap: 9px;
        padding: 12px;
        border: 1px solid var(--jp-line);
        border-radius: 15px;
        background: #fff;
        animation: jp-row-in 320ms cubic-bezier(.16, 1, .3, 1) both;
      }
      .jp-tk-card-main { display: flex; align-items: flex-start; gap: 11px; }
      .jp-tk-logo { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 11px; overflow: hidden; }
      .jp-tk-logo img { width: 100%; height: 100%; object-fit: cover; }
      .jp-tk-mono {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        border-radius: 11px;
        font-size: 17px;
        font-weight: 900;
      }
      .jp-tk-mono svg { width: 18px; height: 18px; }
      .jp-tk-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .jp-tk-card-top { display: flex; align-items: center; gap: 8px; }
      .jp-tk-card-top strong { font-size: 14px; font-weight: 850; color: var(--jp-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-match {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        flex: 0 0 auto;
        margin-left: auto;
        padding: 2px 7px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 850;
        color: var(--jp-ok);
        background: var(--jp-ok-bg);
      }
      .jp-tk-match svg { width: 12px; height: 12px; }
      .jp-tk-role { font-size: 13px; font-weight: 700; color: var(--jp-ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-meta { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 650; color: var(--jp-muted); }
      .jp-tk-stage {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 800;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
      }
      .jp-tk-stage-applied { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-tk-stage-inbox { background: #fff4e2; color: #a15c07; }
      .jp-tk-stage-interview { background: #eaf6ff; color: #0369a1; }
      .jp-tk-stage-offer { background: var(--jp-ok-bg); color: var(--jp-ok); }
      .jp-tk-stage-closed { background: #f1f2f5; color: #64748b; }
      .jp-tk-open {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 9px;
        color: var(--jp-muted);
        background: transparent;
        cursor: pointer;
        transition: background 140ms ease, color 140ms ease;
      }
      .jp-tk-open:hover { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-tk-open svg { width: 16px; height: 16px; }
      .jp-tk-note-preview {
        margin: 0;
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--jp-surface-2);
        font-size: 12px;
        font-weight: 600;
        line-height: 1.45;
        color: var(--jp-ink-2);
        overflow-wrap: anywhere;
      }

      .jp-tk-actions { display: flex; gap: 8px; }
      .jp-tk-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex: 1;
        padding: 9px 10px;
        border-radius: 10px;
        border: 1px solid var(--jp-line);
        background: #fff;
        color: var(--jp-ink-2);
        font-size: 12.5px;
        font-weight: 800;
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
      }
      .jp-tk-action svg { width: 15px; height: 15px; }
      .jp-tk-action:hover { border-color: var(--jp-blue-200); background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-tk-action-on { border-color: var(--jp-blue-500); background: var(--jp-blue-50); color: var(--jp-blue-700); }

      .jp-tk-markmenu {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid var(--jp-line);
        background: #fff;
        box-shadow: 0 14px 30px -18px rgba(13, 40, 97, 0.6);
        animation: jp-rise 200ms cubic-bezier(.16, 1, .3, 1) both;
      }
      .jp-tk-markopt {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 10px;
        border-radius: 9px;
        background: transparent;
        color: var(--jp-ink);
        font-size: 13px;
        font-weight: 750;
        cursor: pointer;
        transition: background 130ms ease;
      }
      .jp-tk-markopt:hover:not(:disabled) { background: var(--jp-surface-2); }
      .jp-tk-markopt:disabled { opacity: .6; cursor: default; }
      .jp-tk-markopt-on { font-weight: 850; }
      .jp-tk-markopt svg { width: 15px; height: 15px; margin-left: auto; color: var(--jp-blue-600); }
      .jp-tk-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
      .jp-tk-dot-inbox { background: #eab308; }
      .jp-tk-dot-applied { background: var(--jp-blue-600); }
      .jp-tk-dot-interview { background: #0ea5e9; }
      .jp-tk-dot-offer { background: var(--jp-ok); }
      .jp-tk-dot-closed { background: #94a3b8; }

      .jp-tk-noteedit { display: flex; flex-direction: column; gap: 8px; animation: jp-rise 200ms cubic-bezier(.16, 1, .3, 1) both; }
      .jp-tk-noteedit textarea {
        width: 100%;
        resize: vertical;
        min-height: 66px;
        padding: 10px;
        border-radius: 11px;
        border: 1.5px solid var(--jp-blue-500);
        background: #fff;
        color: var(--jp-ink);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        outline: none;
      }
      .jp-tk-noteedit textarea::placeholder { color: var(--jp-muted); font-weight: 550; }
      .jp-tk-noteedit-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .jp-tk-count { font-size: 11px; font-weight: 750; color: var(--jp-muted); }
      .jp-tk-noteedit-btns { display: flex; gap: 8px; }
      .jp-tk-note-cancel, .jp-tk-note-save {
        padding: 7px 14px;
        border-radius: 9px;
        font-size: 12.5px;
        font-weight: 800;
        cursor: pointer;
      }
      .jp-tk-note-cancel { border: 1px solid var(--jp-line); background: #fff; color: var(--jp-ink-2); }
      .jp-tk-note-cancel:hover { background: var(--jp-surface-2); }
      .jp-tk-note-save { border: none; color: #fff; background: linear-gradient(135deg, var(--jp-blue-500), var(--jp-blue-700)); }
      .jp-tk-note-save:disabled { opacity: .6; cursor: default; }

      .jp-tk-resume {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px;
        border-radius: 10px;
        background: var(--jp-surface-2);
        font-size: 12px;
        font-weight: 750;
        color: var(--jp-ink-2);
      }
      .jp-tk-resume svg { width: 14px; height: 14px; flex: 0 0 auto; color: #c2410c; }
      .jp-tk-resume span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-resumemenu {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px;
        border-radius: 12px;
        border: 1px solid var(--jp-line);
        background: #fff;
        box-shadow: 0 14px 30px -18px rgba(13, 40, 97, 0.6);
        animation: jp-rise 200ms cubic-bezier(.16, 1, .3, 1) both;
      }
      .jp-tk-resumemenu-head { padding: 2px 6px 6px; font-size: 12px; font-weight: 900; color: var(--jp-ink); }
      .jp-tk-resume-loading { display: flex; align-items: center; gap: 7px; padding: 10px 6px; font-size: 12px; font-weight: 650; color: var(--jp-muted); }
      .jp-tk-resume-loading svg { width: 14px; height: 14px; }
      .jp-tk-resumeopt {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 8px;
        border-radius: 9px;
        background: transparent;
        color: var(--jp-ink);
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        text-align: left;
        transition: background 130ms ease;
      }
      .jp-tk-resumeopt:hover:not(:disabled) { background: var(--jp-surface-2); }
      .jp-tk-resumeopt:disabled { opacity: .6; cursor: default; }
      .jp-tk-resumeopt svg { width: 15px; height: 15px; flex: 0 0 auto; color: #c2410c; }
      .jp-tk-resumeopt-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-resumeopt-on { font-weight: 850; }
      .jp-tk-resumeopt-on > svg:last-child { color: var(--jp-blue-600); }
      .jp-tk-resume-upload {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        padding: 9px 8px;
        border: none;
        border-top: 1px solid var(--jp-line);
        border-radius: 0 0 8px 8px;
        background: transparent;
        color: var(--jp-blue-700);
        font-size: 12.5px;
        font-weight: 800;
        cursor: pointer;
      }
      .jp-tk-resume-upload:hover:not(:disabled) { background: var(--jp-blue-50); }
      .jp-tk-resume-upload:disabled { opacity: .65; cursor: default; }
      .jp-tk-resume-upload svg { width: 15px; height: 15px; }
      .jp-tk-resume-err { padding: 6px 8px; font-size: 11.5px; font-weight: 750; color: var(--jp-warn); }

      .jp-review-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        max-width: 100%;
        border-radius: 99px;
        padding: 7px 11px;
        font-size: 12px;
        font-weight: 800;
        background: var(--jp-warn-bg);
        color: var(--jp-warn);
      }
      .jp-review-pill svg { width: 14px; height: 14px; flex: 0 0 auto; }
      .jp-review-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .jp-action-note {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        max-width: 100%;
        border-radius: 10px;
        padding: 7px 11px;
        font-size: 12px;
        font-weight: 800;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
      }
      .jp-action-note svg { width: 14px; height: 14px; flex: 0 0 auto; color: var(--jp-blue-600); }
      .jp-action-note span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* ── Progress + lists ──────────────────────────────────────────────── */
      .jp-cancel { padding: 5px 9px; color: var(--jp-blue-700); font-size: 12px; border-radius: 8px; }
      .jp-cancel:hover { background: var(--jp-blue-50); }
      .jp-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .jp-progress-head strong { font-size: 13.5px; font-weight: 900; color: var(--jp-ink); }
      .jp-progress {
        position: relative;
        height: 8px;
        overflow: hidden;
        border-radius: 99px;
        background: var(--jp-blue-100);
      }
      .jp-progress > div {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--jp-blue-500), var(--jp-blue-600));
        transition: width 380ms cubic-bezier(.16, 1, .3, 1);
      }
      .jp-progress-live::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
        transform: translateX(-100%);
        animation: jp-shimmer 1.2s ease-in-out infinite;
      }
      @keyframes jp-shimmer { to { transform: translateX(100%); } }
      .jp-parse-caption { color: var(--jp-muted); font-size: 12px; font-weight: 650; }
      .jp-empty-state {
        border: 1px dashed var(--jp-blue-200);
        border-radius: 12px;
        padding: 14px;
        color: var(--jp-muted);
        font-size: 12px;
        font-weight: 650;
        text-align: center;
        background: var(--jp-surface-2);
      }
      .jp-checklist { display: flex; flex-direction: column; gap: 13px; }
      .jp-checklist-group { display: flex; flex-direction: column; gap: 5px; }
      .jp-checklist-group h3 {
        margin: 0;
        color: var(--jp-muted);
        font-size: 10.5px;
        font-weight: 900;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .jp-field-row {
        display: grid;
        min-height: 32px;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: center;
        gap: 9px;
        border-radius: 9px;
        padding: 6px 8px;
        color: var(--jp-ink-2);
        font-size: 12px;
        font-weight: 650;
        transition: background 150ms ease;
      }
      .jp-field-row:hover { background: var(--jp-surface-2); }
      .jp-field-row span {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
        line-height: 1.35;
      }
      .jp-field-row-warn { background: var(--jp-warn-bg); color: #7c2d12; }
      .jp-field-row-warn:hover { background: #fdeccf; }
      .jp-row-icon { width: 16px; height: 16px; color: #9fb0c7; }
      .jp-ok { color: var(--jp-ok); }
      .jp-warn { color: var(--jp-warn); }
      .jp-message {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        border-radius: 11px;
        padding: 10px 11px;
        font-size: 12px;
        font-weight: 750;
      }
      .jp-message svg { width: 16px; height: 16px; }
      .jp-message button { border: 0; background: transparent; color: inherit; cursor: pointer; font-weight: 900; }
      .jp-message-warn { background: var(--jp-warn-bg); color: var(--jp-warn); }

      /* ── Collapsed handle ──────────────────────────────────────────────── */
      .jp-tab-handle {
        position: fixed;
        z-index: 2147483646;
        right: 16px;
        transform: translateY(-50%);
        animation: jp-tab-in 380ms cubic-bezier(.16, 1, .3, 1);
        touch-action: none;
      }
      .jp-collapse-wrap { position: relative; width: 72px; height: 72px; }
      .jp-collapse-tab {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--jp-blue-500), var(--jp-blue-700));
        box-shadow: 0 14px 30px -10px rgba(13, 40, 97, 0.65);
        cursor: grab;
        transition: box-shadow 160ms ease, transform 160ms cubic-bezier(.2, .9, .3, 1.2);
        touch-action: none;
      }
      .jp-collapse-wrap:hover .jp-collapse-tab { box-shadow: 0 18px 36px -10px rgba(13, 40, 97, 0.7); transform: scale(1.03); }
      .jp-collapse-tab:active { cursor: grabbing; }

      /* Drag grip — a dot column on the inward edge, revealed on hover */
      .jp-handle-grip {
        position: absolute;
        left: 5px;
        top: 50%;
        transform: translate(-3px, -50%);
        display: grid;
        grid-template-columns: repeat(2, 3px);
        grid-auto-rows: 3px;
        gap: 3px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease;
      }
      .jp-handle-grip i { width: 3px; height: 3px; border-radius: 50%; background: rgba(255, 255, 255, 0.85); }
      .jp-collapse-wrap:hover .jp-handle-grip { opacity: 1; transform: translate(0, -50%); }

      /* Dismiss (X) — floats off the top-inward corner, revealed on hover */
      .jp-handle-close {
        position: absolute;
        top: -3px;
        left: -3px;
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: #fff;
        color: var(--jp-ink-2);
        box-shadow: 0 4px 12px -2px rgba(13, 40, 97, 0.4), inset 0 0 0 1px rgba(13, 40, 97, 0.08);
        cursor: pointer;
        opacity: 0;
        transform: scale(0.6);
        pointer-events: none;
        transition: opacity 160ms ease, transform 180ms cubic-bezier(.2, .9, .3, 1.5), background 140ms ease, color 140ms ease;
      }
      .jp-handle-close svg { width: 14px; height: 14px; stroke-width: 2.5; }
      .jp-handle-close:hover { background: var(--jp-ink); color: #fff; }
      .jp-collapse-wrap:hover .jp-handle-close { opacity: 1; transform: scale(1); pointer-events: auto; }
      .jp-collapse-mark {
        position: relative;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 0 0 1px rgba(13, 40, 97, 0.06);
      }
      .jp-collapse-mark > img { width: 46px; height: 46px; object-fit: contain; pointer-events: none; }
      .jp-collapse-badge {
        position: absolute;
        right: -6px;
        bottom: -6px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid var(--jp-blue-600);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(13, 40, 97, 0.3);
        pointer-events: none;
      }
      .jp-collapse-badge img { width: 13px; height: 13px; object-fit: contain; border-radius: 50%; }
      @keyframes jp-tab-in {
        from { transform: translate(46px, -50%); opacity: 0; }
        to { transform: translate(0, -50%); opacity: 1; }
      }

      /* ── Motion utilities ──────────────────────────────────────────────── */
      .jp-rise { animation: jp-rise 320ms cubic-bezier(.16, 1, .3, 1) both; }
      @keyframes jp-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
      .jp-row-in { animation: jp-row-in 320ms cubic-bezier(.16, 1, .3, 1) both; }
      @keyframes jp-row-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
      .jp-spin { animation: jp-spin 850ms linear infinite; }
      @keyframes jp-spin { to { transform: rotate(360deg); } }

      @media (prefers-reduced-motion: reduce) {
        .jp-panel, .jp-tab-handle, .jp-rise, .jp-row-in { animation: none !important; }
        .jp-progress > div { transition: none; }
        .jp-progress-live::after, .jp-autofill-button::after { display: none; }
        .jp-switch-knob { transition: none; }
        .jp-gen-scan { animation: none !important; opacity: 0; }
        .jp-gl-orbit, .jp-gl-ring-wrap::before, .jp-gl-step-pulse, .jp-gl-center-check { animation: none !important; }
        .jp-gl-bar { transition: none; }
      }
      @media (max-width: 440px) {
        .jp-panel { width: 100vw; border-left: 0; }
      }
    `}</style>
  );
}

function renderedPanelExists(host: HTMLElement | null) {
  return Boolean(host?.shadowRoot?.querySelector(".jp-panel, .jp-tab-handle"));
}

// Heuristic for "this page is an application form worth opening the dock for". A few
// visible controls (name/email/phone/resume/…) reliably distinguishes a real form from
// a feed or listing page that only carries a stray search box. The collapsed tab is
// always there, so a false negative just means one extra click.
function applicationFormLikelyPresent(doc: Document = document) {
  return countVisibleApplicationControls(doc) >= 3;
}

// ATS SPAs frequently mount their form a beat after document_idle. Watch briefly and
// expand the dock the moment a form appears; once-per-frame so re-injections (toolbar
// clicks, autofill runs) never re-open a panel the user has collapsed.
async function autoOpenWhenApplicationFormAppears() {
  const state = globalThis as typeof globalThis & { __jobpostedAutoOpenScheduled?: boolean };
  if (state.__jobpostedAutoOpenScheduled) return;
  state.__jobpostedAutoOpenScheduled = true;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    if (!extensionContextValid()) return;
    if (applicationFormLikelyPresent()) {
      window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT));
      return;
    }
  }
}

function mountInPagePanel(options: { autoOpen?: boolean } = {}) {
  if (!isTopFrame()) return false;
  const autoOpen = options.autoOpen ?? true;
  const existing = document.getElementById(PANEL_HOST_ID);
  if (renderedPanelExists(existing)) {
    if (autoOpen) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT));
    return true;
  }
  if (existing) {
    existing.remove();
  }
  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.right = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.zIndex = "2147483646";
  const shadow = host.attachShadow({ mode: "open" });
  const root = document.createElement("div");
  shadow.append(root);
  document.documentElement.appendChild(host);
  createRoot(root).render(
    <>
      <PanelStyles />
      <InPagePanel initiallyCollapsed={!autoOpen} />
    </>,
  );
  if (autoOpen) {
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT)));
  }
  return true;
}

function watchContextInvalidation() {
  // The content script is re-executed on every executeScript injection (toolbar click,
  // each autofill/discovery run, across all frames). Without this guard each run stacked
  // another 3s interval that lived for the page's lifetime.
  const state = globalThis as typeof globalThis & { __jobpostedContextWatcher?: boolean };
  if (state.__jobpostedContextWatcher) return;
  state.__jobpostedContextWatcher = true;
  const intervalId = window.setInterval(() => {
    if (extensionContextValid()) return;
    window.clearInterval(intervalId);
    // The extension was reloaded/updated; tear down the now-orphaned panel + styles
    // so the page is left clean and no stale chrome.* calls keep firing.
    document.getElementById(PANEL_HOST_ID)?.remove();
    document.getElementById("jobposted-page-highlight-style")?.remove();
  }, 3000);
}

export default defineContentScript({
  matches: CONTENT_MATCHES,
  allFrames: true,
  matchAboutBlank: true,
  runAt: "document_idle",
  cssInjectionMode: "manual",
  async main() {
    installAutofillCommandListener();
    if (isJobPostedWebAppHost()) {
      // The session bridge only ever needs to run on the JobPosted web app, where the
      // signed-in Supabase session lives. Installing it on every allowlisted ATS origin
      // let any script there post a forged session into the extension.
      installBridgeListener();
      if (isTopFrame()) void syncStoredWebSession();
      return;
    }
    injectPageHighlightStyle();
    // Default to the collapsed tab and only auto-expand once a real application form is
    // present, so the dock doesn't slide open on every feed/listing/dashboard page of
    // broad domains (linkedin.com, indeed.com, …).
    const formPresent = applicationFormLikelyPresent();
    mountInPagePanel({ autoOpen: formPresent });
    if (!formPresent) void autoOpenWhenApplicationFormAppears();
    watchContextInvalidation();
  },
});
