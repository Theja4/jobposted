import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  Loader2,
  Mail,
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
import { shouldDeferToEmbeddedApplication } from "../src/content/embedded-application";
import { isGreenhousePage, isLeverPage } from "../src/content/open-ats";
import { isWorkdayPage, workdayCompany, workdayJobHeading, workdayStepName } from "../src/content/workday";

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

function applicationMetadata(platform: ExtensionPlatform) {
  const title = document.title.replace(/\s+/g, " ").trim();
  const heading =
    document.querySelector("h1")?.textContent?.trim() ||
    (platform === "workday" ? workdayJobHeading(document) : "") ||
    title;
  const company =
    (platform === "workday" ? workdayCompany(document) : "") ||
    document.querySelector("[class*='company' i]")?.textContent?.trim() ||
    title.split("|").at(-1)?.trim() ||
    "Unknown company";
  return {
    source: "extension" as const,
    platform,
    company,
    role: heading || "Unknown role",
    jobUrl: window.location.href,
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

async function syncAutofill(fieldsFilled: ExtensionFieldFillRecord[], platform: ExtensionPlatform) {
  const payload = {
    ...applicationMetadata(platform),
    status: "filled" as const,
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
      const response = await syncAutofill(allRecords, adapter.id);
      if (response.ok && response.type === "APPLICATION_SYNC") tracker = response.result;
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
      const response = await syncAutofill(records, platform);
      if (response.ok && response.type === "APPLICATION_SYNC") tracker = response.result;
    } catch (error) {
      trackerError = error instanceof Error ? error.message : "Could not sync this application.";
    }
  }

  args.onStatus?.("done");
  return summarizeRunResult({ platform, stepName, fields: records, tracker, trackerError });
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
  const cancelRef = useRef(false);

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
  }, []);

  useEffect(() => {
    const openPanel = () => {
      setCollapsed(false);
      void refreshProfile();
    };
    window.addEventListener(PANEL_OPEN_EVENT, openPanel);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, openPanel);
  }, []);

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

  async function runPanelAutofill() {
    cancelRef.current = false;
    setError(null);
    setResult(null);
    setFields([]);
    setStatus("scanning");
    try {
      const discovery = await discoverAutofillPage();
      setFields(fieldsFromDiscovery(discovery));
      if (cancelRef.current) {
        setStatus("idle");
        return;
      }
      setStatus("planning");
      const runResult = await runAutofillPage({
        continueSteps: false,
        forceGenericFallback: true,
        suppressAutoTrack: false,
        shouldStop: () => cancelRef.current,
        onStatus: setStatus,
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
      setFields(fieldsFromRunResult(runResult));
      setResult(runResult);
      if (cancelRef.current) {
        setStatus("idle");
      } else if (runResult.total === 0 || (runResult.filled === 0 && parserFailedResult(runResult))) {
        setError(runResult.trackerError || "No application questions were parsed.");
        setStatus("error");
      } else {
        setStatus("done");
      }
      void refreshProfile();
    } catch (caught) {
      setStatus("error");
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
        if (url) await chrome.tabs.create({ url, active: true });
      } else if (response.ok && response.type === "COVER_LETTER_ACTIVE_TAB") {
        setJobActionMessage("Cover letter ready");
        if (response.result.coverLetterUrl) await chrome.tabs.create({ url: response.result.coverLetterUrl, active: true });
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
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>
    );
  }

  const groups = groupedFields(fields);
  const filling = status === "scanning" || status === "planning" || status === "filling";

  return (
    <aside className="jp-panel" aria-label="JobPosted autofill panel">
      <header className="jp-panel-header">
        <div className="jp-brand">
          <img src={assetUrl("brand/jobposted-mark.png")} alt="" />
          <div>
            <strong>JobPosted</strong>
            {status === "done" && result ? (
              <span>{doneSummary}</span>
            ) : (
              <span>Autofill</span>
            )}
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

      {status === "idle" && (
        <div className="jp-panel-body">
          {authError ? (
            <section className="jp-message jp-message-warn">
              <AlertTriangle aria-hidden="true" />
              <span>{authError}</span>
              <button type="button" onClick={() => void startSignIn()}>Connect</button>
            </section>
          ) : null}

          <button type="button" className="jp-autofill-button" disabled={Boolean(authError)} onClick={() => void runPanelAutofill()}>
            <Wand2 aria-hidden="true" />
            Autofill
          </button>

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
            <button type="button" className="jp-cancel" onClick={() => { cancelRef.current = true; setStatus("idle"); }}>
              Cancel
            </button>
          </div>
          <div className="jp-progress"><div style={{ width: fields.length > 0 ? (status === "planning" ? "64%" : "34%") : "12%" }} /></div>
          <div className="jp-parse-caption">{status === "planning" ? "Building answers from parsed questions" : "Reading the application frame"}</div>
          {fields.length > 0 ? (
            <div className="jp-checklist">
              <ChecklistGroup title="Required" fields={groups.required} />
              <ChecklistGroup title="Optional" fields={groups.optional} />
            </div>
          ) : (
            <div className="jp-empty-state">Looking for application questions...</div>
          )}
        </div>
      ) : null}

      {status === "filling" || status === "done" || status === "error" ? (
        <div className="jp-panel-body jp-fill-body">
          <div className="jp-progress-head">
            <strong>{status === "done" ? "Done" : status === "error" ? "Needs review" : `Autofilling ${progress}%`}</strong>
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
          <div className="jp-progress"><div style={{ width: `${Math.max(4, progress || fillPercent)}%` }} /></div>
          {lowConfidence && <div className="jp-review-pill">Review amber fields before submit</div>}
          {resultError && (
            <div className="jp-message jp-message-warn">
              <AlertTriangle aria-hidden="true" />
              <span>{resultError}</span>
            </div>
          )}
          {listOpen && (
            <div className="jp-checklist">
              <ChecklistGroup title="Required" fields={groups.required} />
              <ChecklistGroup title="Optional" fields={groups.optional} />
            </div>
          )}
        </div>
      ) : null}
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

function ChecklistGroup({ title, fields }: { title: string; fields: PanelField[] }) {
  if (fields.length === 0) return null;
  return (
    <section className="jp-checklist-group">
      <h3>{title}</h3>
      {fields.map((field) => (
        <div key={field.fieldId} className={`jp-field-row${field.confidence > 0 && field.confidence < 0.7 ? " jp-field-row-warn" : ""}`}>
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
        --jp-blue-50: #eff6ff;
        --jp-blue-100: #dbeafe;
        --jp-blue-600: #1f64e0;
        --jp-blue-700: #174fb8;
        --jp-ink: #0b1220;
        --jp-muted: #526173;
        --jp-border: #d9e7fb;
        --jp-warn-bg: #fffbeb;
        --jp-warn: #b45309;
        font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      button { font: inherit; }
      .jp-panel {
        position: fixed;
        z-index: 2147483646;
        top: 16px;
        right: 0;
        width: 292px;
        height: min(720px, calc(100vh - 32px));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--jp-border);
        border-right: 0;
        border-radius: 18px 0 0 18px;
        background: #fff;
        color: var(--jp-ink);
        box-shadow: 0 12px 28px rgba(16, 47, 102, 0.18);
        font-size: 13px;
        line-height: 1.35;
      }
      .jp-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px;
        border-bottom: 1px solid var(--jp-border);
      }
      .jp-brand { display: flex; min-width: 0; align-items: center; gap: 8px; }
      .jp-brand img { width: 30px; height: 30px; object-fit: contain; }
      .jp-brand strong, .jp-card-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 850; color: var(--jp-ink); }
      .jp-brand span { display: block; overflow: hidden; max-width: 128px; color: var(--jp-muted); font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      .jp-header-actions { display: flex; align-items: center; gap: 3px; }
      .jp-text-action, .jp-icon-action, .jp-cancel {
        border: 0;
        background: transparent;
        color: var(--jp-muted);
        cursor: pointer;
        font-weight: 800;
      }
      .jp-text-action { padding: 6px 4px; font-size: 11px; }
      .jp-icon-action {
        display: grid;
        width: 30px;
        height: 30px;
        place-items: center;
        border-radius: 8px;
      }
      .jp-icon-action svg { width: 16px; height: 16px; }
      .jp-icon-action:hover, .jp-text-action:hover { background: var(--jp-blue-50); color: var(--jp-blue-700); }
      .jp-panel-body { display: grid; gap: 10px; padding: 12px; overflow: auto; }
      .jp-autofill-button {
        display: inline-flex;
        width: 100%;
        height: 44px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 0;
        border-radius: 12px;
        background: var(--jp-blue-600);
        color: #fff;
        cursor: pointer;
        font-weight: 900;
      }
      .jp-autofill-button:hover:not(:disabled) { background: var(--jp-blue-700); }
      .jp-autofill-button:disabled { cursor: not-allowed; opacity: .55; }
      .jp-autofill-button svg { width: 18px; height: 18px; }
      .jp-card-row {
        display: flex;
        gap: 10px;
        padding: 10px;
        border: 1px solid var(--jp-border);
        border-radius: 12px;
        background: #fff;
      }
      .jp-card-icon {
        display: grid;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 9px;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
      }
      .jp-card-icon svg { width: 17px; height: 17px; }
      .jp-card-row div { min-width: 0; flex: 1; }
      .jp-card-row button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        border: 0;
        background: transparent;
        color: var(--jp-blue-700);
        cursor: pointer;
        padding: 0;
        font-size: 12px;
        font-weight: 850;
      }
      .jp-card-row button svg { width: 14px; height: 14px; }
      .jp-tailor-pill, .jp-review-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        max-width: 100%;
        border-radius: 999px;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
        padding: 7px 9px;
        font-size: 12px;
        font-weight: 850;
      }
      .jp-tailor-pill svg, .jp-review-pill svg { width: 14px; height: 14px; }
      .jp-scan-state {
        display: grid;
        flex: 1;
        place-items: center;
        align-content: center;
        gap: 10px;
        padding: 28px;
        text-align: center;
      }
      .jp-scan-state strong { font-size: 15px; font-weight: 900; }
      .jp-scan-state span { color: var(--jp-muted); font-size: 12px; font-weight: 700; }
      .jp-sparkle {
        display: grid;
        width: 48px;
        height: 48px;
        place-items: center;
        border-radius: 14px;
        background: var(--jp-blue-50);
        color: var(--jp-blue-700);
        animation: jp-pulse 1.25s ease-in-out infinite;
      }
      .jp-sparkle svg { width: 22px; height: 22px; }
      .jp-cancel { padding: 4px; color: var(--jp-blue-700); font-size: 12px; }
      .jp-progress-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .jp-progress-head strong { font-size: 14px; font-weight: 900; }
      .jp-progress {
        height: 7px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--jp-blue-100);
      }
      .jp-progress div {
        height: 100%;
        border-radius: inherit;
        background: var(--jp-blue-600);
        transition: width 220ms cubic-bezier(.16, 1, .3, 1);
      }
      .jp-review-pill { background: var(--jp-warn-bg); color: var(--jp-warn); }
      .jp-parse-caption {
        color: var(--jp-muted);
        font-size: 12px;
        font-weight: 750;
      }
      .jp-empty-state {
        border: 1px dashed var(--jp-border);
        border-radius: 10px;
        padding: 12px;
        color: var(--jp-muted);
        font-size: 12px;
        font-weight: 750;
      }
      .jp-checklist { display: grid; gap: 12px; }
      .jp-checklist-group { display: grid; gap: 6px; }
      .jp-checklist-group h3 {
        margin: 0;
        color: var(--jp-muted);
        font-size: 11px;
        font-weight: 900;
      }
      .jp-field-row {
        display: grid;
        min-height: 30px;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        border-radius: 8px;
        padding: 5px 6px;
        color: var(--jp-ink);
        font-size: 12px;
        font-weight: 750;
      }
      .jp-field-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-field-row-warn { background: var(--jp-warn-bg); color: #7c2d12; }
      .jp-row-icon { width: 16px; height: 16px; color: #94a3b8; }
      .jp-ok { color: #047857; }
      .jp-warn { color: var(--jp-warn); }
      .jp-message {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        border-radius: 10px;
        padding: 9px;
        font-size: 12px;
        font-weight: 800;
      }
      .jp-message svg { width: 16px; height: 16px; }
      .jp-message button {
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-weight: 900;
      }
      .jp-message-warn { background: var(--jp-warn-bg); color: var(--jp-warn); }
      .jp-tab-handle {
        position: fixed;
        z-index: 2147483646;
        top: 44%;
        right: 0;
      }
      .jp-collapse-tab {
        display: grid;
        gap: 8px;
        place-items: center;
        width: 44px;
        min-height: 116px;
        border: 1px solid var(--jp-border);
        border-right: 0;
        border-radius: 14px 0 0 14px;
        background: #fff;
        color: var(--jp-blue-700);
        box-shadow: 0 12px 24px rgba(16, 47, 102, 0.16);
        cursor: pointer;
      }
      .jp-collapse-tab img { width: 26px; height: 26px; object-fit: contain; }
      .jp-collapse-tab svg { width: 16px; height: 16px; }
      .jp-spin { animation: jp-spin 900ms linear infinite; }
      @keyframes jp-spin { to { transform: rotate(360deg); } }
      @keyframes jp-pulse {
        0%, 100% { transform: translateY(0); box-shadow: 0 0 0 rgba(31, 100, 224, 0); }
        50% { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(31, 100, 224, .12); }
      }
      @media (prefers-reduced-motion: reduce) {
        .jp-spin, .jp-sparkle { animation: none; }
        .jp-progress div { transition: none; }
      }
      @media (max-width: 520px) {
        .jp-panel { top: 10px; width: min(292px, calc(100vw - 20px)); height: min(680px, calc(100vh - 20px)); }
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
