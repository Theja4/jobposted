import {
  isExtensionMessage,
  type ExtensionApplicationResponse,
  type ExtensionApplicationUpsert,
  type ExtensionMessage,
  type ExtensionMessageResponse,
} from "@jobposted/shared";
import { EXTENSION_BRIDGE_PATH, JOBPOSTED_WEB_ORIGIN } from "../src/config/env";
import { ExtensionHttpError, fetchProfile, fetchResume, mapField, saveAnswer, syncApplication } from "../src/lib/api";
import { clearSession, getFreshSession, readSettings, writeSession, writeSettings } from "../src/lib/storage";
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

function bridgeUrl(requestId: string) {
  const url = new URL(EXTENSION_BRIDGE_PATH, JOBPOSTED_WEB_ORIGIN);
  url.searchParams.set("requestId", requestId);
  return url.toString();
}

function transientSyncError(error: unknown) {
  if (!(error instanceof ExtensionHttpError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
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
    case "PROFILE_GET":
      return { ok: true, type: "PROFILE_GET", profile: await fetchProfile(message.forceRefresh) };
    case "RESUME_GET":
      return { ok: true, type: "RESUME_GET", resume: await fetchResume(message.jobId) };
    case "FIELD_MAP":
      return { ok: true, type: "FIELD_MAP", mapping: await mapField(message.field, message.profile) };
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
