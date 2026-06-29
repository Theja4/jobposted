import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  PenLine,
  Settings,
  Sparkles,
  Wand2,
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
  ExtensionMessageResponse,
  ExtensionPlatform,
  ExtensionResumeResponse,
  ExtensionSettings,
  MasterProfile,
} from "@jobposted/shared";
import { JOBPOSTED_WEB_ORIGIN } from "../src/config/env";
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
      const mounted = mountInPagePanel();
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

function InPagePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fields, setFields] = useState<PanelField[]>([]);
  const [result, setResult] = useState<ExtensionAutofillRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobAction, setJobAction] = useState<"tailor" | "cover-letter" | null>(null);
  const [jobActionMessage, setJobActionMessage] = useState<string | null>(null);
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const statusRef = useRef<PanelStatus>("idle");
  const pageSignatureRef = useRef(panelPageSignature());

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
      setCollapsed(false);
      void refreshProfile();
    };
    window.addEventListener(PANEL_OPEN_EVENT, openPanel);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, openPanel);
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
      refreshIdentity();
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

  // While the "Offline — queued" banner is showing, drive the background queue to
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
          forceGenericFallback: true,
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

  async function runJobAction(action: "tailor" | "cover-letter") {
    setJobAction(action);
    setJobActionMessage(null);
    try {
      const response = await Promise.race([
        message<ExtensionMessageResponse>({ type: action === "tailor" ? "TAILOR_ACTIVE_TAB" : "COVER_LETTER_ACTIVE_TAB" }),
        timeoutResponse(130_000, "The request timed out."),
      ]);
      if (response.ok && response.type === "TAILOR_ACTIVE_TAB") {
        const url = response.result.resumeUrl ?? response.result.resumeDocxUrl ?? null;
        setJobActionMessage(response.result.matchScore ? `Match score ${response.result.matchScore}%` : "Custom resume ready");
        if (url) await message({ type: "OPEN_TAB", url });
      } else if (response.ok && response.type === "COVER_LETTER_ACTIVE_TAB") {
        setJobActionMessage("Cover letter ready");
        if (response.result.coverLetterUrl) await message({ type: "OPEN_TAB", url: response.result.coverLetterUrl });
      } else {
        setJobActionMessage(response.ok ? "Action did not return a file." : response.error);
      }
    } catch (caught) {
      setJobActionMessage(caught instanceof Error ? caught.message : "Action failed.");
    } finally {
      setJobAction(null);
    }
  }

  if (collapsed) {
    return (
      <div className="jp-tab-handle">
        <button type="button" className="jp-collapse-tab" title="Open JobPosted" onClick={() => setCollapsed(false)}>
          <img src={assetUrl("brand/jobposted-mark.png")} alt="" />
          <span className="jp-collapse-label">JobPosted</span>
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>
    );
  }

  const groups = groupedFields(fields);
  const filling = panelStatusIsRunning(status);

  return (
    <aside className="jp-panel" aria-label="JobPosted autofill panel">
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

        {status === "idle" && (
          <div className="jp-panel-body">
            <button type="button" className="jp-autofill-button" disabled={Boolean(authError)} onClick={() => void runPanelAutofill()}>
              <Wand2 aria-hidden="true" />
              Autofill this page
            </button>

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

            <TrackerToggle checked={autoTrack} onChange={(next) => void toggleAutoTrack(next)} />

            <PanelCard
              icon={<FileText aria-hidden="true" />}
              title={resumeName}
              actionLabel="Generate Custom Resume"
              busy={jobAction === "tailor"}
              onAction={() => void runJobAction("tailor")}
            />
            <PanelCard
              icon={<Mail aria-hidden="true" />}
              title={profile?.documents.coverLetterName || "Cover letter"}
              actionLabel="Generate Cover Letter"
              busy={jobAction === "cover-letter"}
              onAction={() => void runJobAction("cover-letter")}
            />

            <div className="jp-tailor-pill">
              <Sparkles aria-hidden="true" />
              <span>{jobActionMessage || "Match score / tailor"}</span>
            </div>
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
      </div>

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
            <span>Offline — queued, will sync to your tracker shortly.</span>
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
    </aside>
  );
}

function PanelCard({
  icon,
  title,
  actionLabel,
  busy,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  actionLabel: string;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <section className="jp-card-row">
      <span className="jp-card-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <button type="button" disabled={busy} onClick={onAction}>
          {busy ? <Loader2 className="jp-spin" aria-hidden="true" /> : <PenLine aria-hidden="true" />}
          {actionLabel}
        </button>
      </div>
    </section>
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

function TrackerToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`jp-track-toggle${checked ? " jp-track-toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="jp-track-toggle-copy">
        <ClipboardCheck aria-hidden="true" />
        <span>
          <strong>Add to job tracker</strong>
          <em>{checked ? "Saved automatically when you autofill" : "Off — autofilled jobs won’t be tracked"}</em>
        </span>
      </span>
      <span className="jp-switch" aria-hidden="true">
        <span className="jp-switch-knob" />
      </span>
    </button>
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
          <span>{field.label}</span>
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
        width: min(372px, 96vw);
        height: 100vh;
        display: flex;
        flex-direction: column;
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

      /* ── Tracker toggle ────────────────────────────────────────────────── */
      .jp-track-toggle {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        text-align: left;
        cursor: pointer;
        border: 1px solid var(--jp-line);
        border-radius: 13px;
        padding: 11px 12px;
        background: #fff;
        transition: border-color 160ms ease, background 160ms ease;
      }
      .jp-track-toggle:hover { border-color: var(--jp-blue-200); }
      .jp-track-toggle-on { background: linear-gradient(180deg, var(--jp-blue-50), #fff); border-color: var(--jp-blue-200); }
      .jp-track-toggle-copy { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
      .jp-track-toggle-copy > svg { width: 18px; height: 18px; flex: 0 0 auto; color: var(--jp-muted); transition: color 160ms ease; }
      .jp-track-toggle-on .jp-track-toggle-copy > svg { color: var(--jp-blue-600); }
      .jp-track-toggle-copy > span { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
      .jp-track-toggle-copy strong { font-size: 13px; font-weight: 850; color: var(--jp-ink); }
      .jp-track-toggle-copy em {
        font-style: normal;
        font-size: 11px;
        font-weight: 650;
        color: var(--jp-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jp-switch {
        position: relative;
        flex: 0 0 auto;
        width: 40px;
        height: 23px;
        border-radius: 99px;
        background: #ccd8ea;
        transition: background 200ms ease;
      }
      .jp-track-toggle-on .jp-switch { background: var(--jp-blue-600); }
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
      .jp-track-toggle-on .jp-switch-knob { transform: translateX(17px); }

      /* ── Document cards ────────────────────────────────────────────────── */
      .jp-card-row {
        display: flex;
        gap: 11px;
        padding: 11px;
        border: 1px solid var(--jp-line);
        border-radius: 13px;
        background: #fff;
        transition: border-color 160ms ease, box-shadow 160ms ease;
      }
      .jp-card-row:hover { border-color: var(--jp-blue-200); box-shadow: 0 8px 18px -14px rgba(13, 40, 97, 0.55); }
      .jp-card-icon {
        display: grid;
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 10px;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
      }
      .jp-card-icon svg { width: 17px; height: 17px; }
      .jp-card-row > div { min-width: 0; flex: 1; }
      .jp-card-row strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 800;
        font-size: 12.5px;
        color: var(--jp-ink);
      }
      .jp-card-row button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 7px;
        border: 0;
        background: transparent;
        color: var(--jp-blue-700);
        cursor: pointer;
        padding: 0;
        font-size: 12px;
        font-weight: 850;
        transition: color 150ms ease;
      }
      .jp-card-row button:hover:not(:disabled) { color: var(--jp-blue-600); }
      .jp-card-row button:disabled { color: var(--jp-muted); cursor: default; }
      .jp-card-row button svg { width: 14px; height: 14px; }

      .jp-tailor-pill, .jp-review-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        max-width: 100%;
        border-radius: 99px;
        padding: 7px 11px;
        font-size: 12px;
        font-weight: 800;
      }
      .jp-tailor-pill { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-tailor-pill svg, .jp-review-pill svg { width: 14px; height: 14px; flex: 0 0 auto; }
      .jp-tailor-pill span, .jp-review-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-review-pill { background: var(--jp-warn-bg); color: var(--jp-warn); }

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
      .jp-field-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
        top: 50%;
        right: 0;
        transform: translateY(-50%);
        animation: jp-tab-in 380ms cubic-bezier(.16, 1, .3, 1);
      }
      .jp-collapse-tab {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: 46px;
        padding: 14px 7px;
        border: 1px solid var(--jp-line);
        border-right: 0;
        border-radius: 15px 0 0 15px;
        background: linear-gradient(180deg, #fff, var(--jp-surface-2));
        color: var(--jp-blue-700);
        box-shadow: -12px 0 30px -16px rgba(13, 40, 97, 0.55);
        cursor: pointer;
        transition: width 160ms ease, box-shadow 160ms ease;
      }
      .jp-collapse-tab:hover { width: 50px; box-shadow: -14px 0 32px -16px rgba(13, 40, 97, 0.6); }
      .jp-collapse-tab img { width: 24px; height: 24px; object-fit: contain; }
      .jp-collapse-label {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-size: 11px;
        font-weight: 850;
        letter-spacing: 0.05em;
        color: var(--jp-ink-2);
      }
      .jp-collapse-tab svg { width: 15px; height: 15px; }
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

function mountInPagePanel() {
  if (!isTopFrame()) return false;
  const existing = document.getElementById(PANEL_HOST_ID);
  if (renderedPanelExists(existing)) {
    window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT));
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
      <InPagePanel />
    </>,
  );
  window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT)));
  return true;
}

function watchContextInvalidation() {
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
    installBridgeListener();
    if (isJobPostedWebAppHost()) {
      if (isTopFrame()) void syncStoredWebSession();
      return;
    }
    injectPageHighlightStyle();
    mountInPagePanel();
    watchContextInvalidation();
  },
});
