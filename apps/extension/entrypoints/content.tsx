import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
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
import { PanelStyles } from "../src/content/panel-styles";
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
import { companyLogoUrlFor } from "../src/content/company-logo";
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
  valuePreview?: string | null;
}

type PanelToast = {
  id: number;
  message: string;
};

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

// The in-page panel lives in a shadow root, but @font-face declared *inside* a
// shadow tree is ignored by the browser — fonts must be registered on the host
// document. We bundle Plus Jakarta Sans (the JobPosted UI font) and register it
// at the document level so the panel renders in-brand instead of falling back to
// whatever system font the current site happens to use.
function injectPanelFont() {
  if (document.getElementById("jobposted-panel-font")) return;
  const latin = assetUrl("fonts/plus-jakarta-sans-latin.woff2");
  const latinExt = assetUrl("fonts/plus-jakarta-sans-latin-ext.woff2");
  if (!latin || !latinExt) return;
  const style = document.createElement("style");
  style.id = "jobposted-panel-font";
  style.textContent = `
    @font-face {
      font-family: "Plus Jakarta Sans";
      font-style: normal;
      font-weight: 400 800;
      font-display: swap;
      src: url("${latin}") format("woff2");
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
    @font-face {
      font-family: "Plus Jakarta Sans";
      font-style: normal;
      font-weight: 400 800;
      font-display: swap;
      src: url("${latinExt}") format("woff2");
      unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
    }
  `;
  (document.head ?? document.documentElement).appendChild(style);
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

// Live DOM elements behind the panel's checklist rows, so clicking a row can scroll
// the page to that exact field. Refreshed on every discovery pass; when the page
// re-renders a field (stale reference), we fall back to re-extracting by label.
const panelFieldElements = new Map<string, HTMLElement>();

function rememberPanelFieldElements(fields: PageField[], reset = false) {
  if (reset) panelFieldElements.clear();
  for (const field of fields) {
    if (field.element instanceof HTMLElement) panelFieldElements.set(field.fieldId, field.element);
  }
}

let fieldFlashTimer: number | null = null;
let fieldFlashTarget: HTMLElement | null = null;

function flashPageField(element: HTMLElement) {
  if (fieldFlashTarget) fieldFlashTarget.classList.remove("jp-field-highlight");
  if (fieldFlashTimer != null) window.clearTimeout(fieldFlashTimer);
  element.classList.add("jp-field-highlight");
  fieldFlashTarget = element;
  fieldFlashTimer = window.setTimeout(() => {
    element.classList.remove("jp-field-highlight");
    fieldFlashTarget = null;
    fieldFlashTimer = null;
  }, 1800);
}

function panelLabelKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Scroll the host page to the form field behind a checklist row and flash it. */
function scrollPageToPanelField(field: Pick<PanelField, "fieldId" | "label">) {
  let target = panelFieldElements.get(field.fieldId) ?? null;
  if (!target || !target.isConnected) {
    // The widget was re-rendered (or this run streamed no elements) — re-extract and
    // match by id first, then by normalized label.
    const wanted = panelLabelKey(field.label);
    const candidates = extractPageFields(document);
    const match =
      candidates.find((candidate) => candidate.fieldId === field.fieldId) ??
      candidates.find((candidate) => panelLabelKey(candidate.label) === wanted);
    if (match) {
      rememberPanelFieldElements([match]);
      target = match.element;
    }
  }
  if (!target || !target.isConnected) return false;
  injectPageHighlightStyle();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  flashPageField(target);
  return true;
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

    // Autofill/discovery/track runs can take up to a minute; by the time they
    // resolve the popup that sent the message may have closed, so sendResponse
    // throws "Attempting to use a disconnected port object". Swallow that instead
    // of letting it surface as an uncaught error in the page console. Typed loosely
    // (mirroring chrome's `any` sendResponse) because JOB_CONTEXT/PANEL toggle reply
    // with content-script-internal shapes; protocol replies keep their own `satisfies`.
    const respond = (value: unknown) => {
      try {
        sendResponse(value);
      } catch {
        // Message port already closed — the caller went away; nothing to deliver.
      }
    };

    if (request.type === CONTENT_TRACK_MESSAGE) {
      void trackCurrentPage()
        .then((result) => {
          respond({ ok: true, type: "TRACKER_ADD_ACTIVE_TAB", result } satisfies ExtensionMessageResponse);
        })
        .catch((error: unknown) => {
          respond({
            ok: false,
            error: error instanceof Error ? error.message : "Could not add this job to the tracker.",
          } satisfies ExtensionMessageResponse);
        });
      return true;
    }

    if (request.type === CONTENT_JOB_CONTEXT_MESSAGE) {
      try {
        respond({ ok: true, type: "JOB_CONTEXT", context: jobContextForCurrentPage() });
      } catch (error) {
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "Could not read this job page.",
        });
      }
      return true;
    }

    if (request.type === CONTENT_PANEL_TOGGLE_MESSAGE) {
      const mounted = mountInPagePanel({ autoOpen: true });
      if (mounted) window.dispatchEvent(new CustomEvent(PANEL_OPEN_EVENT));
      respond({
        ok: mounted,
        mounted,
        error: mounted ? undefined : "JobPosted can only open in the top frame of a regular web page.",
      });
      return true;
    }

    if (request.type === CONTENT_DISCOVER_MESSAGE) {
      void discoverAutofillPage()
        .then((result) => {
          respond({ ok: true, type: "AUTOFILL_DISCOVER_ACTIVE_TAB", result } satisfies ExtensionMessageResponse);
        })
        .catch((error: unknown) => {
          respond({
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
        respond({ ok: true, type: "AUTOFILL_ACTIVE_TAB", result } satisfies ExtensionMessageResponse);
      })
      .catch((error: unknown) => {
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "Autofill failed.",
        } satisfies ExtensionMessageResponse);
      });
    return true;
  });
}

