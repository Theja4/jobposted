import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  PenLine,
  RefreshCw,
  Settings,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import type {
  ExtensionApplicationResponse,
  ExtensionAutofillRunResult,
  ExtensionAuthSession,
  ExtensionMessageResponse,
  ExtensionSettings,
  ExtensionSyncQueueStatus,
  MasterProfile,
} from "@jobposted/shared";
import { DEFAULT_EXTENSION_SETTINGS } from "@jobposted/shared";
import { JOBPOSTED_WEB_ORIGIN } from "../../src/config/env";

type AuthState = "checking" | "signed-out" | "signed-in";
type AutofillState =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; result: ExtensionAutofillRunResult }
  | { state: "error"; error: string };
type TrackerState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; result: ExtensionApplicationResponse }
  | { state: "error"; error: string };
type JobActionKind = "tailor" | "cover-letter";
type JobActionState =
  | { state: "idle" }
  | { state: "running"; action: JobActionKind }
  | { state: "done"; action: JobActionKind; label: string; url: string | null }
  | { state: "error"; action: JobActionKind; error: string };

function send<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage(payload) as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function timeoutResponse(ms: number, error: string): Promise<ExtensionMessageResponse> {
  return new Promise((resolve) => window.setTimeout(() => resolve({ ok: false, error }), ms));
}

const includeLocalhost =
  import.meta.env.MODE !== "production" ||
  import.meta.env.WXT_INCLUDE_LOCALHOST === "1" ||
  /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(JOBPOSTED_WEB_ORIGIN);

function configuredHostname() {
  try {
    return new URL(JOBPOSTED_WEB_ORIGIN).hostname.toLowerCase();
  } catch {
    return "jobposted.app";
  }
}

function isJobPostedUrl(url: string | undefined) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === configuredHostname() ||
      host === "jobposted.app" ||
      host === "www.jobposted.app" ||
      host === "jobposted.ai" ||
      host === "www.jobposted.ai" ||
      (includeLocalhost && (host === "localhost" || host === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

function validSession(value: unknown): value is ExtensionAuthSession {
  return Boolean(value && typeof value === "object" && typeof (value as { accessToken?: unknown }).accessToken === "string");
}

async function connectFromActiveJobPostedTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isJobPostedUrl(tab.url)) return false;
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const asRecord = (value: unknown): Record<string, unknown> =>
        value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
      const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
      const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
      const normalize = (value: unknown) => {
        const root = asRecord(value);
        const session = asRecord(root.currentSession ?? root.session ?? value);
        const accessToken = str(session.access_token ?? session.accessToken);
        if (!accessToken) return null;
        const user = asRecord(session.user);
        const userId = str(user.id);
        return {
          accessToken,
          refreshToken: str(session.refresh_token ?? session.refreshToken) || null,
          expiresAt: num(session.expires_at ?? session.expiresAt ?? root.expiresAt),
          user: userId ? { id: userId, email: str(user.email) || null } : null,
        };
      };
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index) ?? "";
        if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
        try {
          const session = normalize(JSON.parse(window.localStorage.getItem(key) ?? "null"));
          if (session) return session;
        } catch {
          // Keep scanning other Supabase keys.
        }
      }
      return null;
    },
  });
  const session = results[0]?.result;
  if (!validSession(session)) return false;
  const delivered = await send<ExtensionMessageResponse>({ type: "AUTH_SESSION_DELIVERY", session });
  return delivered.ok && delivered.type === "AUTH_STATUS" && delivered.authenticated;
}

