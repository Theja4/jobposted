import { useEffect, useState } from "react";
import type { ExtensionMessageResponse } from "@jobposted/shared";
import { AlertTriangle, CheckCircle2, Loader2, Settings, Wand2 } from "lucide-react";

type LauncherState =
  | { status: "opening" }
  | { status: "opened" }
  | { status: "failed"; error: string };

function send<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage(payload) as Promise<T>;
}

async function openPanel() {
  return send<ExtensionMessageResponse>({ type: "PANEL_OPEN_ACTIVE_TAB" });
}

export function PopupApp() {
  const [state, setState] = useState<LauncherState>({ status: "opening" });

  async function tryOpen() {
    setState({ status: "opening" });
    try {
      const response = await openPanel();
      if (response.ok && response.type === "PANEL_OPEN_ACTIVE_TAB") {
        setState({ status: "opened" });
        return;
      }
      setState({ status: "failed", error: response.ok ? "JobPosted did not return an open-panel response." : response.error });
    } catch (error) {
      setState({
        status: "failed",
        error: error instanceof Error ? error.message : "JobPosted could not open on this tab.",
      });
    }
  }

  useEffect(() => {
    void tryOpen();
  }, []);

  return (
    <main className="jp-popup">
      <header>
        <img src={chrome.runtime.getURL("brand/jobposted-mark.png")} alt="" />
        <div>
          <strong>JobPosted</strong>
          <span>Autofill launcher</span>
        </div>
      </header>

      {state.status === "opening" ? (
        <section className="jp-state">
          <Loader2 className="jp-spin" aria-hidden="true" />
          <div>
            <strong>Opening panel</strong>
            <span>Attaching JobPosted to this page.</span>
          </div>
        </section>
      ) : null}

      {state.status === "opened" ? (
        <>
          <section className="jp-state jp-ok">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>Panel opened</strong>
              <span>Look for the JobPosted dock on the right edge of the page.</span>
            </div>
          </section>
          <div className="jp-actions">
            <button type="button" className="jp-primary" onClick={() => void tryOpen()}>
              <Wand2 aria-hidden="true" />
              Open again
            </button>
            <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
              <Settings aria-hidden="true" />
              Options
            </button>
          </div>
        </>
      ) : null}

      {state.status === "failed" ? (
        <>
          <section className="jp-state jp-warn">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Could not open here</strong>
              <span>{state.error}</span>
            </div>
          </section>
          <div className="jp-actions">
            <button type="button" className="jp-primary" onClick={() => void tryOpen()}>
              <Wand2 aria-hidden="true" />
              Try again
            </button>
            <button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
              <Settings aria-hidden="true" />
              Options
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
