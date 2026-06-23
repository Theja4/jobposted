import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { applicationMetadata, fillCurrentStep, fillSingleField, humanDelay } from "../src/autofill/engine";
import type { FieldDescriptor } from "../src/autofill/types";
import { Overlay, type OverlayProgressItem, type OverlayRunState } from "../src/content/Overlay";

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

interface OverlayCommandArgs {
  continueSteps: boolean;
  forceGenericFallback: boolean;
  suppressAutoTrack?: boolean;
}

type OverlayCommandRunner = (args: OverlayCommandArgs) => Promise<ExtensionAutofillRunResult>;

let visibleOverlayMount: (() => Promise<void>) | null = null;
let visibleOverlayRunner: OverlayCommandRunner | null = null;

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
    canonicalKey: "unknown",
    status: "needs_user",
    confidence: 0,
    source: "skip",
    error: "Could not continue because this step stayed open. Fill the missing required fields, then click Fill & Continue again.",
  };
}

async function loadAutofillPrereqs(adapter: ReturnType<typeof detectAdapter>, forceGenericFallback: boolean) {
  const [settingsResponse, profileResponse] = await Promise.all([
    message<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
    message<ExtensionMessageResponse>({ type: "PROFILE_GET", forceRefresh: true }),
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
  onFieldsDiscovered?: (fields: FieldDescriptor[]) => void;
  onFieldStart?: (field: FieldDescriptor) => void;
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
      shouldStop: args.shouldStop,
      onFieldsDiscovered: args.onFieldsDiscovered,
      onFieldStart: args.onFieldStart,
      onField: (record) => {
        allRecords.push(record);
        args.onField?.(record, [...allRecords]);
      },
    });

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
      args.onField?.(record, [...allRecords]);
      break;
    }
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

    void runAutofillWithVisibleOverlay({
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

function progressItemFromField(field: FieldDescriptor): OverlayProgressItem {
  return {
    signature: field.signature,
    label: field.label || field.context || field.id,
    required: field.required,
    status: "pending",
  };
}

function progressItemFromRecord(record: ExtensionFieldFillRecord): OverlayProgressItem {
  return {
    signature: record.signature,
    label: record.label,
    canonicalKey: record.canonicalKey,
    error: record.error,
    valuePreview: record.valuePreview,
    status: record.status,
  };
}

function upsertProgressItem(items: OverlayProgressItem[], next: OverlayProgressItem) {
  const index = items.findIndex((item) => item.signature === next.signature);
  if (index === -1) return [...items, next];
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function markProgressActive(items: OverlayProgressItem[], field: FieldDescriptor) {
  const next = { ...progressItemFromField(field), status: "active" as const };
  const resetActive = items.map((item) => (item.status === "active" ? { ...item, status: "pending" as const } : item));
  return upsertProgressItem(resetActive, next);
}

function applyProgressRecord(items: OverlayProgressItem[], record: ExtensionFieldFillRecord) {
  return upsertProgressItem(items, progressItemFromRecord(record));
}

function applyProgressRecords(items: OverlayProgressItem[], records: ExtensionFieldFillRecord[]) {
  return records.reduce(applyProgressRecord, items);
}

function markActiveProgressStopped(items: OverlayProgressItem[]) {
  return items.map((item) => (item.status === "active" ? { ...item, status: "skipped" as const, error: "Stopped." } : item));
}

function waitForVisibleOverlayRunner(timeoutMs = 1200) {
  return new Promise<OverlayCommandRunner | null>((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (visibleOverlayRunner) {
        resolve(visibleOverlayRunner);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(check, 25);
    };
    check();
  });
}

async function runAutofillWithVisibleOverlay(args: OverlayCommandArgs) {
  if (isTopFrame() && visibleOverlayMount) {
    await visibleOverlayMount();
    const runner = await waitForVisibleOverlayRunner();
    if (runner) return runner(args);
  }
  return runAutofillPage({
    continueSteps: args.continueSteps,
    forceGenericFallback: args.forceGenericFallback,
    suppressAutoTrack: args.suppressAutoTrack,
  });
}

function JobPostedOverlayApp({ onRequestClose }: { onRequestClose: () => void }) {
  const adapter = useMemo(() => detectAdapter(), []);
  const [state, setState] = useState<OverlayRunState>("idle");
  const [progressItems, setProgressItems] = useState<OverlayProgressItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepName, setStepName] = useState(adapter.detectStep(document).name);
  const [stopQueued, setStopQueued] = useState(false);
  const stopRequested = useRef(false);
  const fieldsBySignature = useRef(new Map<string, FieldDescriptor>());

  function requestStop() {
    stopRequested.current = true;
    setStopQueued(true);
  }

  function closeOverlay() {
    requestStop();
    onRequestClose();
  }

  const run = useCallback(async (continueSteps: boolean, options: { forceGenericFallback?: boolean; suppressAutoTrack?: boolean; rethrow?: boolean } = {}) => {
    stopRequested.current = false;
    setStopQueued(false);
    setError(null);
    setProgressItems([]);
    fieldsBySignature.current.clear();
    try {
      setState("loading");
      setState("filling");
      const result = await runAutofillPage({
        continueSteps,
        forceGenericFallback: options.forceGenericFallback ?? false,
        suppressAutoTrack: options.suppressAutoTrack,
        shouldStop: () => stopRequested.current,
        onStep: setStepName,
        onFieldsDiscovered: (detectedFields) => {
          fieldsBySignature.current = new Map(detectedFields.map((field) => [field.signature, field]));
          setProgressItems(detectedFields.map(progressItemFromField));
        },
        onFieldStart: (field) => {
          fieldsBySignature.current.set(field.signature, field);
          setProgressItems((items) => markProgressActive(items, field));
        },
        onField: (record) => setProgressItems((items) => applyProgressRecord(items, record)),
        onSyncQueued: () => setError("Saved locally. JobPosted will retry syncing this application automatically."),
      });
      setProgressItems((items) => {
        const updated = applyProgressRecords(items, result.fields);
        return stopRequested.current ? markActiveProgressStopped(updated) : updated;
      });
      if (stopRequested.current) {
        setError("Autofill stopped. Review any filled fields before submitting.");
      }
      setState("done");
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Autofill failed.");
      setState("error");
      if (options.rethrow) throw err;
      return null;
    }
  }, []);

  useEffect(() => {
    const runner: OverlayCommandRunner = async (commandArgs) => {
      const result = await run(commandArgs.continueSteps, {
        forceGenericFallback: commandArgs.forceGenericFallback,
        suppressAutoTrack: commandArgs.suppressAutoTrack,
        rethrow: true,
      });
      if (!result) throw new Error("Autofill failed.");
      return result;
    };
    visibleOverlayRunner = runner;
    return () => {
      if (visibleOverlayRunner === runner) visibleOverlayRunner = null;
    };
  }, [run]);

  async function refillQuestion(item: OverlayProgressItem) {
    const field = fieldsBySignature.current.get(item.signature);
    if (!field) {
      setError("Retrying this section...");
      await run(false);
      return;
    }
    stopRequested.current = false;
    setStopQueued(false);
    setError(null);
    setState("filling");
    setProgressItems((items) => markProgressActive(items, field));
    try {
      const { settings, profile } = await loadAutofillPrereqs(adapter, false);
      const record = await fillSingleField({
        adapter,
        profile: profile as MasterProfile,
        settings: settings as ExtensionSettings,
        field,
        shouldStop: () => stopRequested.current,
        onField: (nextRecord) => setProgressItems((items) => applyProgressRecord(items, nextRecord)),
      });
      setProgressItems((items) => applyProgressRecord(items, record));
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refill this question.");
      setState("error");
    }
  }

  async function copyAnswer(item: OverlayProgressItem) {
    const answer = item.valuePreview?.trim();
    if (!answer) {
      setError("No copied answer is available for this question yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(answer);
      setError("Answer copied.");
    } catch {
      setError("Could not copy this answer from the page.");
    }
  }

  async function reportBug(item: OverlayProgressItem) {
    const report = JSON.stringify(
      {
        url: window.location.href,
        platform: adapter.id,
        stepName,
        field: item.label,
        status: item.status,
        canonicalKey: item.canonicalKey ?? null,
        error: item.error ?? null,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(report);
      setError("Bug details copied. Paste them into your report.");
    } catch {
      setError("Could not copy bug details.");
    }
  }

  return (
    <Overlay
      platform={adapter.id}
      stepName={stepName}
      state={state}
      items={progressItems}
      error={error}
      stopRequested={stopQueued}
      onFill={() => void run(false)}
      onContinue={() => void run(true)}
      onStop={requestStop}
      onClose={closeOverlay}
      onRefillQuestion={(item) => void refillQuestion(item)}
      onCopyAnswer={(item) => void copyAnswer(item)}
      onReportBug={(item) => void reportBug(item)}
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

    const contentState = globalThis as typeof globalThis & { __jobpostedOverlayMounted?: boolean };
    let removeOverlay: () => void = () => undefined;
    let mountPromise: Promise<void> | null = null;
    visibleOverlayMount = async () => {
      if (contentState.__jobpostedOverlayMounted) return;
      if (mountPromise) return mountPromise;
      mountPromise = (async () => {
        try {
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
              root.render(<JobPostedOverlayApp onRequestClose={() => removeOverlay()} />);
              return root;
            },
            onRemove(root) {
              root?.unmount();
              contentState.__jobpostedOverlayMounted = false;
            },
          });
          removeOverlay = () => ui.remove();
          ui.mount();
        } catch (error) {
          contentState.__jobpostedOverlayMounted = false;
          throw error;
        }
      })().finally(() => {
        mountPromise = null;
      });
      return mountPromise;
    };

    const adapter = detectAdapter();
    if (adapter.id === "generic") {
      const settings = await message<ExtensionMessageResponse>({ type: "SETTINGS_GET" });
      if (!settings.ok || settings.type !== "SETTINGS_GET" || !settings.settings.enableGenericFallback) return;
    }

    await visibleOverlayMount();
  },
});
