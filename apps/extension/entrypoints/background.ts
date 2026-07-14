import {
  isExtensionMessage,
  type ExtensionApplicationResponse,
  type ExtensionApplicationUpsert,
  type ExtensionAutofillDiscoveryResult,
  type ExtensionAutofillRunResult,
  type ExtensionCoverLetterResponse,
  type ExtensionJobContext,
  type ExtensionJobKind,
  type ExtensionJobState,
  type ExtensionMessage,
  type ExtensionMessageResponse,
  type ExtensionTailorResponse,
} from "@jobposted/shared";
import { EXTENSION_BRIDGE_PATH, JOBPOSTED_WEB_ORIGIN } from "../src/config/env";
import {
  isAutofillTimeoutError,
  selectAutofillFrameResponse,
  type AutofillContentResponse,
  type AutofillFrameError,
} from "../src/background/frame-autofill";
import {
  createAutofillPlan,
  draftAnswer,
  ExtensionHttpError,
  fetchProfile,
  fetchResume,
  fetchResumeOptions,
  fetchTrackerPage,
  generateCoverLetterForJob,
  mapField,
  saveAnswer,
  syncApplication,
  tailorResumeForJob,
  updateTrackerItem,
  uploadResume,
} from "../src/lib/api";
import {
  clearCachedProfile,
  clearSession,
  getFreshSession,
  readCachedProfile,
  readSettings,
  writeSession,
  writeSettings,
} from "../src/lib/storage";
import {
  APPLICATION_SYNC_ALARM,
  dueApplicationSyncs,
  enqueueApplicationSync,
  markApplicationSyncAttempt,
  readPendingApplicationSyncs,
  readSyncQueueStatus,
  removeApplicationSync,
  scheduleNextApplicationSyncRetry,
} from "../src/lib/sync-queue";

interface PendingAuth {
  tabId: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

const PENDING_AUTH = new Map<string, PendingAuth>();
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const CONTENT_SCRIPT_FILE = "content-scripts/content.js";
const CONTENT_AUTOFILL_MESSAGE = "JOBPOSTED_AUTOFILL_CURRENT_PAGE";
const CONTENT_AUTOFILL_CANCEL_MESSAGE = "JOBPOSTED_CANCEL_AUTOFILL_CURRENT_PAGE";
const CONTENT_DISCOVER_MESSAGE = "JOBPOSTED_DISCOVER_CURRENT_PAGE";
const CONTENT_TRACK_MESSAGE = "JOBPOSTED_TRACK_CURRENT_PAGE";
const CONTENT_JOB_CONTEXT_MESSAGE = "JOBPOSTED_JOB_CONTEXT";
const CONTENT_PANEL_TOGGLE_MESSAGE = "JOBPOSTED_TOGGLE_IN_PAGE_PANEL";
const PANEL_HOST_ID = "jobposted-autofill-panel-host";
// Must comfortably exceed a realistic full-page fill. A form with several custom
// comboboxes (phone country, location, yes/no screening dropdowns) can spend a few
// seconds per control retrying, so the old 10s cap abandoned the form frame mid-run
// while the in-page script kept mutating the DOM — surfacing as "it glitched and gave
// up". Keep this just under the side panel's 45s outer timeout so it stays a safety net.
const FRAME_AUTOFILL_TIMEOUT_MS = 40_000;
const FRAME_AUTOFILL_CANCEL_GRACE_MS = 2_000;
type DiscoveryContentResponse = Extract<ExtensionMessageResponse, { type: "AUTOFILL_DISCOVER_ACTIVE_TAB" }>;
type TrackerContentResponse = Extract<ExtensionMessageResponse, { type: "TRACKER_ADD_ACTIVE_TAB" }>;
type JobContextContentResponse =
  | { ok: true; type: "JOB_CONTEXT"; context: ExtensionJobContext }
  | { ok: false; error: string };

class ContentAutofillError extends Error {}
class ContentTrackerError extends Error {}
type AutofillFrameResult =
  | { ok: true; response: AutofillContentResponse; timedOut?: boolean }
  | { ok: false; error: unknown; timedOut?: boolean };
type DiscoveryFrameResult =
  | { ok: true; response: DiscoveryContentResponse }
  | { ok: false; error: unknown };

function bridgeUrl(requestId: string) {
  const url = new URL(EXTENSION_BRIDGE_PATH, JOBPOSTED_WEB_ORIGIN);
  url.searchParams.set("requestId", requestId);
  return url.toString();
}

function configuredWebHostname() {
  try {
    return new URL(JOBPOSTED_WEB_ORIGIN).hostname.toLowerCase();
  } catch {
    return "jobposted.app";
  }
}

const JOBPOSTED_WEB_HOSTNAMES = new Set(
  [configuredWebHostname(), "jobposted.app", "www.jobposted.app", "jobposted.ai", "www.jobposted.ai"].filter(Boolean),
);

const ALLOW_LOCALHOST_SENDER =
  import.meta.env.MODE !== "production" ||
  import.meta.env.WXT_INCLUDE_LOCALHOST === "1" ||
  /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(JOBPOSTED_WEB_ORIGIN);

// A delivered Supabase session must come from a JobPosted web-app frame. Without this
// check, any script on an allowlisted ATS origin could reach the content-script bridge
// and post a forged session that we'd then store as the signed-in account.
function senderIsJobPostedWebApp(sender: chrome.runtime.MessageSender): boolean {
  let host = "";
  try {
    host = new URL(sender.origin || sender.url || "").hostname.toLowerCase();
  } catch {
    return false;
  }
  if (JOBPOSTED_WEB_HOSTNAMES.has(host)) return true;
  return ALLOW_LOCALHOST_SENDER && (host === "localhost" || host === "127.0.0.1");
}

function transientSyncError(error: unknown) {
  if (!(error instanceof ExtensionHttpError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

function isAutofillRunResponse(value: unknown): value is AutofillContentResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      (value as { type?: unknown }).type === "AUTOFILL_ACTIVE_TAB" &&
      typeof (value as { result?: { filled?: unknown } }).result?.filled === "number",
  );
}

function isDiscoveryResponse(value: unknown): value is DiscoveryContentResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      (value as { type?: unknown }).type === "AUTOFILL_DISCOVER_ACTIVE_TAB" &&
      typeof (value as { result?: { total?: unknown } }).result?.total === "number",
  );
}

