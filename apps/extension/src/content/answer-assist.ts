import {
  EXTENSION_ANSWER_TONES,
  isEligibilityQuestion,
  type ExtensionAnswerMode,
  type ExtensionAnswerTone,
  type ExtensionMessageResponse,
} from "@jobposted/shared";
import { dispatchFieldEvents, labelFor, nativeValueSetter } from "./autofill";

// In-page "answer assist" toolbar. For each open-ended free-text question on an application form we
// float a small toolbar in the bottom-right corner of the textarea with "Quick answer" (draft from
// the profile), "Improve it" (rewrite the current text), and a tone selector. Eligibility /
// personal-data questions are deliberately skipped — those are answered deterministically by the
// autofill plan, never AI-drafted (mirrors the server-side refusal in /api/extension/answer).

const PROCESSED_ATTR = "data-jp-answer-assist";
const TOOLBAR_TAG = "jobposted-answer-assist";
// Below this height a textarea is almost always a single-line note / address box, not an essay
// question worth drafting. Keeps the toolbar off short inputs.
const MIN_TEXTAREA_HEIGHT = 56;
// Inset of the pill from the textarea's bottom-right corner.
const INSET = 10;

type Overlay = {
  textarea: HTMLTextAreaElement;
  host: HTMLElement;
  place: () => void;
  destroy: () => void;
};

const overlays = new Set<Overlay>();
let repositionScheduled = false;
let sharedResizeObserver: ResizeObserver | null = null;

