import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import type {
  ExtensionAuthSession,
  ExtensionFieldFillRecord,
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
  JOBPOSTED_WEB_ORIGIN.startsWith("http://localhost");

function originMatch(origin: string) {
  try {
    return `${new URL(origin).origin}/*`;
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
  ...(includeLocalhost ? ["http://localhost:3000/*"] : []),
].filter((value, index, all) => all.indexOf(value) === index);

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
    (includeLocalhost && host === "localhost")
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

function installBridgeListener() {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.type !== "JOBPOSTED_EXTENSION_SESSION") return;
    const session = normalizeSupabaseSession(data.session);
    if (!session) return;
    void chrome.runtime.sendMessage({
      type: "AUTH_SESSION_DELIVERY",
      requestId: typeof data.requestId === "string" ? data.requestId : undefined,
      session,
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

function JobPostedOverlayApp() {
  const adapter = useMemo(() => detectAdapter(), []);
  const [state, setState] = useState<OverlayRunState>("idle");
  const [fields, setFields] = useState<ExtensionFieldFillRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stepName, setStepName] = useState(adapter.detectStep(document).name);
  const stopRequested = useRef(false);

  async function loadPrereqs() {
    setState("loading");
    const [settingsResponse, profileResponse] = await Promise.all([
      message<ExtensionMessageResponse>({ type: "SETTINGS_GET" }),
      message<ExtensionMessageResponse>({ type: "PROFILE_GET" }),
    ]);
    if (!settingsResponse.ok || settingsResponse.type !== "SETTINGS_GET") {
      throw new Error(settingsResponse.ok ? "Settings unavailable." : settingsResponse.error);
    }
    if (!profileResponse.ok || profileResponse.type !== "PROFILE_GET") {
      throw new Error(profileResponse.ok ? "Profile unavailable." : profileResponse.error);
    }
    return {
      settings: settingsResponse.settings,
      profile: profileResponse.profile,
    };
  }

  async function sync(fieldsFilled: ExtensionFieldFillRecord[], status: "filled" | "submitted") {
    const payload = {
      ...applicationMetadata(adapter.id),
      status,
      appliedAt: new Date().toISOString(),
      fieldsFilled,
    };
    const response = await message<ExtensionMessageResponse>({ type: "APPLICATION_SYNC", payload });
    if (response.ok && response.type === "APPLICATION_SYNC" && response.result.queued) {
      setError("Saved locally. JobPosted will retry syncing this application automatically.");
    }
  }

  async function run(continueSteps: boolean) {
    stopRequested.current = false;
    setError(null);
    setFields([]);
    try {
      const { settings, profile } = await loadPrereqs();
      if (settings.enabledPlatforms[adapter.id] === false) {
        throw new Error(`${adapter.label} is disabled in JobPosted options.`);
      }
      if (adapter.id === "generic" && !settings.enableGenericFallback) {
        throw new Error("Generic fallback is off. Enable it in options for unknown forms.");
      }

      setState("filling");
      const allRecords: ExtensionFieldFillRecord[] = [];
      for (let step = 0; step < (continueSteps ? 8 : 1); step += 1) {
        if (stopRequested.current) break;
        setStepName(adapter.detectStep(document).name);
        const result = await fillCurrentStep({
          adapter,
          profile: profile as MasterProfile,
          settings: settings as ExtensionSettings,
          onField: (record) => {
            allRecords.push(record);
            setFields([...allRecords]);
          },
        });

        const submit = adapter.findSubmit(document);
        const canAdvance = continueSteps && settings.autoAdvance;
        if (!canAdvance || stopRequested.current) break;
        if (submit) {
          break;
        }

        const next = adapter.findAdvance(document);
        if (!next) break;
        await humanDelay(settings);
        next.click();
        await waitForStepChange();
        if (result.total === 0) break;
      }

      await sync(allRecords, "filled");
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
  runAt: "document_idle",
  cssInjectionMode: "manual",
  async main(ctx) {
    installBridgeListener();
    if (isJobPostedWebAppHost()) {
      void syncStoredWebSession();
      return;
    }
    injectPageHighlightStyle();
    const adapter = detectAdapter();
    if (adapter.id === "generic") {
      const settings = await message<ExtensionMessageResponse>({ type: "SETTINGS_GET" });
      if (!settings.ok || settings.type !== "SETTINGS_GET" || !settings.settings.enableGenericFallback) return;
    }

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
      },
    });
    ui.mount();
  },
});