function isTrackerAddResponse(value: unknown): value is TrackerContentResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      (value as { type?: unknown }).type === "TRACKER_ADD_ACTIVE_TAB" &&
      (value as { result?: { ok?: unknown } }).result?.ok === true,
  );
}

function tabCanReceiveAutofill(tab: chrome.tabs.Tab) {
  if (typeof tab.id !== "number") return false;
  // Chrome can omit `tab.url` on non-whitelisted pages unless we have host
  // access. Still allow the tab; executeScript will enforce the real boundary.
  if (!tab.url) return true;
  return /^(https?:|file:)/i.test(tab.url);
}

async function activeTab() {
  const candidates = [
    await chrome.tabs.query({ active: true, currentWindow: true }),
    await chrome.tabs.query({ active: true, lastFocusedWindow: true }),
    await chrome.tabs.query({ active: true, windowType: "normal" }),
  ].flat();
  const tab = candidates.find(tabCanReceiveAutofill);
  if (!tab || !tabCanReceiveAutofill(tab)) {
    throw new Error("Open a regular job application tab, then try autofill again.");
  }
  return tab as chrome.tabs.Tab & { id: number };
}

function scoreDiscoveryResult(response: DiscoveryContentResponse) {
  const result = response.result;
  if (result.total === 0) return -100;
  const required = result.fields.filter((field) => field.required).length;
  const choiceFields = result.fields.filter((field) => field.options.length > 0 || field.type === "select" || field.type === "combobox" || field.type === "radio" || field.type === "multiselect").length;
  return result.total * 3 + required * 4 + choiceFields * 2;
}

function bestDiscoveryResponse(responses: DiscoveryContentResponse[]) {
  return responses.reduce((best, response) =>
    scoreDiscoveryResult(response) > scoreDiscoveryResult(best) ? response : best,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function injectContentScriptFrames(tabId: number) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [CONTENT_SCRIPT_FILE],
  });
  const frameIds = results
    .map((result) => result.frameId)
    .filter((frameId, index, all): frameId is number => typeof frameId === "number" && all.indexOf(frameId) === index);
  return frameIds.length > 0 ? frameIds : [0];
}