function extensionContextValid(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function assetUrl(path: string): string {
  try {
    return extensionContextValid() ? chrome.runtime.getURL(path) : "";
  } catch {
    return "";
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
  return (el.getAttribute("placeholder") ?? "").trim();
}

const ICON_SPARK =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2.6l1.6 4.3a5 5 0 003 3L20.9 12l-4.3 1.6a5 5 0 00-3 3L12 20.9l-1.6-4.3a5 5 0 00-3-3L3.1 12l4.3-1.6a5 5 0 003-3L12 2.6z"/></svg>';
const ICON_WAND =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l3 3M4 20l10.5-10.5a1.5 1.5 0 012.1 0l0.9 0.9a1.5 1.5 0 010 2.1L7 25"/><path d="M18 3l.5 1.5L20 5l-1.5.5L18 7l-.5-1.5L16 5l1.5-.5zM5 4l.4 1.2L6.6 5.6 5.4 6 5 7.2 4.6 6 3.4 5.6 4.6 5.2z"/></svg>';
const ICON_CHEVRON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 6"/></svg>';

function spinnerSvg(): string {
  return '<svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"/><path d="M21 12a9 9 0 00-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
}

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .wrap {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px; line-height: 1;
    display: inline-flex; flex-direction: column; align-items: flex-end; gap: 6px;
    -webkit-font-smoothing: antialiased;
  }
  .status {
    display: none; align-items: center; gap: 6px;
    max-width: 260px; padding: 5px 9px; border-radius: 8px;
    font-size: 11px; font-weight: 500; letter-spacing: -0.01em;
    background: rgba(255,255,255,0.92); color: #3f4a5c;
    border: 1px solid rgba(20,40,80,0.10);
    box-shadow: 0 4px 14px rgba(20,40,90,0.12);
    backdrop-filter: blur(8px) saturate(1.3); -webkit-backdrop-filter: blur(8px) saturate(1.3);
  }
  .status.show { display: inline-flex; }
  .status.err { color: #b42318; background: rgba(255,244,243,0.95); border-color: rgba(180,35,24,0.22); }
  .spin { animation: jpspin 0.7s linear infinite; }
  @keyframes jpspin { to { transform: rotate(360deg); } }

  .bar {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 5px 4px 7px; border-radius: 12px;
    background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(246,249,255,0.9));
    border: 1px solid rgba(20,45,95,0.12);
    box-shadow: 0 8px 24px rgba(18,45,100,0.16), 0 1px 2px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.7);
    backdrop-filter: blur(10px) saturate(1.5); -webkit-backdrop-filter: blur(10px) saturate(1.5);
  }
  .logo { width: 17px; height: 17px; border-radius: 5px; display: block; flex: 0 0 auto; margin-right: 2px; }
  .sep { width: 1px; height: 18px; background: rgba(20,45,95,0.12); margin: 0 2px; flex: 0 0 auto; }

  .btn {
    font: inherit; font-weight: 600; letter-spacing: -0.01em; cursor: pointer;
    display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
    height: 28px; padding: 0 11px; border-radius: 8px; border: 1px solid transparent;
    transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.06s ease, opacity 0.14s ease;
  }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.55; cursor: default; }
  .btn svg { flex: 0 0 auto; }

  .btn-quick { color: #fff; background: linear-gradient(180deg, #3b82f6, #1d4ed8);
    box-shadow: 0 1px 2px rgba(21,70,190,0.4), inset 0 1px 0 rgba(255,255,255,0.28); }
  .btn-quick:hover:not(:disabled) { background: linear-gradient(180deg, #4c8dff, #1e46c8); }

  .btn-ghost { color: #1f2b45; background: rgba(255,255,255,0.6); border-color: rgba(20,45,95,0.14); }
  .btn-ghost:hover:not(:disabled) { background: #fff; border-color: rgba(20,45,95,0.24); }

  .tone { position: relative; }
  .tone-btn {
    font: inherit; font-weight: 500; cursor: pointer; color: #48546b;
    display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
    height: 28px; padding: 0 8px; border-radius: 8px;
    background: rgba(255,255,255,0.5); border: 1px solid rgba(20,45,95,0.12);
    transition: background 0.14s ease, border-color 0.14s ease;
  }
  .tone-btn:hover { background: #fff; border-color: rgba(20,45,95,0.22); }
  .tone-btn .chev { transition: transform 0.16s ease; display: inline-flex; }
  .tone.open .tone-btn .chev { transform: rotate(180deg); }

  .menu {
    position: absolute; right: 0; bottom: calc(100% + 8px);
    min-width: 152px; padding: 5px; border-radius: 12px;
    background: rgba(255,255,255,0.98); border: 1px solid rgba(20,45,95,0.12);
    box-shadow: 0 14px 34px rgba(18,45,100,0.2), 0 2px 6px rgba(0,0,0,0.06);
    backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4);
    display: none; flex-direction: column; gap: 1px;
    opacity: 0; transform: translateY(4px); transition: opacity 0.13s ease, transform 0.13s ease;
  }
  .tone.open .menu { display: flex; opacity: 1; transform: translateY(0); }
  .menu-item {
    font: inherit; font-weight: 500; text-align: left; cursor: pointer; color: #2c3852;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 7px 9px; border-radius: 8px; border: none; background: transparent;
  }
  .menu-item:hover { background: rgba(59,130,246,0.1); color: #1d4ed8; }
  .menu-item .tick { display: inline-flex; color: #1d4ed8; opacity: 0; }
  .menu-item[aria-selected="true"] { color: #1d4ed8; }
  .menu-item[aria-selected="true"] .tick { opacity: 1; }

  @media (prefers-color-scheme: dark) {
    .bar { background: linear-gradient(180deg, rgba(30,36,52,0.94), rgba(22,27,40,0.9)); border-color: rgba(120,150,210,0.18);
      box-shadow: 0 8px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06); }
    .sep { background: rgba(120,150,210,0.18); }
    .btn-ghost { color: #dbe3f2; background: rgba(255,255,255,0.05); border-color: rgba(120,150,210,0.2); }
    .btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
    .tone-btn { color: #b6c1d6; background: rgba(255,255,255,0.05); border-color: rgba(120,150,210,0.18); }
    .tone-btn:hover { background: rgba(255,255,255,0.1); }
    .menu { background: rgba(28,34,48,0.98); border-color: rgba(120,150,210,0.2); }
    .menu-item { color: #cdd6e6; }
    .menu-item:hover { background: rgba(59,130,246,0.18); color: #9dc0ff; }
    .status { background: rgba(28,34,48,0.94); color: #b6c1d6; border-color: rgba(120,150,210,0.18); }
    .status.err { color: #ffb4ab; background: rgba(60,26,24,0.9); border-color: rgba(255,120,110,0.3); }
  }
`;

function toneLabel(tone: string): string {
  return tone ? tone.charAt(0).toUpperCase() + tone.slice(1) : "Default tone";
}

function attach(textarea: HTMLTextAreaElement): void {
  textarea.setAttribute(PROCESSED_ATTR, "1");
  const doc = textarea.ownerDocument;
  const view = doc.defaultView;
  if (!view) return;

  const host = doc.createElement(TOOLBAR_TAG);
  host.style.cssText = "position:absolute; top:0; left:0; z-index:2147483000; transform:translate(-100%,-100%); pointer-events:auto;";
  const shadow = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = STYLE;

  const wrap = doc.createElement("div");
  wrap.className = "wrap";

  const status = doc.createElement("div");
  status.className = "status";

  const bar = doc.createElement("div");
  bar.className = "bar";

  const logoUrl = assetUrl("brand/jobposted-mark.png");
  if (logoUrl) {
    const logo = doc.createElement("img");
    logo.className = "logo";
    logo.src = logoUrl;
    logo.alt = "JobPosted";
    logo.addEventListener("error", () => logo.remove());
    bar.appendChild(logo);
  }

  const quickBtn = doc.createElement("button");
  quickBtn.type = "button";
  quickBtn.className = "btn btn-quick";
  quickBtn.innerHTML = `${ICON_SPARK}<span>Quick answer</span>`;

  const improveBtn = doc.createElement("button");
  improveBtn.type = "button";
  improveBtn.className = "btn btn-ghost";
  improveBtn.innerHTML = `${ICON_WAND}<span>Improve it</span>`;

  const sep = doc.createElement("div");
  sep.className = "sep";

  // Custom tone dropdown (native <select> can't be styled to match and looked out of place).
  const tone = doc.createElement("div");
  tone.className = "tone";
  const toneBtn = doc.createElement("button");
  toneBtn.type = "button";
  toneBtn.className = "tone-btn";
  const toneText = doc.createElement("span");
  toneText.textContent = "Default tone";
  const chev = doc.createElement("span");
  chev.className = "chev";
  chev.innerHTML = ICON_CHEVRON;
  toneBtn.append(toneText, chev);
  const menu = doc.createElement("div");
  menu.className = "menu";
  tone.append(toneBtn, menu);

  let selectedTone = "";
  const toneOptions = ["", ...EXTENSION_ANSWER_TONES];
  const renderMenu = () => {
    menu.textContent = "";
    for (const value of toneOptions) {
      const item = doc.createElement("button");
      item.type = "button";
      item.className = "menu-item";
      item.setAttribute("aria-selected", value === selectedTone ? "true" : "false");
      item.innerHTML = `<span>${toneLabel(value)}</span><span class="tick">${ICON_CHECK}</span>`;
      item.addEventListener("click", () => {
        selectedTone = value;
        toneText.textContent = toneLabel(value);
        closeMenu();
        renderMenu();
      });
      menu.appendChild(item);
    }
  };
  renderMenu();

  const onDocPointerDown = (event: Event) => {
    const path = event.composedPath();
    if (!path.includes(tone)) closeMenu();
  };
  const closeMenu = () => {
    if (!tone.classList.contains("open")) return;
    tone.classList.remove("open");
    doc.removeEventListener("pointerdown", onDocPointerDown, true);
  };
  const openMenu = () => {
    tone.classList.add("open");
    doc.addEventListener("pointerdown", onDocPointerDown, true);
  };
  toneBtn.addEventListener("click", () => (tone.classList.contains("open") ? closeMenu() : openMenu()));

  bar.append(quickBtn, improveBtn, sep, tone);
  wrap.append(status, bar);
  shadow.append(style, wrap);

  let busy = false;
  const syncImproveState = () => {
    improveBtn.disabled = busy || textarea.value.trim().length === 0;
  };
  const setStatus = (html: string, error = false) => {
    status.classList.toggle("err", error);
    status.classList.toggle("show", Boolean(html));
    status.innerHTML = html;
  };
  const setBusy = (on: boolean, label = "") => {
    busy = on;
    quickBtn.disabled = on;
    toneBtn.disabled = on;
    syncImproveState();
    if (on) setStatus(`${spinnerSvg()}<span>${label}</span>`);
    else setStatus("");
  };

  const run = async (mode: ExtensionAnswerMode) => {
    if (busy) return;
    closeMenu();
    const question = resolveQuestion(textarea);
    if (!question) return;
    setBusy(true, mode === "improve" ? "Improving…" : "Writing…");
    const response = await sendMessage<ExtensionMessageResponse>({
      type: "ANSWER_DRAFT",
      payload: {
        question,
        mode,
        tone: (selectedTone || null) as ExtensionAnswerTone | null,
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
      setStatus(response.ok ? "Couldn't draft an answer." : friendlyError(response.error), true);
    }
  };

  quickBtn.addEventListener("click", () => void run("quick"));
  improveBtn.addEventListener("click", () => void run("improve"));
  textarea.addEventListener("input", syncImproveState);
  syncImproveState();

  const place = () => {
    if (!textarea.isConnected || !isVisible(textarea)) {
      host.style.visibility = "hidden";
      return;
    }
    const rect = textarea.getBoundingClientRect();
    host.style.visibility = "visible";
    host.style.top = `${rect.bottom + view.scrollY - INSET}px`;
    host.style.left = `${rect.right + view.scrollX - INSET}px`;
  };

  const destroy = () => {
    closeMenu();
    textarea.removeEventListener("input", syncImproveState);
    sharedResizeObserver?.unobserve(textarea);
    overlays.delete(overlay);
    host.remove();
  };

  const overlay: Overlay = { textarea, host, place, destroy };
  overlays.add(overlay);
  (doc.body ?? doc.documentElement).appendChild(host);
  sharedResizeObserver?.observe(textarea);
  place();
}

function friendlyError(error: string): string {
  if (error === "not_authenticated") return "Sign in to JobPosted to draft answers.";
  if (error === "request_timeout") return "Timed out — try again.";
  if (error === "network_unavailable") return "You appear to be offline.";
  if (error.startsWith("request_failed:429")) return "Rate limited — try again shortly.";
  return "Couldn't draft an answer.";
}

function scheduleReposition(): void {
  if (repositionScheduled) return;
  repositionScheduled = true;
  window.requestAnimationFrame(() => {
    repositionScheduled = false;
    for (const overlay of overlays) {
      if (!overlay.textarea.isConnected) overlay.destroy();
      else overlay.place();
    }
  });
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

  if (typeof ResizeObserver !== "undefined") {
    sharedResizeObserver = new ResizeObserver(() => scheduleReposition());
  }

  const runScan = () => {
    if (!extensionContextValid()) return;
    try {
      scan();
      scheduleReposition();
    } catch {
      // Never let a page-specific DOM quirk throw into the host page console.
    }
  };

  runScan();

  let scanScheduled = false;
  const observer = new MutationObserver(() => {
    if (scanScheduled) return;
    scanScheduled = true;
    window.requestAnimationFrame(() => {
      scanScheduled = false;
      runScan();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Keep every pill glued to its textarea's bottom-right corner. Capture-phase catches scrolling
  // inside nested containers, not just the window.
  window.addEventListener("scroll", scheduleReposition, { passive: true, capture: true });
  window.addEventListener("resize", scheduleReposition, { passive: true });

  const intervalId = window.setInterval(() => {
    if (extensionContextValid()) return;
    window.clearInterval(intervalId);
    observer.disconnect();
    sharedResizeObserver?.disconnect();
    window.removeEventListener("scroll", scheduleReposition, true);
    window.removeEventListener("resize", scheduleReposition);
    for (const overlay of Array.from(overlays)) overlay.destroy();
    document.querySelectorAll(TOOLBAR_TAG).forEach((el) => el.remove());
  }, 3000);
}
