import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import type {
  ExtensionAutofillRunResult,
  ExtensionAuthSession,
  ExtensionFieldFillRecord,
  ExtensionJobContext,
  ExtensionMessageResponse,
  ExtensionSettings,
  MasterProfile,
} from "@jobposted/shared";
import shadowCss from "../src/styles.css?inline";
import { JOBPOSTED_WEB_ORIGIN } from "../src/config/env";
import { detectAdapter } from "../src/adapters";
import { applicationMetadata, fillCurrentStep, humanDelay } from "../src/autofill/engine";
import { Overlay, type OverlayRunState } from "../src/content/Overlay";

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
const CONTENT_TRACK_MESSAGE = "JOBPOSTED_TRACK_CURRENT_PAGE";
const CONTENT_JOB_CONTEXT_MESSAGE = "JOBPOSTED_JOB_CONTEXT";

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
  await chrome.runtime.sendMessage({ type: "AUTH_SESSION_DELIVERY", session }).catch(() => undefined);
}

function message<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage(payload) as Promise<T>;
}

function isTopFrame() {
  try {
    return window.self === window.top;
  } catch {
    return true;
  }
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
    const requestId = typeof data.requestId === "string" ? data.requestId : undefined;
    void chrome.runtime
      .sendMessage({
        type: "AUTH_SESSION_DELIVERY",
        requestId,
        session,
      })
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

function waitForStepChange() {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.setTimeout(resolve, 500);
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(finish, 1600);
  });
}

async function loadAutofillPrereqs(adapter: ReturnType<typeof detectAdapter>, forceGenericFallback: boolean) {
  const [settingsResponse, profileResponse] = await Promise.all([
    message<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
    message<ExtensionMessageResponse>({ type: "PROFILE_GET" }),
  ]);
  if (!settingsResponse.ok || settingsResponse.type !== "SETTINGS_GET") {
    throw new Error(settingsResponse.ok ? "Settings unavailable." : settingsResponse.error);
  }
  if (!profileResponse.ok || profileResponse.type !== "PROFILE_GET" || !profileResponse.profile) {
    throw new Error(profileResponse.ok ? "Profile unavailable." : profileResponse.error);
  }

  const settings = settingsResponse.settings;
  if (settings.enabledPlatforms[adapter.id] === false) {
    throw new Error(`${adapter.label} is disabled in JobPosted options.`);
  }
  if (adapter.id === "generic" && !settings.enableGenericFallback && !forceGenericFallback) {
    throw new Error("Generic fallback is off. Enable it in options for unknown forms.");
  }

  return {
    settings,
    profile: profileResponse.profile,
  };
}

async function syncAutofill(fieldsFilled: ExtensionFieldFillRecord[], platform: ReturnType<typeof detectAdapter>["id"]) {
  const payload = {
    ...applicationMetadata(platform),
    status: "filled" as const,
    appliedAt: new Date().toISOString(),
    fieldsFilled,
  };
  return message<ExtensionMessageResponse>({ type: "APPLICATION_SYNC", payload });
}

async function trackCurrentPage() {
  const adapter = detectAdapter();
  const response = await syncAutofill([], adapter.id);
  if (!response.ok || response.type !== "APPLICATION_SYNC") {
    throw new Error(response.ok ? "Tracker did not return a result." : response.error);
  }
  return response.result;
}

function jobContextForCurrentPage(): ExtensionJobContext {
  const adapter = detectAdapter();
  const metadata = applicationMetadata(adapter.id);
  const mainText =
    document.querySelector("main")?.textContent ||
    document.querySelector("[data-testid*='job' i], [class*='job' i], article")?.textContent ||
    document.body?.textContent ||
    "";
  return {
    platform: adapter.id,
    company: metadata.company,
    role: metadata.role,
    jobUrl: metadata.jobUrl,
    jobDescription: mainText.replace(/\s+/g, " ").trim().slice(0, 25_000),
  };
}

function summarizeRunResult(args: {
  platform: ReturnType<typeof detectAdapter>["id"];
  stepName: string;
  fields: ExtensionFieldFillRecord[];
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
  };
}