async function injectContentScriptTopFrame(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: [CONTENT_SCRIPT_FILE],
  });
}

type PanelToggleResponse = { ok?: boolean; mounted?: boolean; error?: string };

async function panelIsVisible(tabId: number) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    args: [PANEL_HOST_ID],
    func: async (hostId: string) => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const host = document.getElementById(hostId);
        const rendered = Boolean(host?.shadowRoot?.querySelector(".jp-panel, .jp-tab-handle"));
        if (rendered) return true;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return false;
    },
  });
  return result?.result === true;
}

async function toggleInPagePanel(tab?: chrome.tabs.Tab) {
  const target =
    tab && tabCanReceiveAutofill(tab)
      ? (tab as chrome.tabs.Tab & { id: number })
      : await activeTab();
  await injectContentScriptTopFrame(target.id);
  const response = (await chrome.tabs.sendMessage(
    target.id,
    { type: CONTENT_PANEL_TOGGLE_MESSAGE },
    { frameId: 0 },
  )) as PanelToggleResponse | undefined;
  if (!response?.ok || response.mounted === false) {
    throw new Error(response?.error || "JobPosted could not mount the in-page panel.");
  }
  if (!(await panelIsVisible(target.id))) {
    throw new Error("JobPosted attached to this page, but the panel was not visible. Reload the page and try again.");
  }
}

function panelOpenErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/chrome:|edge:|brave:|about:|newtab|extensions/i.test(message)) {
    return "Chrome does not allow extensions to open on this tab. Open a job application page, then click JobPosted again.";
  }
  if (/Cannot access contents|The extensions gallery|Cannot access a chrome|Cannot access|Missing host permission/i.test(message)) {
    return "Chrome blocked JobPosted on this tab. Open a regular http/https job application page, then click the icon again.";
  }
  if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
    return "JobPosted could not attach to this page yet. Reload the page, then click the icon again.";
  }
  return message || "JobPosted could not open on this tab.";
}

// Browser-internal pages (chrome://, the new-tab page, the Web Store, etc.) block
// content-script injection, so the in-page dock can never mount there. On those
// tabs we fall back to the popup; everywhere else the toolbar click opens the
// dock directly (no popup) via chrome.action.onClicked.
function isRestrictedPage(url?: string): boolean {
  if (!url) return false;
  return (
    /^(chrome|edge|brave|opera|vivaldi|about|chrome-extension|chrome-search|chrome-untrusted|devtools|view-source|moz-extension|data):/i.test(url) ||
    /^https?:\/\/chromewebstore\.google\.com/i.test(url) ||
    /^https?:\/\/chrome\.google\.com\/webstore/i.test(url)
  );
}

async function syncActionPopup(tabId: number, url?: string) {
  try {
    await chrome.action.setPopup({ tabId, popup: isRestrictedPage(url) ? "popup.html" : "" });
  } catch {
    // Tab may have closed before we could update it.
  }
}

async function openPanelActiveTab(): Promise<ExtensionMessageResponse> {
  try {
    await toggleInPagePanel();
    return { ok: true, type: "PANEL_OPEN_ACTIVE_TAB" };
  } catch (error) {
    return { ok: false, error: panelOpenErrorMessage(error) };
  }
}

async function requestFrameAutofill(
  tabId: number,
  frameId: number,
  args: { continueSteps?: boolean; runId?: string },
): Promise<AutofillContentResponse> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    {
      type: CONTENT_AUTOFILL_MESSAGE,
      continueSteps: Boolean(args.continueSteps),
      // Honor the user's "Generic fallback" setting instead of forcing it on. The
      // content script only blocks on truly unknown (platform === "generic") hosts.
      forceGenericFallback: false,
      suppressAutoTrack: true,
      runId: args.runId,
    },
    { frameId },
  )) as ExtensionMessageResponse | undefined;
  if (!response) throw new Error("autofill_no_response");
  if (!response.ok) throw new ContentAutofillError(response.error);
  if (!isAutofillRunResponse(response)) throw new Error("autofill_unexpected_response");
  return response;
}