export function SidePanelApp() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<ExtensionSyncQueueStatus | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_EXTENSION_SETTINGS);
  const [autofill, setAutofill] = useState<AutofillState>({ state: "idle" });
  const [tracker, setTracker] = useState<TrackerState>({ state: "idle" });
  const [jobAction, setJobAction] = useState<JobActionState>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  async function refresh(options: { allowActiveTabConnect?: boolean } = {}) {
    const allowActiveTabConnect = options.allowActiveTabConnect ?? true;
    let status = await send<ExtensionMessageResponse>({ type: "AUTH_STATUS" });
    if ((!status.ok || status.type !== "AUTH_STATUS" || !status.authenticated) && allowActiveTabConnect) {
      try {
        const connected = await connectFromActiveJobPostedTab();
        if (connected) status = await send<ExtensionMessageResponse>({ type: "AUTH_STATUS" });
      } catch {
        // Active-tab access is opportunistic; the bridge button remains the fallback.
      }
    }
    if (!status.ok || status.type !== "AUTH_STATUS" || !status.authenticated) {
      setAuth("signed-out");
      setEmail(null);
      setProfile(null);
      setProfileError(null);
      setSettings(DEFAULT_EXTENSION_SETTINGS);
      return;
    }
    setAuth("signed-in");
    setEmail(status.email ?? null);

    // Stale-while-revalidate: paint the cached profile instantly (no network),
    // then refresh in the background while a subtle "syncing" indicator runs.
    let hadCache = false;
    const [cached, settingsResponse] = await Promise.all([
      send<ExtensionMessageResponse>({ type: "PROFILE_GET", cachedOnly: true }),
      send<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
    ]);
    if (settingsResponse.ok && settingsResponse.type === "SETTINGS_GET") {
      setSettings(settingsResponse.settings);
    }
    if (cached.ok && cached.type === "PROFILE_GET" && cached.profile) {
      setProfile(cached.profile);
      setProfileError(null);
      hadCache = true;
    }

    setSyncing(true);
    const fresh = await send<ExtensionMessageResponse>({ type: "PROFILE_GET", forceRefresh: true });
    setSyncing(false);
    if (fresh.ok && fresh.type === "PROFILE_GET" && fresh.profile) {
      setProfile(fresh.profile);
      setProfileError(null);
    } else if (!fresh.ok && fresh.status === 401) {
      setProfile(null);
      setProfileError(null);
      setAuth("signed-out");
      setEmail(null);
      return;
    } else if (!hadCache) {
      // Nothing cached to fall back on; surface the issue.
      setProfile(null);
      setProfileError(fresh.ok ? "Could not load setup." : fresh.error);
    }
    // Otherwise revalidation failed but cached data is on screen; keep showing it.

    const queueResponse = await send<ExtensionMessageResponse>({ type: "SYNC_QUEUE_STATUS" });
    if (queueResponse.ok && queueResponse.type === "SYNC_QUEUE_STATUS") {
      setSyncStatus(queueResponse.status);
    }
  }

  // Hydrate from the cached profile first so the panel never opens "from scratch"
  // so it shows the last-known account and completeness instantly, then quietly
  // checks for updates.
  async function hydrateThenRefresh() {
    const [cached, settingsResponse] = await Promise.all([
      send<ExtensionMessageResponse>({ type: "PROFILE_GET", cachedOnly: true }),
      send<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
    ]);
    if (settingsResponse.ok && settingsResponse.type === "SETTINGS_GET") {
      setSettings(settingsResponse.settings);
    }
    if (cached.ok && cached.type === "PROFILE_GET" && cached.profile) {
      setProfile(cached.profile);
      setEmail((prev) => prev ?? cached.profile?.identity.email ?? null);
      setAuth("signed-in");
    }
    await refresh();
  }

  useEffect(() => {
    void hydrateThenRefresh();
  }, []);

  async function signIn() {
    setBusy(true);
    setAuth("checking");
    try {
      if (await connectFromActiveJobPostedTab()) {
        await refresh({ allowActiveTabConnect: false });
        return;
      }
      await send<ExtensionMessageResponse>({ type: "AUTH_START" });
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(500);
        const status = await send<ExtensionMessageResponse>({ type: "AUTH_STATUS" });
        if (status.ok && status.type === "AUTH_STATUS" && status.authenticated) {
          await refresh({ allowActiveTabConnect: false });
          return;
        }
      }
      setAuth("signed-out");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    await send<ExtensionMessageResponse>({ type: "AUTH_SIGN_OUT" });
    setSyncing(false);
    setProfile(null);
    setProfileError(null);
    setAutofill({ state: "idle" });
    setTracker({ state: "idle" });
    setJobAction({ state: "idle" });
    setSettings(DEFAULT_EXTENSION_SETTINGS);
    setAuth("signed-out");
    setBusy(false);
  }

  async function retrySync() {
    setBusy(true);
    const response = await send<ExtensionMessageResponse>({ type: "APPLICATION_SYNC_RETRY" });
    if (response.ok && response.type === "APPLICATION_SYNC_RETRY") {
      setSyncStatus(response.status);
    }
    setBusy(false);
  }

  async function autofillActiveTab() {
    setAutofill({ state: "running" });
    if (settings.autoTrackAutofill) setTracker({ state: "saving" });
    try {
      const response = await Promise.race([
        send<ExtensionMessageResponse>({ type: "AUTOFILL_ACTIVE_TAB" }),
        timeoutResponse(45_000, "Autofill timed out. The fields already filled should stay on the page."),
      ]);
      if (response.ok && response.type === "AUTOFILL_ACTIVE_TAB") {
        setAutofill({ state: "done", result: response.result });
        if (response.result.tracker) {
          setTracker({ state: "saved", result: response.result.tracker });
        } else if (response.result.trackerError) {
          setTracker({ state: "error", error: response.result.trackerError });
        }
        const queueResponse = await send<ExtensionMessageResponse>({ type: "SYNC_QUEUE_STATUS" });
        if (queueResponse.ok && queueResponse.type === "SYNC_QUEUE_STATUS") {
          setSyncStatus(queueResponse.status);
        }
        return;
      }
      if (!response.ok && response.status === 401) {
        setProfile(null);
        setAuth("signed-out");
        setEmail(null);
        setAutofill({ state: "idle" });
        return;
      }
      setAutofill({
        state: "error",
        error: response.ok ? "Autofill did not return a result." : response.error,
      });
    } catch (error) {
      setAutofill({
        state: "error",
        error: error instanceof Error ? error.message : "Autofill failed.",
      });
    }
  }

  async function addActiveTabToTracker() {
    setTracker({ state: "saving" });
    try {
      const response = await Promise.race([
        send<ExtensionMessageResponse>({ type: "TRACKER_ADD_ACTIVE_TAB" }),
        timeoutResponse(30_000, "Tracker sync timed out. Try again in a moment."),
      ]);
      if (response.ok && response.type === "TRACKER_ADD_ACTIVE_TAB") {
        setTracker({ state: "saved", result: response.result });
        const queueResponse = await send<ExtensionMessageResponse>({ type: "SYNC_QUEUE_STATUS" });
        if (queueResponse.ok && queueResponse.type === "SYNC_QUEUE_STATUS") {
          setSyncStatus(queueResponse.status);
        }
        return;
      }
      if (!response.ok && response.status === 401) {
        setProfile(null);
        setAuth("signed-out");
        setEmail(null);
        setTracker({ state: "idle" });
        return;
      }
      setTracker({
        state: "error",
        error: response.ok ? "Tracker did not return a result." : response.error,
      });
    } catch (error) {
      setTracker({
        state: "error",
        error: error instanceof Error ? error.message : "Could not add this job to the tracker.",
      });
    }
  }

  async function updateAutoTrackAutofill(autoTrackAutofill: boolean) {
    setSettingsSaving(true);
    try {
      const response = await send<ExtensionMessageResponse>({
        type: "SETTINGS_SET",
        settings: { autoTrackAutofill },
      });
      if (response.ok && response.type === "SETTINGS_SET") {
        setSettings(response.settings);
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  async function runJobAction(action: JobActionKind) {
    setJobAction({ state: "running", action });
    const messageType = action === "tailor" ? "TAILOR_ACTIVE_TAB" : "COVER_LETTER_ACTIVE_TAB";
    const fallback = action === "tailor" ? "Could not tailor this resume." : "Could not generate this cover letter.";
    try {
      const response = await Promise.race([
        send<ExtensionMessageResponse>({ type: messageType }),
        timeoutResponse(130_000, `${fallback} The request timed out.`),
      ]);
      if (response.ok && response.type === "TAILOR_ACTIVE_TAB") {
        const url = response.result.resumeUrl ?? response.result.resumeDocxUrl ?? null;
        setJobAction({ state: "done", action, label: "Tailored resume ready", url });
        if (url) await chrome.tabs.create({ url, active: true });
        return;
      }
      if (response.ok && response.type === "COVER_LETTER_ACTIVE_TAB") {
        const url = response.result.coverLetterUrl ?? null;
        setJobAction({ state: "done", action, label: "Cover letter ready", url });
        if (url) await chrome.tabs.create({ url, active: true });
        return;
      }
      setJobAction({ state: "error", action, error: response.ok ? fallback : response.error });
    } catch (error) {
      setJobAction({ state: "error", action, error: error instanceof Error ? error.message : fallback });
    }
  }

  const completeness = Math.max(0, Math.min(100, profile?.completeness ?? 0));
  const hasCompleteness = typeof profile?.completeness === "number";
  const result = autofill.state === "done" ? autofill.result : null;
  const filledCount = result?.filled ?? 0;
  const reviewCount = result?.needsUser ?? 0;
  const skippedCount = result?.skipped ?? 0;
  const trackerStatus =
    tracker.state === "saved"
      ? tracker.result.duplicate
        ? "Duplicate"
        : tracker.result.queued
          ? "Saved locally"
          : "Added"
      : tracker.state === "saving"
        ? "Saving"
        : settings.autoTrackAutofill
          ? "Auto"
          : "Manual";

  return (
    <main className="jp-shell flex min-h-screen w-full flex-col">
      <header className="jp-topbar sticky top-0 z-10 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img src={chrome.runtime.getURL("brand/jobposted-mark.png")} alt="" className="h-9 w-9 object-contain" />
          <div>
            <p className="text-base font-black text-[var(--jp-ink)]">JobPosted</p>
            <p className="text-xs font-bold text-[var(--jp-muted)]">Autofill copilot</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {auth === "signed-in" && (
            <button
              type="button"
              className="jp-icon-button"
              title="Check for updates"
              disabled={syncing}
              onClick={() => void refresh()}
            >
              <RefreshCw className={`size-4${syncing ? " animate-spin" : ""}`} />
            </button>
          )}
          <button
            type="button"
            className="jp-icon-button"
            title="Options"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      <section className="jp-sidepanel-body flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
        {auth === "checking" && (
          <div className="jp-panel flex items-center gap-3 p-4">
            <Loader2 className="size-5 animate-spin text-[var(--jp-brand-600)]" />
            <p className="font-bold">Checking your session</p>
          </div>
        )}

        {auth === "signed-out" && (
          <div className="jp-panel p-5">
            <span className="grid size-11 place-items-center rounded-xl bg-[var(--jp-brand-50)] text-[var(--jp-brand-700)]">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="mt-4 text-xl font-black">Connect your account</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--jp-muted)]">
              Sign in through JobPosted. The extension fills forms in Chrome and never asks for ATS passwords.
            </p>
            <button className="jp-button jp-button-primary mt-5 w-full" type="button" disabled={busy} onClick={signIn}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
              Sign in with JobPosted
            </button>
          </div>
        )}

        {auth === "signed-in" && (
          <>
            <section className="jp-account-card">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">Connected</p>
                  <p className="truncate text-xs font-bold text-[var(--jp-muted)]">{email ?? "JobPosted account"}</p>
                </div>
                <span className="jp-pill">{trackerStatus}</span>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs font-black">
                  <span>Profile completeness</span>
                  <span className="inline-flex items-center gap-1.5 text-[var(--jp-brand-700)]">
                    {syncing && <RefreshCw className="size-3 animate-spin" />}
                    {hasCompleteness ? `${completeness}%` : syncing ? "Syncing" : "--"}
                  </span>
                </div>
                <div className={`jp-progress${syncing ? " jp-sync-bar" : ""}`}>
                  <div style={{ width: `${hasCompleteness ? Math.max(4, completeness) : 4}%` }} />
                </div>
                {profileError && (
                  <p className="mt-2 text-xs font-semibold leading-5 text-[#9a3412]">
                    Setup sync needs a refresh. Open setup, then try the extension again.
                  </p>
                )}
              </div>
            </section>

            {syncStatus && syncStatus.pending > 0 && (
              <div className="jp-message jp-message-warning">
                <div className="flex items-center justify-between gap-3">
                  <span>{syncStatus.pending} application sync pending</span>
                  <button type="button" className="jp-inline-action" onClick={retrySync} disabled={busy}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Retry
                  </button>
                </div>
                {syncStatus.lastError && <p className="mt-1 opacity-80">{syncStatus.lastError}</p>}
              </div>
            )}

            <section className="jp-command-card">
              <button
                type="button"
                className="jp-primary-command"
                disabled={autofill.state === "running"}
                onClick={() => void autofillActiveTab()}
              >
                <span className="jp-command-icon">
                  {autofill.state === "running" ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-black">Auto-fill this page</span>
                  <span className="block truncate text-xs font-bold text-white/78">
                    Fill known fields, then review before submit.
                  </span>
                </span>
              </button>

              <label className="jp-toggle-card">
                <span className="min-w-0">
                  <span className="block text-sm font-black">Autofill adds to tracker</span>
                  <span className="block text-xs font-semibold text-[var(--jp-muted)]">Auto-save filled applications</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.autoTrackAutofill}
                  disabled={settingsSaving}
                  onChange={(event) => void updateAutoTrackAutofill(event.currentTarget.checked)}
                  className="jp-switch"
                  aria-label="Autofill adds to tracker"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="jp-tool-button col-span-2"
                  disabled={tracker.state === "saving" || autofill.state === "running"}
                  onClick={() => void addActiveTabToTracker()}
                >
                  {tracker.state === "saving" ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
                  <span>Add to tracker</span>
                </button>
                <button
                  type="button"
                  className="jp-tool-button"
                  disabled={jobAction.state === "running"}
                  onClick={() => void runJobAction("tailor")}
                >
                  {jobAction.state === "running" && jobAction.action === "tailor" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PenLine className="size-4" />
                  )}
                  <span>Tailor resume</span>
                </button>
                <button
                  type="button"
                  className="jp-tool-button"
                  disabled={jobAction.state === "running"}
                  onClick={() => void runJobAction("cover-letter")}
                >
                  {jobAction.state === "running" && jobAction.action === "cover-letter" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                  <span>Cover letter</span>
                </button>
              </div>
            </section>

            {jobAction.state === "done" && (
              <div className="jp-message jp-message-success">
                <div className="flex items-center gap-2 font-black">
                  {jobAction.action === "tailor" ? <PenLine className="size-4" /> : <FileText className="size-4" />}
                  <span>{jobAction.label}</span>
                </div>
                {jobAction.url && (
                  <button
                    type="button"
                    className="mt-2 text-xs font-black text-[var(--jp-brand-700)]"
                    onClick={() => void chrome.tabs.create({ url: jobAction.url!, active: true })}
                  >
                    Open generated file <ArrowRight className="inline size-3.5" />
                  </button>
                )}
              </div>
            )}

            {jobAction.state === "error" && (
              <div className="jp-message jp-message-warning">
                <div className="flex items-center gap-2 font-black">
                  <AlertCircle className="size-4" />
                  <span>{jobAction.error}</span>
                </div>
              </div>
            )}

            {autofill.state === "done" && (
              <div className="jp-message jp-message-success">
                <div className="flex items-center gap-2 font-black">
                  <ClipboardCheck className="size-4" />
                  <span>{autofill.result.filled} filled</span>
                  <span>/ {autofill.result.needsUser} needs review</span>
                </div>
                {(autofill.result.failed > 0 || autofill.result.skipped > 0) && (
                  <p className="mt-1 opacity-80">
                    {autofill.result.failed} failed / {autofill.result.skipped} skipped
                  </p>
                )}
              </div>
            )}

            {tracker.state === "saved" && (
              <div className={`jp-message ${tracker.result.duplicate ? "jp-message-warning" : "jp-message-success"}`}>
                <div className="flex items-center gap-2 font-black">
                  <ClipboardCheck className="size-4" />
                  <span>{tracker.result.duplicate ? "Duplicate" : tracker.result.queued ? "Saved locally" : "Added to tracker"}</span>
                </div>
              </div>
            )}

            {(tracker.state === "error" || autofill.state === "error") && (
              <div className="jp-message jp-message-error">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{tracker.state === "error" ? tracker.error : autofill.state === "error" ? autofill.error : ""}</span>
                </div>
              </div>
            )}

            <section className="jp-canvas-panel flex min-h-[180px] flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Application workspace</p>
                  <p className="text-xs font-semibold text-[var(--jp-muted)]">Review before you submit.</p>
                </div>
                <span className="jp-pill">{filledCount}/{result?.total ?? 0}</span>
              </div>

              <div className="jp-canvas-art my-4" aria-hidden="true">
                <div className="jp-canvas-card jp-canvas-card-main">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="jp-canvas-card jp-canvas-card-side">
                  <span />
                  <span />
                </div>
                <div className="jp-canvas-rail">
                  <span />
                  <span />
                  <span />
                </div>
              </div>

              <div className="jp-flow-list mt-auto">
                <div>
                  <span className="jp-flow-dot jp-flow-dot-blue" />
                  <span>{autofill.state === "running" ? "Filling page" : "Known fields"}</span>
                  <strong>{autofill.state === "running" ? "Running" : filledCount}</strong>
                </div>
                <div>
                  <span className="jp-flow-dot jp-flow-dot-amber" />
                  <span>Needs review</span>
                  <strong>{reviewCount}</strong>
                </div>
                <div>
                  <span className="jp-flow-dot jp-flow-dot-muted" />
                  <span>Skipped</span>
                  <strong>{skippedCount}</strong>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-2">
              <a href={`${JOBPOSTED_WEB_ORIGIN}/dashboard/onboarding`} target="_blank" className="jp-link-tile" rel="noreferrer">
                <span>Open setup</span>
                <ArrowRight className="size-4" />
              </a>
              <a href={`${JOBPOSTED_WEB_ORIGIN}/dashboard/applications`} target="_blank" className="jp-link-tile" rel="noreferrer">
                <span>History</span>
                <ArrowRight className="size-4" />
              </a>
            </div>
          </>
        )}
      </section>

      {auth === "signed-in" && (
        <footer className="jp-footer sticky bottom-0 px-5 py-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-sm font-bold text-[#dc2626]"
            onClick={signOut}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </footer>
      )}
    </main>
  );
}