async function runAutofillPage(args: {
  continueSteps: boolean;
  forceGenericFallback: boolean;
  onField?: (record: ExtensionFieldFillRecord, fields: ExtensionFieldFillRecord[]) => void;
  onStep?: (stepName: string) => void;
  onSyncQueued?: () => void;
  suppressAutoTrack?: boolean;
  shouldStop?: () => boolean;
}): Promise<ExtensionAutofillRunResult> {
  const adapter = detectAdapter();
  const { settings, profile } = await loadAutofillPrereqs(adapter, args.forceGenericFallback);
  const allRecords: ExtensionFieldFillRecord[] = [];
  let stepName = adapter.detectStep(document).name;

  for (let step = 0; step < (args.continueSteps ? 8 : 1); step += 1) {
    if (args.shouldStop?.()) break;
    stepName = adapter.detectStep(document).name;
    args.onStep?.(stepName);
    const result = await fillCurrentStep({
      adapter,
      profile: profile as MasterProfile,
      settings: settings as ExtensionSettings,
      onField: (record) => {
        allRecords.push(record);
        args.onField?.(record, [...allRecords]);
      },
    });

    const submit = adapter.findSubmit(document);
    const canAdvance = args.continueSteps && settings.autoAdvance;
    if (!canAdvance || args.shouldStop?.()) break;
    if (submit) break;

    const next = adapter.findAdvance(document);
    if (!next) break;
    await humanDelay(settings);
    next.click();
    await waitForStepChange();
    if (result.total === 0) break;
  }

  if (!args.suppressAutoTrack && settings.autoTrackAutofill && allRecords.length > 0) {
    void syncAutofill(allRecords, adapter.id)
      .then((syncResponse) => {
        if (syncResponse.ok && syncResponse.type === "APPLICATION_SYNC" && syncResponse.result.queued) {
          args.onSyncQueued?.();
        }
      })
      .catch(() => undefined);
  }
  return summarizeRunResult({ platform: adapter.id, stepName, fields: allRecords });
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

function JobPostedOverlayApp() {
  const adapter = useMemo(() => detectAdapter(), []);
  const [state, setState] = useState<OverlayRunState>("idle");
  const [fields, setFields] = useState<ExtensionFieldFillRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepName, setStepName] = useState(adapter.detectStep(document).name);
  const stopRequested = useRef(false);

  async function run(continueSteps: boolean) {
    stopRequested.current = false;
    setError(null);
    setFields([]);
    try {
      setState("loading");
      setState("filling");
      const result = await runAutofillPage({
        continueSteps,
        forceGenericFallback: false,
        shouldStop: () => stopRequested.current,
        onStep: setStepName,
        onField: (_record, currentFields) => setFields(currentFields),
        onSyncQueued: () => setError("Saved locally. JobPosted will retry syncing this application automatically."),
      });
      setFields(result.fields);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Autofill failed.");
      setState("error");
    }
  }

  return (
    <Overlay
      platform={adapter.id}
      stepName={stepName}
      state={state}
      fields={fields}
      error={error}
      onFill={() => void run(false)}
      onContinue={() => void run(true)}
      onStop={() => {
        stopRequested.current = true;
      }}
      onClose={() => {
        document.querySelector("[data-jobposted-shadow-host]")?.remove();
      }}
    />
  );
}

export default defineContentScript({
  matches: CONTENT_MATCHES,
  allFrames: true,
  matchAboutBlank: true,
  runAt: "document_idle",
  cssInjectionMode: "manual",
  async main(ctx) {
    installAutofillCommandListener();
    installBridgeListener();
    if (isJobPostedWebAppHost()) {
      if (isTopFrame()) void syncStoredWebSession();
      return;
    }
    injectPageHighlightStyle();
    if (!isTopFrame()) return;

    const adapter = detectAdapter();
    if (adapter.id === "generic") {
      const settings = await message<ExtensionMessageResponse>({ type: "SETTINGS_GET" });
      if (!settings.ok || settings.type !== "SETTINGS_GET" || !settings.settings.enableGenericFallback) return;
    }

    const contentState = globalThis as typeof globalThis & { __jobpostedOverlayMounted?: boolean };
    if (contentState.__jobpostedOverlayMounted) return;
    contentState.__jobpostedOverlayMounted = true;

    const ui = await createShadowRootUi(ctx, {
      name: "jobposted-autofill-overlay",
      position: "inline",
      anchor: "body",
      isolateEvents: true,
      onMount(container, shadow) {
        const style = document.createElement("style");
        style.textContent = shadowCss;
        shadow.appendChild(style);
        const app = document.createElement("div");
        app.setAttribute("data-jobposted-shadow-host", "true");
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(<JobPostedOverlayApp />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
        contentState.__jobpostedOverlayMounted = false;
      },
    });
    ui.mount();
  },
});
