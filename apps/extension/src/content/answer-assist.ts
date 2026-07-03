import {
  EXTENSION_ANSWER_TONES,
  isEligibilityQuestion,
  type ExtensionAnswerMode,
  type ExtensionAnswerTone,
  type ExtensionMessageResponse,
} from "@jobposted/shared";
import { dispatchFieldEvents, labelFor, nativeValueSetter } from "./autofill";

// In-page "answer assist" toolbar. For each open-ended free-text question on an application form we
// attach a small toolbar under the textarea with "Quick answer" (draft from the profile) and
// "Improve it" (rewrite the current text) plus a tone selector. Eligibility / personal-data
// questions are deliberately skipped — those are answered deterministically by the autofill plan,
// never AI-drafted (mirrors the server-side refusal in /api/extension/answer).

const PROCESSED_ATTR = "data-jp-answer-assist";
const TOOLBAR_TAG = "jobposted-answer-assist";
// Below this height a textarea is almost always a single-line note / address box, not an essay
// question worth drafting. Keeps the toolbar off short inputs.
const MIN_TEXTAREA_HEIGHT = 44;

function extensionContextValid(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function sendMessage<T extends ExtensionMessageResponse>(payload: unknown): Promise<T> {
  if (!extensionContextValid()) {
    return Promise.resolve({ ok: false, error: "extension_reloaded" } as unknown as T);
  }
  try {
    return Promise.resolve(chrome.runtime.sendMessage(payload) as Promise<T>).catch(
      () => ({ ok: false, error: "extension_reloaded" }) as unknown as T,
    );
  } catch {
    return Promise.resolve({ ok: false, error: "extension_reloaded" } as unknown as T);
  }
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return true;
  return style.display !== "none" && style.visibility !== "hidden";
}

function isEligibleTextarea(el: HTMLTextAreaElement): boolean {
  if (el.disabled || el.readOnly) return false;
  if (el.getAttribute(PROCESSED_ATTR)) return false;
  if (!isVisible(el)) return false;
  if (el.getBoundingClientRect().height < MIN_TEXTAREA_HEIGHT) return false;
  const question = resolveQuestion(el);
  if (!question || question.length < 8) return false;
  // Never offer to generate eligibility / personal-data answers.
  if (isEligibilityQuestion(question)) return false;
  return true;
}

function resolveQuestion(el: HTMLTextAreaElement): string {
  const label = labelFor(el).trim();
  if (label) return label;
  const placeholder = (el.getAttribute("placeholder") ?? "").trim();
  return placeholder;
}

const STYLE = `
  :host { all: initial; }
  .bar {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin: 6px 0 2px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  button {
    font: inherit; font-size: 12px; line-height: 1; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px;
    height: 28px; padding: 0 10px; border-radius: 7px;
    border: 1px solid #d5d9e0; background: #fff; color: #1f2733;
  }
  button:hover:not(:disabled) { background: #f4f6f9; border-color: #b9c0cc; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { background: #1552d6; border-color: #1552d6; color: #fff; }
  button.primary:hover:not(:disabled) { background: #1244b3; }
  select {
    font: inherit; font-size: 12px; height: 28px; border-radius: 7px;
    border: 1px solid #d5d9e0; background: #fff; color: #1f2733; padding: 0 6px;
  }
  .status { font-size: 11px; color: #6b7280; }
  .status.err { color: #b42318; }
  .dot { width: 12px; height: 12px; }
  @media (prefers-color-scheme: dark) {
    button { background: #1c2230; border-color: #333c4d; color: #e6e9ef; }
    button:hover:not(:disabled) { background: #232b3b; }
    button.primary { background: #2f6bff; border-color: #2f6bff; color: #fff; }
    select { background: #1c2230; border-color: #333c4d; color: #e6e9ef; }
    .status { color: #9aa4b2; }
  }
`;

function spinnerSvg(): string {
  return `<svg class="dot" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/></path></svg>`;
}

function attach(textarea: HTMLTextAreaElement): void {
  textarea.setAttribute(PROCESSED_ATTR, "1");

  const host = textarea.ownerDocument.createElement(TOOLBAR_TAG);
  host.style.display = "block";
  const shadow = host.attachShadow({ mode: "open" });
  const style = textarea.ownerDocument.createElement("style");
  style.textContent = STYLE;

  const bar = textarea.ownerDocument.createElement("div");
  bar.className = "bar";

  const quickBtn = textarea.ownerDocument.createElement("button");
  quickBtn.className = "primary";
  quickBtn.type = "button";
  quickBtn.textContent = "Quick answer";

  const improveBtn = textarea.ownerDocument.createElement("button");
  improveBtn.type = "button";
  improveBtn.textContent = "Improve it";

  const toneSelect = textarea.ownerDocument.createElement("select");
  const neutral = textarea.ownerDocument.createElement("option");
  neutral.value = "";
  neutral.textContent = "Default tone";
  toneSelect.appendChild(neutral);
  for (const tone of EXTENSION_ANSWER_TONES) {
    const option = textarea.ownerDocument.createElement("option");
    option.value = tone;
    option.textContent = tone.charAt(0).toUpperCase() + tone.slice(1);
    toneSelect.appendChild(option);
  }

  const status = textarea.ownerDocument.createElement("span");
  status.className = "status";

  bar.append(quickBtn, improveBtn, toneSelect, status);
  shadow.append(style, bar);

  const syncImproveState = () => {
    improveBtn.disabled = textarea.value.trim().length === 0 || busy;
  };

  let busy = false;
  const setBusy = (on: boolean, label = "") => {
    busy = on;
    quickBtn.disabled = on;
    toneSelect.disabled = on;
    syncImproveState();
    status.classList.remove("err");
    if (on) {
      status.innerHTML = `${spinnerSvg()} ${label}`;
    } else {
      status.textContent = "";
    }
  };

  const run = async (mode: ExtensionAnswerMode) => {
    if (busy) return;
    const question = resolveQuestion(textarea);
    if (!question) return;
    const tone = (toneSelect.value || null) as ExtensionAnswerTone | null;
    setBusy(true, mode === "improve" ? "Improving…" : "Writing…");
    const response = await sendMessage<ExtensionMessageResponse>({
      type: "ANSWER_DRAFT",
      payload: {
        question,
        mode,
        tone,
        currentText: mode === "improve" ? textarea.value : null,
      },
    });
    setBusy(false);
    if (response.ok && response.type === "ANSWER_DRAFT" && response.answer) {
      // Write directly into the field, kept fully editable, and let the host form's
      // controlled-input listeners see the change.
      textarea.focus();
      nativeValueSetter(textarea, response.answer);
      dispatchFieldEvents(textarea);
      syncImproveState();
    } else {
      status.classList.add("err");
      status.textContent = response.ok ? "Could not draft an answer." : friendlyError(response.error);
    }
  };

  quickBtn.addEventListener("click", () => void run("quick"));
  improveBtn.addEventListener("click", () => void run("improve"));
  textarea.addEventListener("input", syncImproveState);
  syncImproveState();

  textarea.insertAdjacentElement("afterend", host);
}

function friendlyError(error: string): string {
  if (error === "not_authenticated") return "Sign in to JobPosted to draft answers.";
  if (error === "request_timeout") return "Timed out — try again.";
  if (error === "network_unavailable") return "You appear to be offline.";
  if (error.startsWith("request_failed:429")) return "Rate limited — try again shortly.";
  return "Could not draft an answer.";
}

function scan(root: ParentNode = document): void {
  const textareas = root.querySelectorAll<HTMLTextAreaElement>("textarea");
  for (const textarea of textareas) {
    if (isEligibleTextarea(textarea)) attach(textarea);
  }
}

export function installAnswerAssist(): void {
  const state = globalThis as typeof globalThis & { __jobpostedAnswerAssist?: boolean };
  if (state.__jobpostedAnswerAssist) return;
  state.__jobpostedAnswerAssist = true;

  const runScan = () => {
    if (!extensionContextValid()) return;
    try {
      scan();
    } catch {
      // Never let a page-specific DOM quirk throw into the host page console.
    }
  };

  runScan();

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      runScan();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const intervalId = window.setInterval(() => {
    if (extensionContextValid()) return;
    window.clearInterval(intervalId);
    observer.disconnect();
    document.querySelectorAll(TOOLBAR_TAG).forEach((el) => el.remove());
  }, 3000);
}
