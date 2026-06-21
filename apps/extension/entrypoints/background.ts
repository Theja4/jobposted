import {
  isExtensionMessage,
  type ExtensionApplicationResponse,
  type ExtensionApplicationUpsert,
  type ExtensionAutofillRunResult,
  type ExtensionCoverLetterResponse,
  type ExtensionJobContext,
  type ExtensionMessage,
  type ExtensionMessageResponse,
  type ExtensionTailorResponse,
} from "@jobposted/shared";
import { EXTENSION_BRIDGE_PATH, JOBPOSTED_WEB_ORIGIN } from "../src/config/env";
import {
  ExtensionHttpError,
  fetchProfile,
  fetchResume,
  generateCoverLetterForJob,
  mapField,
  saveAnswer,
  syncApplication,
  tailorResumeForJob,
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
const CONTENT_TRACK_MESSAGE = "JOBPOSTED_TRACK_CURRENT_PAGE";
const CONTENT_JOB_CONTEXT_MESSAGE = "JOBPOSTED_JOB_CONTEXT";
// Must comfortably exceed a realistic full-page fill. A form with several custom
// comboboxes (phone country, location, yes/no screening dropdowns) can spend a few
// seconds per control retrying, so the old 10s cap abandoned the form frame mid-run
// while the in-page script kept mutating the DOM — surfacing as "it glitched and gave
// up". Keep this just under the side panel's 45s outer timeout so it stays a safety net.
const FRAME_AUTOFILL_TIMEOUT_MS = 40_000;
type AutofillContentResponse = Extract<ExtensionMessageResponse, { type: "AUTOFILL_ACTIVE_TAB" }>;
type TrackerContentResponse = Extract<ExtensionMessageResponse, { type: "TRACKER_ADD_ACTIVE_TAB" }>;
type JobContextContentResponse =
  | { ok: true; type: "JOB_CONTEXT"; context: ExtensionJobContext }
  | { ok: false; error: string };

class ContentAutofillError extends Error {}
class ContentTrackerError extends Error {}
type AutofillFrameResult =
  | { ok: true; response: AutofillContentResponse }
  | { ok: false; error: unknown };

function bridgeUrl(requestId: string) {
  const url = new URL(EXTENSION_BRIDGE_PATH, JOBPOSTED_WEB_ORIGIN);
  url.searchParams.set("requestId", requestId);
  return url.toString();
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

function scoreAutofillResult(response: AutofillContentResponse) {
  const result = response.result;
  if (result.total === 0) return -100;
  return result.filled * 10 + result.needsUser * 4 + result.failed * 2 + result.total - result.skipped * 2;
}

function bestAutofillResponse(responses: AutofillContentResponse[]) {
  return responses.reduce((best, response) =>
    scoreAutofillResult(response) > scoreAutofillResult(best) ? response : best,
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

async function requestFrameAutofill(
  tabId: number,
  frameId: number,
  args: { continueSteps?: boolean },
): Promise<AutofillContentResponse> {
  const response = (await chrome.tabs.sendMessage(
    tabId,
    {
      type: CONTENT_AUTOFILL_MESSAGE,
      continueSteps: Boolean(args.continueSteps),
      forceGenericFallback: true,
      suppressAutoTrack: true,
    },
    { frameId },
  )) as ExtensionMessageResponse | undefined;
  if (!response) throw new Error("autofill_no_response");
  if (!response.ok) throw new ContentAutofillError(response.error);
  if (!isAutofillRunResponse(response)) throw new Error("autofill_unexpected_response");
  return response;
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
      withTimeout(
        requestFrameAutofill(tabId, frameId, args),
        FRAME_AUTOFILL_TIMEOUT_MS,
        `autofill_frame_timeout:${frameId}`,
      )
        .then((response): AutofillFrameResult => ({ ok: true, response }))
        .catch((error): AutofillFrameResult => ({ ok: false, error })),
    ]),
  );
  const responses: AutofillContentResponse[] = [];
  let firstError: unknown = null;

  while (pending.size > 0) {
    const { index, result } = await Promise.race(
      Array.from(pending, ([index, promise]) => promise.then((result) => ({ index, result }))),
    );
    pending.delete(index);
    if (result.ok) {
      responses.push(result.response);
      if (result.response.result.filled > 0) {
        return bestAutofillResponse(responses);
      }
    } else {
      firstError ??= result.error;
    }
  }

  if (responses.length > 0) return bestAutofillResponse(responses);

  if (firstError instanceof Error) throw firstError;
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
    status: "filled",
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

async function retryQueuedApplicationSyncs() {
  const queue = await readPendingApplicationSyncs();
  const due = dueApplicationSyncs(queue);
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

async function handleMessage(message: ExtensionMessage): Promise<ExtensionMessageResponse> {
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
    case "AUTOFILL_ACTIVE_TAB":
      return { ok: true, type: "AUTOFILL_ACTIVE_TAB", result: await autofillActiveTab(message) };
    case "TRACKER_ADD_ACTIVE_TAB":
      return { ok: true, type: "TRACKER_ADD_ACTIVE_TAB", result: await addActiveTabToTracker() };
    case "TAILOR_ACTIVE_TAB":
      return { ok: true, type: "TAILOR_ACTIVE_TAB", result: await tailorActiveTab() };
    case "COVER_LETTER_ACTIVE_TAB":
      return { ok: true, type: "COVER_LETTER_ACTIVE_TAB", result: await coverLetterActiveTab() };
    case "APPLICATION_SYNC":
      return { ok: true, type: "APPLICATION_SYNC", result: await syncApplicationWithQueue(message.payload) };
    case "APPLICATION_SYNC_RETRY":
      return { ok: true, type: "APPLICATION_SYNC_RETRY", status: await retryQueuedApplicationSyncs() };
    case "SYNC_QUEUE_STATUS":
      return { ok: true, type: "SYNC_QUEUE_STATUS", status: await readSyncQueueStatus() };
    case "ANSWER_SAVE":
      await saveAnswer(message.answer);
      return { ok: true, type: "ANSWER_SAVE" };
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

  // Open the docked side panel with Chrome's Side Panel API instead of a popup.
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch(() => undefined);

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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) return false;
    void handleMessage(message)
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