async function requestFrameAutofillCancel(
  tabId: number,
  frameId: number,
  runId: string,
): Promise<AutofillContentResponse | null> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    {
      type: CONTENT_AUTOFILL_CANCEL_MESSAGE,
      runId,
    },
    { frameId },
  )) as ExtensionMessageResponse | undefined;
  if (!response || !response.ok || !isAutofillRunResponse(response)) return null;
  return response;
}

function frameRunId(tabId: number, frameId: number) {
  return `autofill:${tabId}:${frameId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function requestFrameAutofillWithTimeout(
  tabId: number,
  frameId: number,
  args: { continueSteps?: boolean },
): Promise<AutofillFrameResult> {
  const runId = frameRunId(tabId, frameId);
  const request = requestFrameAutofill(tabId, frameId, { ...args, runId });
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), FRAME_AUTOFILL_TIMEOUT_MS);
  });
  try {
    const first = await Promise.race([request, timeout]);
    if (timeoutId) clearTimeout(timeoutId);
    if (first !== "timeout") return { ok: true, response: first };

    const timeoutError = new Error(`autofill_frame_timeout:${frameId}`);
    const cancel = requestFrameAutofillCancel(tabId, frameId, runId).catch(() => null);
    const grace = new Promise<null>((resolve) => setTimeout(() => resolve(null), FRAME_AUTOFILL_CANCEL_GRACE_MS));
    const partial = await Promise.race([
      request.catch(() => null),
      cancel,
      grace,
    ]);
    return partial
      ? { ok: true, response: partial, timedOut: true }
      : { ok: false, error: timeoutError, timedOut: true };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    return { ok: false, error };
  }
}

async function requestFrameDiscovery(tabId: number, frameId: number): Promise<DiscoveryContentResponse> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    { type: CONTENT_DISCOVER_MESSAGE },
    { frameId },
  )) as ExtensionMessageResponse | undefined;
  if (!response) throw new Error("discovery_no_response");
  if (!response.ok) throw new ContentAutofillError(response.error);
  if (!isDiscoveryResponse(response)) throw new Error("discovery_unexpected_response");
  return response;
}

async function discoverTabAutofill(tabId: number): Promise<DiscoveryContentResponse> {
  let frameIds: number[];
  try {
    frameIds = await injectContentScriptFrames(tabId);
  } catch {
    frameIds = [0];
  }

  const pending = new Map(
    frameIds.map((frameId, index) => [
      index,
      withTimeout(
        requestFrameDiscovery(tabId, frameId),
        18_000,
        `discovery_frame_timeout:${frameId}`,
      )
        .then((response): DiscoveryFrameResult => ({ ok: true, response }))
        .catch((error): DiscoveryFrameResult => ({ ok: false, error })),
    ]),
  );
  const responses: DiscoveryContentResponse[] = [];
  let firstError: unknown = null;

  while (pending.size > 0) {
    const { index, result } = await Promise.race(
      Array.from(pending, ([index, promise]) => promise.then((result) => ({ index, result }))),
    );
    pending.delete(index);
    if (result.ok) {
      responses.push(result.response);
    } else {
      firstError ??= result.error;
    }
  }

  if (responses.length > 0) return bestDiscoveryResponse(responses);

  if (firstError instanceof Error) throw firstError;
  throw new Error("discovery_no_response");
}

async function requestTabAutofill(
  tabId: number,
  args: { continueSteps?: boolean },
): Promise<AutofillContentResponse> {
  let frameIds: number[];
  try {
    frameIds = await injectContentScriptFrames(tabId);
  } catch {
    frameIds = [0];
  }

  const pending = new Map(
    frameIds.map((frameId, index) => [
      index,
      requestFrameAutofillWithTimeout(tabId, frameId, args),
    ]),
  );
  const responses: AutofillContentResponse[] = [];
  const errors: AutofillFrameError[] = [];
  let firstError: unknown = null;

  while (pending.size > 0) {
    const { index, result } = await Promise.race(
      Array.from(pending, ([index, promise]) => promise.then((result) => ({ index, result }))),
    );
    pending.delete(index);
    if (result.ok) {
      responses.push(result.response);
      if (result.timedOut) errors.push({ error: new Error(`autofill_frame_timeout:${frameIds[index] ?? "unknown"}`), timedOut: true });
    } else {
      errors.push({ error: result.error, timedOut: result.timedOut || isAutofillTimeoutError(result.error) });
      firstError ??= result.error;
    }
  }

  const selected = selectAutofillFrameResponse({ responses, errors });
  if (selected) return selected;

  if (firstError instanceof Error) throw firstError;
  const timeoutError = errors.find((error) => error.timedOut)?.error;
  if (timeoutError instanceof Error) throw timeoutError;
  throw new Error("autofill_no_response");
}

async function autofillActiveTab(args: { continueSteps?: boolean }): Promise<ExtensionAutofillRunResult> {
  const tab = await activeTab();
  const result = (await requestTabAutofill(tab.id, args)).result;
  if (result.total === 0) {
    return {
      ...result,
      tracker: null,
      trackerError: "No application fields were detected in the active tab.",
    };
  }
  try {
    const tracker = await syncAutofillResult(result);
    return { ...result, tracker };
  } catch (error) {
    return {
      ...result,
      tracker: null,
      trackerError: error instanceof Error ? error.message : "Could not sync this job to the tracker.",
    };
  }
}

async function discoverActiveTab(): Promise<ExtensionAutofillDiscoveryResult> {
  const tab = await activeTab();
  return (await discoverTabAutofill(tab.id)).result;
}

async function syncAutofillResult(result: ExtensionAutofillRunResult): Promise<ExtensionApplicationResponse | null> {
  const settings = await readSettings();
  if (!settings.autoTrackAutofill) return null;
  if (result.total === 0) return null;
  return syncApplicationWithQueue({
    source: "extension",
    platform: result.platform,
    company: result.company,
    role: result.role,
    jobUrl: result.jobUrl,
    // Autofilling a page = the user is applying → land it in the tracker's "Applied" column.
    status: "submitted",
    appliedAt: new Date().toISOString(),
    fieldsFilled: result.fields,
  });
}

async function requestFrameTracker(tabId: number, frameId: number): Promise<TrackerContentResponse> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    { type: CONTENT_TRACK_MESSAGE },
    { frameId },
  )) as ExtensionMessageResponse | undefined;
  if (!response) throw new Error("tracker_no_response");
  if (!response.ok) throw new ContentTrackerError(response.error);
  if (!isTrackerAddResponse(response)) throw new Error("tracker_unexpected_response");
  return response;
}

async function addActiveTabToTracker(): Promise<ExtensionApplicationResponse> {
  const tab = await activeTab();
  await injectContentScriptTopFrame(tab.id);
  return (await requestFrameTracker(tab.id, 0)).result;
}

function isJobContextResponse(value: unknown): value is Extract<JobContextContentResponse, { ok: true }> {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true &&
      (value as { type?: unknown }).type === "JOB_CONTEXT" &&
      typeof (value as { context?: { jobUrl?: unknown } }).context?.jobUrl === "string",
  );
}

async function requestFrameJobContext(tabId: number, frameId: number): Promise<ExtensionJobContext> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    { type: CONTENT_JOB_CONTEXT_MESSAGE },
    { frameId },
  )) as JobContextContentResponse | undefined;
  if (!response) throw new Error("job_context_no_response");
  if (!response.ok) throw new Error(response.error);
  if (!isJobContextResponse(response)) throw new Error("job_context_unexpected_response");
  return response.context;
}

async function activeJobContext(): Promise<ExtensionJobContext> {
  const tab = await activeTab();
  await injectContentScriptTopFrame(tab.id);
  return requestFrameJobContext(tab.id, 0);
}

async function syncApplicationForContext(context: ExtensionJobContext): Promise<ExtensionApplicationResponse> {
  return syncApplicationWithQueue({
    source: "extension",
    platform: context.platform,
    company: context.company,
    role: context.role,
    jobUrl: context.jobUrl,
    status: "filled",
    appliedAt: new Date().toISOString(),
    fieldsFilled: [],
  });
}

async function tailorActiveTab(): Promise<ExtensionTailorResponse> {
  const context = await activeJobContext();
  const tracker = await syncApplicationForContext(context);
  return tailorResumeForJob({
    ...context,
    jobId: tracker.jobId,
    applicationId: tracker.applicationId,
  });
}

async function coverLetterActiveTab(): Promise<ExtensionCoverLetterResponse> {
  const context = await activeJobContext();
  const tracker = await syncApplicationForContext(context);
  return generateCoverLetterForJob({
    ...context,
    jobId: tracker.jobId,
    applicationId: tracker.applicationId,
  });
}

async function syncApplicationWithQueue(
  payload: ExtensionApplicationUpsert,
): Promise<ExtensionApplicationResponse> {
  try {
    return await syncApplication(payload);
  } catch (error) {
    if (!transientSyncError(error)) throw error;
    const queued = await enqueueApplicationSync(
      payload,
      error instanceof Error ? error.message : "sync_failed",
    );
    return {
      ok: true,
      applicationId: null,
      jobId: payload.jobId ?? null,
      queued: true,
      attempts: queued.attempts,
      queuedAt: queued.queuedAt,
    };
  }
}

// `force` (used by the panel's "flush now" path) ignores per-item backoff so
// reopening the panel can recover immediately instead of waiting out the
// escalating 30s→60m schedule. The alarm-driven path leaves it false.
async function retryQueuedApplicationSyncs(force = false) {
  const queue = await readPendingApplicationSyncs();
  const due = force ? queue : dueApplicationSyncs(queue);
  for (const item of due) {
    try {
      await syncApplication(item.payload);
      await removeApplicationSync(item.id);
    } catch (error) {
      if (!transientSyncError(error)) {
        await removeApplicationSync(item.id);
        continue;
      }
      await markApplicationSyncAttempt(
        item.id,
        error instanceof Error ? error.message : "sync_failed",
      );
    }
  }
  await scheduleNextApplicationSyncRetry();
  return readSyncQueueStatus();
}

async function startAuth(): Promise<ExtensionMessageResponse> {
  const requestId = crypto.randomUUID();
  const tab = await chrome.tabs.create({ url: bridgeUrl(requestId), active: true });
  if (typeof tab.id !== "number") return { ok: false, error: "tab_create_failed" };
  const timeoutId = setTimeout(() => {
    const pending = PENDING_AUTH.get(requestId);
    if (!pending) return;
    PENDING_AUTH.delete(requestId);
    void chrome.tabs.remove(pending.tabId).catch(() => undefined);
  }, AUTH_TIMEOUT_MS);
  PENDING_AUTH.set(requestId, { tabId: tab.id, timeoutId });
  return { ok: true, type: "AUTH_START", requestId };
}

// ── Long-job resilience ──────────────────────────────────────────────────────
// A tailor/cover run is a 1–2 min fetch in this (tab-agnostic) service worker.
// Two safeguards: a keepalive ping so Chrome doesn't tear the worker down mid-request,
// and per-tab persisted state so the in-page panel can recover the result after a tab
// switch, panel reopen, or reload (the request outlives the content script).
let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let activeJobCount = 0;

function startJobKeepAlive() {
  activeJobCount += 1;
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    // Any trivial async call resets the worker's ~30s idle timer so it stays alive.
    void chrome.runtime.getPlatformInfo().catch(() => undefined);
  }, 20_000);
}

function stopJobKeepAlive() {
  activeJobCount = Math.max(0, activeJobCount - 1);
  if (activeJobCount === 0 && keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

async function writeJobState(tabId: number | undefined, state: ExtensionJobState | null) {
  if (tabId == null) return;
  const key = `job:${tabId}`;
  if (state) await chrome.storage.session.set({ [key]: state });
  else await chrome.storage.session.remove(key);
}

async function readJobState(tabId: number | undefined): Promise<ExtensionJobState | null> {
  if (tabId == null) return null;
  const key = `job:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as ExtensionJobState | undefined) ?? null;
}

