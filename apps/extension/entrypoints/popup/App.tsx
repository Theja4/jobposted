import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, LogOut, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import type { ExtensionMessageResponse, ExtensionSyncQueueStatus, MasterProfile } from "@jobposted/shared";
import { JOBPOSTED_WEB_ORIGIN } from "../../src/config/env";

type AuthState = "checking" | "signed-out" | "signed-in";

function send<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage(payload) as Promise<T>;
}

export function PopupApp() {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<ExtensionSyncQueueStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const status = await send<ExtensionMessageResponse>({ type: "AUTH_STATUS" });
    if (!status.ok || status.type !== "AUTH_STATUS" || !status.authenticated) {
      setAuth("signed-out");
      setEmail(null);
      return;
    }
    setAuth("signed-in");
    setEmail(status.email ?? null);
    const profileResponse = await send<ExtensionMessageResponse>({ type: "PROFILE_GET" });
    if (profileResponse.ok && profileResponse.type === "PROFILE_GET") {
      setProfile(profileResponse.profile);
    }
    const queueResponse = await send<ExtensionMessageResponse>({ type: "SYNC_QUEUE_STATUS" });
    if (queueResponse.ok && queueResponse.type === "SYNC_QUEUE_STATUS") {
      setSyncStatus(queueResponse.status);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function signIn() {
    setBusy(true);
    await send<ExtensionMessageResponse>({ type: "AUTH_START" });
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    await send<ExtensionMessageResponse>({ type: "AUTH_SIGN_OUT" });
    setProfile(null);
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

  const completeness = profile?.completeness ?? 0;

  return (
    <main className="jp-shell flex h-[580px] w-[380px] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--jp-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img src={chrome.runtime.getURL("brand/jobposted-mark.png")} alt="" className="h-9 w-9 object-contain" />
          <div>
            <p className="text-base font-black tracking-[-0.02em] text-[var(--jp-ink)]">JobPosted</p>
            <p className="text-xs font-bold text-[var(--jp-muted)]">Autofill copilot</p>
          </div>
        </div>
        <button
          type="button"
          className="jp-icon-button"
          title="Options"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          <Settings className="size-4" />
        </button>
      </header>

      <section className="flex-1 space-y-4 px-5 py-5">
        <div className="jp-glass rounded-[16px] p-5">
          {auth === "checking" ? (
            <div className="flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-[var(--jp-brand-600)]" />
              <p className="font-bold">Checking your session</p>
            </div>
          ) : auth === "signed-out" ? (
            <>
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--jp-brand-50)] text-[var(--jp-brand-700)]">
                <ShieldCheck className="size-5" />
              </span>
              <h1 className="mt-4 text-xl font-black tracking-[-0.02em]">Connect your account</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--jp-muted)]">
                Sign in through the JobPosted web app. The extension never asks for ATS passwords.
              </p>
              <button className="jp-button jp-button-primary mt-4 w-full" type="button" disabled={busy} onClick={signIn}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                Sign in with JobPosted
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black">Connected</p>
                  <p className="truncate text-xs font-bold text-[var(--jp-muted)]">{email ?? "JobPosted account"}</p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs font-black">
                  <span>Profile completeness</span>
                  <span className="text-[var(--jp-brand-700)]">{completeness}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--jp-brand-100)]">
                  <div
                    className="h-2 rounded-full bg-[var(--jp-brand-600)]"
                    style={{ width: `${Math.max(4, completeness)}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-2">
          {auth === "signed-in" && syncStatus && syncStatus.pending > 0 && (
            <div className="rounded-[14px] bg-[#fff7ed] p-3 text-xs font-semibold leading-5 text-[#9a3412] ring-1 ring-inset ring-[#fed7aa]">
              <div className="flex items-center justify-between gap-3">
                <span>{syncStatus.pending} application sync pending</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-black text-[#9a3412] ring-1 ring-inset ring-[#fed7aa]"
                  onClick={retrySync}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Retry
                </button>
              </div>
              {syncStatus.lastError && <p className="mt-1 opacity-80">{syncStatus.lastError}</p>}
            </div>
          )}

          <a
            href={`${JOBPOSTED_WEB_ORIGIN}/dashboard/onboarding`}
            target="_blank"
            className="jp-button jp-button-secondary no-underline"
            rel="noreferrer"
          >
            Open setup
            <ArrowRight className="size-4" />
          </a>
          <a
            href={`${JOBPOSTED_WEB_ORIGIN}/dashboard/applications`}
            target="_blank"
            className="jp-button jp-button-secondary no-underline"
            rel="noreferrer"
          >
            Application history
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      {auth === "signed-in" && (
        <footer className="border-t border-[var(--jp-border)] px-5 py-3">
          <button type="button" className="inline-flex items-center gap-2 text-sm font-bold text-[#dc2626]" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </button>
        </footer>
      )}
    </main>
  );
}
