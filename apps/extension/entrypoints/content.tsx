import React, { useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import type {
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

function message<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage(payload) as Promise<T>;
}

function installBridgeListener() {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.type !== "JOBPOSTED_EXTENSION_SESSION") return;
    void chrome.runtime.sendMessage({
      type: "AUTH_SESSION_DELIVERY",
      requestId: typeof data.requestId === "string" ? data.requestId : undefined,
      session: data.session,
    });
  });
}

function onBridgePage() {
  const expected = new URL(JOBPOSTED_WEB_ORIGIN).hostname;
  return (
    (location.hostname === expected || location.hostname === "localhost") &&
    location.pathname.startsWith("/extension/bridge")
  );
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
    if (onBridgePage()) return;
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