// Runs a tailor/cover job while persisting its lifecycle so the panel can recover it.
async function runTrackedJob<T extends ExtensionTailorResponse | ExtensionCoverLetterResponse>(
  tabId: number | undefined,
  kind: ExtensionJobKind,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  await writeJobState(tabId, { kind, status: "running", startedAt, updatedAt: startedAt });
  startJobKeepAlive();
  try {
    const result = await run();
    await writeJobState(tabId, {
      kind,
      status: "done",
      startedAt,
      updatedAt: Date.now(),
      tailor: kind === "tailor" ? (result as ExtensionTailorResponse) : null,
      coverLetter: kind === "cover-letter" ? (result as ExtensionCoverLetterResponse) : null,
    });
    return result;
  } catch (error) {
    await writeJobState(tabId, {
      kind,
      status: "error",
      startedAt,
      updatedAt: Date.now(),
      error: error instanceof Error ? error.message : "Action failed.",
    });
    throw error;
  } finally {
    stopJobKeepAlive();
  }
}

async function handleMessage(message: ExtensionMessage, tabId?: number): Promise<ExtensionMessageResponse> {
  switch (message.type) {
    case "AUTH_START":
      return startAuth();
    case "AUTH_STATUS": {
      const session = await getFreshSession();
      return {
        ok: true,
        type: "AUTH_STATUS",
        authenticated: Boolean(session?.accessToken),
        email: session?.user?.email ?? null,
      };
    }
    case "AUTH_SESSION_DELIVERY": {
      await writeSession(message.session);
      // A delivered session may belong to a different account than the one we
      // cached for; drop the cached profile so we never show stale data.
      await clearCachedProfile();
      const requestId = message.requestId;
      if (requestId) {
        const pending = PENDING_AUTH.get(requestId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          PENDING_AUTH.delete(requestId);
          setTimeout(() => void chrome.tabs.remove(pending.tabId).catch(() => undefined), 650);
        }
      }
      return {
        ok: true,
        type: "AUTH_STATUS",
        authenticated: true,
        email: message.session.user?.email ?? null,
      };
    }
    case "AUTH_SIGN_OUT":
      await clearSession();
      return { ok: true, type: "AUTH_SIGN_OUT" };
    case "PROFILE_GET": {
      if (message.cachedOnly) {
        const cached = await readCachedProfile();
        return { ok: true, type: "PROFILE_GET", profile: cached?.profile ?? null };
      }
      return { ok: true, type: "PROFILE_GET", profile: await fetchProfile(message.forceRefresh) };
    }
    case "RESUME_GET":
      return { ok: true, type: "RESUME_GET", resume: await fetchResume(message.jobId) };
    case "FIELD_MAP":
      return { ok: true, type: "FIELD_MAP", mapping: await mapField(message.field, message.profile) };
    case "AUTOFILL_PLAN":
      return { ok: true, type: "AUTOFILL_PLAN", plan: await createAutofillPlan(message.payload) };
    case "PANEL_OPEN_ACTIVE_TAB":
      return openPanelActiveTab();
    case "AUTOFILL_DISCOVER_ACTIVE_TAB":
      return { ok: true, type: "AUTOFILL_DISCOVER_ACTIVE_TAB", result: await discoverActiveTab() };
    case "AUTOFILL_ACTIVE_TAB":
      return { ok: true, type: "AUTOFILL_ACTIVE_TAB", result: await autofillActiveTab(message) };
    case "TRACKER_ADD_ACTIVE_TAB":
      return { ok: true, type: "TRACKER_ADD_ACTIVE_TAB", result: await addActiveTabToTracker() };
    case "TAILOR_ACTIVE_TAB":
      return {
        ok: true,
        type: "TAILOR_ACTIVE_TAB",
        result: await runTrackedJob(tabId, "tailor", tailorActiveTab),
      };
    case "COVER_LETTER_ACTIVE_TAB":
      return {
        ok: true,
        type: "COVER_LETTER_ACTIVE_TAB",
        result: await runTrackedJob(tabId, "cover-letter", coverLetterActiveTab),
      };
    case "JOB_STATE_QUERY":
      return { ok: true, type: "JOB_STATE_QUERY", state: await readJobState(tabId) };
    case "JOB_STATE_CLEAR":
      await writeJobState(tabId, null);
      return { ok: true, type: "JOB_STATE_CLEAR" };
    case "TRACKER_LIST":
      {
        const page = await fetchTrackerPage({
          stage: message.stage,
          limit: message.limit,
          offset: message.offset,
        });
        return { ok: true, type: "TRACKER_LIST", items: page.items, pagination: page.pagination };
      }
    case "TRACKER_UPDATE":
      return {
        ok: true,
        type: "TRACKER_UPDATE",
        item: await updateTrackerItem({
          id: message.id,
          stage: message.stage,
          notes: message.notes,
          resumeDocId: message.resumeDocId,
        }),
      };
    case "RESUME_LIST":
      return { ok: true, type: "RESUME_LIST", resumes: await fetchResumeOptions() };
    case "RESUME_UPLOAD":
      return {
        ok: true,
        type: "RESUME_UPLOAD",
        resume: await uploadResume({ name: message.name, dataBase64: message.dataBase64 }),
      };
    case "OPEN_TAB":
      // Content scripts can't touch chrome.tabs; they delegate tab creation here.
      await chrome.tabs.create({ url: message.url, active: true });
      return { ok: true, type: "OPEN_TAB" };
    case "OPEN_OPTIONS":
      // chrome.runtime.openOptionsPage is unavailable in content scripts; the in-page
      // panel delegates here so the options page opens (or focuses if already open).
      await chrome.runtime.openOptionsPage();
      return { ok: true, type: "OPEN_OPTIONS" };
    case "APPLICATION_SYNC":
      return { ok: true, type: "APPLICATION_SYNC", result: await syncApplicationWithQueue(message.payload) };
    case "APPLICATION_SYNC_RETRY":
      return { ok: true, type: "APPLICATION_SYNC_RETRY", status: await retryQueuedApplicationSyncs(true) };
    case "SYNC_QUEUE_STATUS":
      return { ok: true, type: "SYNC_QUEUE_STATUS", status: await readSyncQueueStatus() };
    case "ANSWER_SAVE":
      await saveAnswer(message.answer);
      return { ok: true, type: "ANSWER_SAVE" };
    case "ANSWER_DRAFT":
      return { ok: true, type: "ANSWER_DRAFT", answer: await draftAnswer(message.payload) };
    case "SETTINGS_GET":
      return { ok: true, type: "SETTINGS_GET", settings: await readSettings() };
    case "SETTINGS_SET":
      return { ok: true, type: "SETTINGS_SET", settings: await writeSettings(message.settings) };
    case "OVERLAY_STATUS":
      return { ok: true, type: "OVERLAY_STATUS", supported: true, platform: "generic" };
  }
}