// A timeout that loses a Promise.race must still clear its timer — otherwise the
// pending setTimeout (and the closure it holds) lingers for the full duration after
// the real response already won. Returns the racing promise plus a canceler.
function timeoutResponse(ms: number, error: string): { promise: Promise<ExtensionMessageResponse>; cancel: () => void } {
  let timerId: number | null = null;
  const promise = new Promise<ExtensionMessageResponse>((resolve) => {
    timerId = window.setTimeout(() => resolve({ ok: false, error }), ms);
  });
  return {
    promise,
    cancel: () => {
      if (timerId != null) window.clearTimeout(timerId);
      timerId = null;
    },
  };
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
    valuePreview: record.valuePreview ?? null,
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
    valuePreview: record.valuePreview ?? null,
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
  const [trackerSyncError, setTrackerSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const statusRef = useRef<PanelStatus>("idle");
  // Lazy-init: passing these calls straight to useRef() re-runs the full-document
  // scan on *every* render (useRef ignores the arg after mount but still evaluates
  // it). The panel re-renders on every streamed field during a fill, so that was
  // dozens of wasted DOM sweeps per run — enough to trip rAF "handler took Nms".
  const pageSignatureRef = useRef<string | null>(null);
  const pageHrefRef = useRef(window.location.href);
  const pageStepRef = useRef<string | null>(null);
  if (pageSignatureRef.current === null) pageSignatureRef.current = panelPageSignature();
  if (pageStepRef.current === null) pageStepRef.current = panelStepMarker();
  const [lastRunStatus, setLastRunStatus] = useState<"done" | "error">("done");
  const [handleTop, setHandleTop] = useState(() => readStoredHandleTop());
  const [siteMark, setSiteMark] = useState<string | null>(() => pageFaviconUrl());
  const [toast, setToast] = useState<PanelToast | null>(null);
  const dragRef = useRef({ dragging: false, moved: false, startY: 0, startTop: 0 });
  const toastTimerRef = useRef<number | null>(null);

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

  function showToast(message: string) {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3400);
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
    return () => {
      if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
    };
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

  // Warm the tracker cache as soon as the panel is open, regardless of the active
  // tab, so the first visit to Track paints instantly instead of waiting on the
  // network. Only fetches once per page session; TrackerTab revalidates thereafter.
  useEffect(() => {
    if (!collapsed && trackerCache === null) void loadTrackerItems();
  }, [collapsed]);

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
        // Stop polling after ~3 min. If the MV3 service worker was killed mid-run the
        // state stays "running" forever, and an unbounded 1.5s poll would churn for the
        // rest of the page's life. Past the cap we surface a timeout and clear the state.
        let polls = 0;
        const maxPolls = 120;
        pollId = window.setInterval(async () => {
          polls += 1;
          const poll = await message<ExtensionMessageResponse>({ type: "JOB_STATE_QUERY" });
          if (cancelled) return;
          if (poll.ok && poll.type === "JOB_STATE_QUERY" && poll.state && poll.state.status !== "running") {
            jobResultRef.current = outcomeFromJobState(poll.state);
            setJobPhase(poll.state.status === "error" ? "error" : "done");
            stopPoll();
            return;
          }
          if (polls >= maxPolls) {
            jobResultRef.current = { kind: "error", message: "This is taking longer than expected — please try again." };
            setJobPhase("error");
            void message({ type: "JOB_STATE_CLEAR" });
            stopPoll();
          }
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
      setSynced(false);
      setSavedStage("applied");
      setAlreadyPresent(false);
      setTrackerQueued(false);
      setTrackerSyncError(null);
      setSaving(false);
      setSaveError(null);
      setJobComplete(null);
      setJobActionMessage(null);
      refreshIdentity();
      setSiteMark(pageFaviconUrl());
      updateStatus("idle");
    };

    let lastCheckAt = 0;
    const MIN_CHECK_GAP_MS = 250;

    const checkForPageChange = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        if (panelStatusIsRunning(statusRef.current)) return;
        // Coalesce mutation bursts: recomputing the whole-page signature is a full
        // DOM sweep, so cap it to ~4x/s. The 750ms interval below is the backstop, so
        // navigation is still detected once the mutations settle.
        const now = Date.now();
        if (now - lastCheckAt < MIN_CHECK_GAP_MS) return;
        lastCheckAt = now;
        const nextSignature = panelPageSignature();
        if (nextSignature === pageSignatureRef.current) return;
        const nextHref = window.location.href;
        const nextStep = panelStepMarker();
        const hrefChanged = nextHref !== pageHrefRef.current;
        const stepChanged = nextStep !== pageStepRef.current;
        pageSignatureRef.current = nextSignature;
        pageHrefRef.current = nextHref;
        pageStepRef.current = nextStep;
        // Filling the form mutates the page (revealed inputs, validation text, async
        // widgets) and used to wipe the results screen the moment a run finished. A
        // finished run only resets on real navigation: a URL or step change.
        if ((statusRef.current === "done" || statusRef.current === "error") && !hrefChanged && !stepChanged) return;
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
      if (!status) return;
      if (status.pending === 0) {
        setTrackerQueued(false);
        setTrackerSyncError(null);
        setSynced(true);
        if (intervalId != null) window.clearInterval(intervalId);
        return;
      }
      // Still pending. Once a retry has actually run and failed (lastAttemptAt set),
      // stop pretending it's mid-save and surface the reason so the user isn't stuck
      // watching an indefinite spinner. We keep polling in the background so a later
      // success still flips it to "saved".
      if (status.lastAttemptAt && status.lastError) {
        setTrackerSyncError(status.lastError);
      }
    };

    // Force an immediate flush right away (covers "back online" and bypasses the
    // escalating backoff), then poll on the queue's own schedule so we don't hammer
    // a failing server every 15s.
    void reconcile(true);
    intervalId = window.setInterval(() => void reconcile(false), 15_000);

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
    pageHrefRef.current = window.location.href;
    pageStepRef.current = panelStepMarker();
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
            rememberPanelFieldElements(discoveredFields, true);
            setFields(discoveredFields.map((field) => panelFieldFromPageField(field)));
          },
          onFieldStart: (field) => {
            rememberPanelFieldElements([field]);
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
        setLastRunStatus("error");
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
        setLastRunStatus("done");
        updateStatus("done");
        showToast("Autofill complete. Review, then submit when ready.");
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
    const timeout = timeoutResponse(130_000, "The request timed out.");
    try {
      const response = await Promise.race([
        message<ExtensionMessageResponse>({ type: action === "tailor" ? "TAILOR_ACTIVE_TAB" : "COVER_LETTER_ACTIVE_TAB" }),
        timeout.promise,
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
    } finally {
      timeout.cancel();
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
      showToast(result.kind === "tailor" ? "Resume tailored for this role." : "Cover letter ready.");
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
  const filledCount = fields.filter((field) => field.status === "filled").length;

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
            <span className="jp-status" data-s={status}>
              <i aria-hidden="true" />
              {status === "done" && result
                ? doneSummary
                : status === "scanning" || status === "planning"
                  ? "Scanning this page…"
                  : status === "filling"
                    ? "Autofilling…"
                    : status === "error"
                      ? "Needs your review"
                      : "Application copilot"}
            </span>
          </div>
        </div>
        <div className="jp-header-actions">
          <button type="button" className="jp-text-action" onClick={() => window.open("mailto:feedback@jobposted.app", "_blank")}>
            Feedback
          </button>
          <button type="button" className="jp-icon-action" title="Settings" onClick={() => void message({ type: "OPEN_OPTIONS" })}>
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

            {result && fields.length > 0 ? (
              <button type="button" className="jp-last-run jp-rise" data-s={lastRunStatus} onClick={() => updateStatus(lastRunStatus)}>
                {lastRunStatus === "error" ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                <span>
                  {lastRunStatus === "error"
                    ? "Last fill needs review"
                    : `Last fill · ${result.filled}/${result.total} fields filled`}
                </span>
                <em>View</em>
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}

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
                <ChecklistGroup title="Required" fields={groups.required} onSelect={scrollPageToPanelField} />
                <ChecklistGroup title="Optional" fields={groups.optional} onSelect={scrollPageToPanelField} />
              </div>
            ) : (
              <div className="jp-empty-state">Looking for application questions…</div>
            )}
          </div>
        ) : null}

        {status === "filling" || status === "done" || status === "error" ? (
          <div className="jp-panel-body jp-fill-body">
            <div className="jp-progress-head">
              {!filling ? (
                <button type="button" className="jp-icon-action jp-run-back" title="Back" onClick={() => updateStatus("idle")}>
                  <ChevronLeft aria-hidden="true" />
                </button>
              ) : null}
              <strong>{status === "done" ? "All set" : status === "error" ? "Needs review" : "Autofilling"}</strong>
              {fields.length > 0 ? (
                <span className="jp-run-count" aria-label={`${filledCount} of ${fields.length} fields filled`}>
                  {filledCount}
                  <em>/{fields.length}</em>
                </span>
              ) : null}
              {filling ? (
                <button type="button" className="jp-cancel" onClick={() => { cancelRef.current = true; }}>
                  Cancel
                </button>
              ) : null}
            </div>
            <div className={`jp-progress${filling ? " jp-progress-live" : ""}`}><div style={{ width: `${Math.max(4, progress || fillPercent)}%` }} /></div>
            {!filling ? (
              <button type="button" className="jp-autofill-button" disabled={Boolean(authError)} onClick={() => void runPanelAutofill()}>
                <Wand2 aria-hidden="true" />
                Autofill again
              </button>
            ) : null}
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
            <div className="jp-checklist">
              <ChecklistGroup title="Required" fields={groups.required} onSelect={scrollPageToPanelField} />
              <ChecklistGroup title="Optional" fields={groups.optional} onSelect={scrollPageToPanelField} />
            </div>
          </div>
        ) : null}
        </>
        ) : null}
      </div>

      {toast ? (
        <div key={toast.id} className="jp-toast" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <span>{toast.message}</span>
        </div>
      ) : null}

      {tab === "autofill" && (synced || trackerQueued || resultError) ? (
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
        ) : trackerQueued && !online ? (
          <div className="jp-foot-hint jp-rise">
            <Loader2 className="jp-spin" aria-hidden="true" />
            <span>You’re offline — we’ll save to your tracker once you reconnect.</span>
          </div>
        ) : trackerQueued && trackerSyncError ? (
          <div className="jp-synced jp-synced-error jp-rise">
            <AlertTriangle aria-hidden="true" />
            <span>Couldn’t save to tracker. {trackerSyncError}</span>
            <button
              type="button"
              onClick={() => {
                setTrackerSyncError(null);
                void message({ type: "APPLICATION_SYNC_RETRY" });
              }}
            >
              Retry
            </button>
          </div>
        ) : trackerQueued ? (
          <div className="jp-foot-hint jp-rise">
            <Loader2 className="jp-spin" aria-hidden="true" />
            <span>Saving to your tracker…</span>
          </div>
        ) : resultError ? (
          <div className="jp-synced jp-synced-error jp-rise">
            <AlertTriangle aria-hidden="true" />
            <span>Couldn’t save to tracker. {resultError}</span>
          </div>
        ) : null}
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

// Segmented control filters — "All" and "Closed" are intentionally omitted so the
// control fits without horizontal scroll. Closed items simply don't surface here.
const TRACKER_FILTERS = TRACKER_STAGES.filter((entry) => entry.key !== "closed");

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

// Tracker list cache — shared across TrackerTab remounts (every tab switch fully
// unmounts the tab) and a panel-open prefetch, so the list renders instantly and
// only shows a spinner on the very first load of the page session. Every mount
// still revalidates against the database in the background. In-flight dedup keeps
// the prefetch and the tab open from firing two concurrent requests.
let trackerCache: ExtensionTrackerItem[] | null = null;
let trackerInFlight: Promise<{ items: ExtensionTrackerItem[] | null; error: string | null }> | null = null;
// Remember the last-selected stage filter across TrackerTab remounts (a tab switch
// fully unmounts the tab) so returning to Track lands on the same column — Applied
// stays on Applied, Interview on Interview, etc. — instead of snapping back to Saved.
let trackerFilter = "inbox";

function loadTrackerItems(): Promise<{ items: ExtensionTrackerItem[] | null; error: string | null }> {
  if (trackerInFlight) return trackerInFlight;
  trackerInFlight = (async () => {
    try {
      const response = await message<ExtensionMessageResponse>({ type: "TRACKER_LIST" });
      if (response.ok && response.type === "TRACKER_LIST") {
        trackerCache = response.items;
        return { items: response.items, error: null };
      }
      return { items: null, error: response.ok ? null : response.error };
    } finally {
      trackerInFlight = null;
    }
  })();
  return trackerInFlight;
}

function TrackerTab({ onOpen }: { onOpen: (url: string) => void }) {
  // Seed from the cache so a return visit paints immediately instead of spinning.
  const [items, setItems] = useState<ExtensionTrackerItem[] | null>(trackerCache);
  const [error, setError] = useState<string | null>(null);
  // Seed from the remembered filter so a return visit restores the last column.
  const [filter, setFilterState] = useState<string>(trackerFilter);
  const setFilter = (key: string) => {
    trackerFilter = key;
    setFilterState(key);
  };

  useEffect(() => {
    let cancelled = false;
    void loadTrackerItems().then(({ items: fresh, error: err }) => {
      if (cancelled) return;
      if (fresh) {
        setItems(fresh);
        setError(null);
      } else {
        setError(err);
        // Keep showing cached rows on a failed refresh; only fall to the empty
        // state when there was nothing cached to begin with.
        setItems((prev) => prev ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = items ?? [];
  const filtered = list.filter((item) => trackerStageKey(item.stage) === filter);
  const trackerFilterIndex = Math.max(0, TRACKER_FILTERS.findIndex((entry) => entry.key === filter));

  function applyUpdate(updated: ExtensionTrackerItem) {
    setItems((prev) => {
      const next = prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev;
      if (next) trackerCache = next;
      return next;
    });
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
        <span className="jp-tk-tabs-glow" style={{ transform: `translateX(${trackerFilterIndex * 100}%)` }} aria-hidden="true" />
        {TRACKER_FILTERS.map((stage) => (
          <button
            key={stage.key}
            type="button"
            role="tab"
            aria-selected={filter === stage.key}
            className={`jp-tk-tab${filter === stage.key ? " jp-tk-tab-on" : ""}`}
            onClick={() => setFilter(stage.key)}
          >
            {stage.label}
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
  const logoUrl = item.companyLogoUrl || companyLogoUrlFor(item.company, item.jobUrl);
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
          {logoUrl && logoOk ? (
            <img src={logoUrl} alt="" onError={() => setLogoOk(false)} />
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
  // Track the URL that failed rather than a sticky boolean: this card is a persistent
  // singleton whose company changes on in-app navigation, so a boolean "logo failed"
  // flag would stay false and force the monogram for every later company. Keying off
  // the URL lets a new company re-attempt its own logo.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
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
  const logoUrl = companyLogoUrlFor(company, typeof window !== "undefined" ? window.location.href : null);
  return (
    <section className={`jp-job-card jp-rise${needsReview ? " jp-job-card-review" : ""}`}>
      {logoUrl && failedLogo !== logoUrl ? (
        <span className="jp-job-logo jp-job-logo-img">
          <img src={logoUrl} alt="" onError={() => setFailedLogo(logoUrl)} />
        </span>
      ) : (
        <span
          className="jp-job-logo"
          style={{ background: `hsl(${mono.hue} 82% 95%)`, color: `hsl(${mono.hue} 64% 40%)` }}
        >
          {mono.letter || <Building2 aria-hidden="true" />}
        </span>
      )}
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

function ChecklistGroup({
  title,
  fields,
  onSelect,
}: {
  title: string;
  fields: PanelField[];
  onSelect?: (field: PanelField) => void;
}) {
  if (fields.length === 0) return null;
  const filled = fields.filter((field) => field.status === "filled").length;
  return (
    <section className="jp-checklist-group">
      <h3>
        <span>{title}</span>
        <em aria-label={`${filled} of ${fields.length} filled`}>
          {filled}/{fields.length}
        </em>
      </h3>
      {fields.map((field, index) => (
        <button
          type="button"
          key={field.fieldId}
          className={`jp-field-row jp-row-in${field.confidence > 0 && field.confidence < 0.7 ? " jp-field-row-warn" : ""}${field.status === "active" ? " jp-field-row-active" : ""}`}
          style={{ animationDelay: `${Math.min(index, 12) * 24}ms` }}
          title="Show this field on the page"
          onClick={() => onSelect?.(field)}
        >
          {fieldStatusIcon(field)}
          <span className="jp-field-main">
            <span className="jp-field-label">{field.label}</span>
            {field.valuePreview && (field.status === "filled" || field.status === "needs_user") ? (
              <span className="jp-field-val">{field.valuePreview}</span>
            ) : null}
          </span>
        </button>
      ))}
    </section>
  );
}

// Panel styles live in ../src/content/panel-styles (extracted for the design system).

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

// The single React root behind the in-page dock. Kept at module scope so a
// remount (stale host) or a context-invalidation teardown can unmount it and run
// every effect cleanup — otherwise the panel's observers, intervals, and event
// listeners keep running against a detached tree for the rest of the page's life.
let panelRoot: Root | null = null;

function unmountPanelRoot() {
  if (!panelRoot) return;
  try {
    panelRoot.unmount();
  } catch {
    // Root already torn down — nothing to clean up.
  }
  panelRoot = null;
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
    // Host lingers but its panel is gone (crashed render, prior teardown). Unmount
    // the old root before dropping the node so its effects don't leak.
    unmountPanelRoot();
    existing.remove();
  }
  injectPanelFont();
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
  panelRoot = createRoot(root);
  panelRoot.render(
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
    // so the page is left clean and no stale chrome.* calls keep firing. Unmount the
    // React root first so every effect cleanup (MutationObserver, intervals, window
    // listeners, background polls) actually runs instead of leaking past the host.
    unmountPanelRoot();
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