export default defineBackground(() => {
  void scheduleNextApplicationSyncRetry();

  // Default the toolbar button to "no popup" so a click opens the in-page dock
  // directly. The popup is re-enabled per-tab only on restricted pages below.
  void chrome.action.setPopup({ popup: "" }).catch(() => undefined);
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id === "number") void syncActionPopup(tab.id, tab.url);
    }
  }).catch(() => undefined);

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" || typeof changeInfo.url === "string") {
      void syncActionPopup(tabId, tab.url);
    }
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs
      .get(tabId)
      .then((tab) => syncActionPopup(tabId, tab.url))
      .catch(() => undefined);
  });

  chrome.action.onClicked.addListener((tab) => {
    void toggleInPagePanel(tab).catch((error) => {
      const text = panelOpenErrorMessage(error).slice(0, 80);
      void chrome.action.setBadgeText({ text: "!" }).catch(() => undefined);
      void chrome.action.setTitle({ title: `JobPosted: ${text}` }).catch(() => undefined);
      setTimeout(() => {
        void chrome.action.setBadgeText({ text: "" }).catch(() => undefined);
        void chrome.action.setTitle({ title: "JobPosted" }).catch(() => undefined);
      }, 3000);
    });
  });

  chrome.runtime.onStartup?.addListener(() => {
    void scheduleNextApplicationSyncRetry();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== APPLICATION_SYNC_ALARM) return;
    void retryQueuedApplicationSyncs();
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const [requestId, pending] of PENDING_AUTH) {
      if (pending.tabId !== tabId) continue;
      clearTimeout(pending.timeoutId);
      PENDING_AUTH.delete(requestId);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionMessage(message)) return false;
    if (message.type === "AUTH_SESSION_DELIVERY" && !senderIsJobPostedWebApp(sender)) {
      sendResponse({ ok: false, error: "untrusted_sender" });
      return true;
    }
    void handleMessage(message, sender.tab?.id)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "background_error",
          status:
            error && typeof error === "object" && "status" in error
              ? Number((error as { status: unknown }).status)
              : undefined,
        });
      });
    return true;
  });
});
