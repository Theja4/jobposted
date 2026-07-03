import type {
  CanonicalFieldKey,
  ExtensionFieldFillRecord,
  MasterProfileEducation,
  MasterProfileExperience,
  MasterProfileLocation,
} from "@jobposted/shared";
import {
  activateDropdownOption,
  activateElement,
  dispatchKey,
  isVisible,
  sleep,
} from "./fill";
import { bestMatch, fuzzyScore } from "./fuzzy-match";
import { normalizeText, visibleText } from "./text";
import type { FillContext } from "./types";

const MY_EXPERIENCE_ROOT = "[data-automation-id='applyFlowMyExpPage']";
const WORKDAY_EXPERIENCE_OWNED_SELECTOR = [
  "[data-automation-id='formField-degree']",
  "[data-automation-id='formField-fieldOfStudy']",
  "[data-automation-id='formField-skills']",
].join(",");
const MULTISELECT_CONTAINER = "[data-automation-id='multiSelectContainer']";
const MULTISELECT_INPUT = "[data-automation-id='multiselectInputContainer'] input";
const OPTION_SELECTOR = "[role='option'], [role='menuitem'], [data-automation-id*='option' i]";
const OPTION_POPUP_SELECTOR = "[role='listbox'], [role='menu'], [data-automation-id*='list' i], [data-automation-id*='prompt' i]";
const ADD_ROW_BUTTON = "[data-automation-id='add-button'], [data-automation-id='addAnother']";
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, [role='heading']";

// fuzzyScore scale: exact 1, subset/variant ~0.85+, near-miss ~0.6. 0.55 keeps close matches.
const OPTION_MATCH_THRESHOLD = 0.55;
const SCHOOL_MATCH_THRESHOLD = 0.55;
const MAX_REPEATER_ROWS = 8;
const REPEATER_ROW_WAIT_MS = 8000;
const PROFILE_SKILLS_LIMIT = 60;
const SKILLS_MAX_SELECTED = PROFILE_SKILLS_LIMIT;
const SKILLS_MAX_SEARCHES = PROFILE_SKILLS_LIMIT;
const SKILLS_MAX_MISSES_AFTER_SELECTION = PROFILE_SKILLS_LIMIT;
const SKILL_OPTION_CLICKABLE_RATIO = 0.55;
const SKILL_OPTION_CLIPPED_RATIO = 0.05;
const WORKDAY_PROMPT_ROW_SELECTOR = "[role='option'], [id^='menuItem'], [data-automation-id*='menuItem' i]";
const WORKDAY_CHOICE_CONTROL_SELECTOR =
  "[role='checkbox'], [data-automation-id*='checkbox' i], input[type='checkbox'], [role='radio'], input[type='radio']";
const WORKDAY_EXPERIENCE_BUILD_TAG = "wd-setup-authoritative-exact-skills-2026-06-23";

const EXPERIENCE_FIELDS = {
  jobTitle: "[data-automation-id='formField-jobTitle']",
  company: "[data-automation-id='formField-companyName']",
  location: "[data-automation-id='formField-location']",
  current: "[data-automation-id='formField-currentlyWorkHere']",
  startDate: "[data-automation-id='formField-startDate']",
  endDate: "[data-automation-id='formField-endDate']",
  description: "[data-automation-id='formField-roleDescription']",
} as const;

const NON_LOCATION_FRAGMENTS = new Set([
  "analytics",
  "business",
  "business unit",
  "department",
  "domain",
  "engineering",
  "function",
  "grade",
  "level",
  "platform",
  "product",
  "program",
  "project",
  "role",
  "software",
  "strategy",
  "team",
  "technology",
  "tier",
  "vertical",
  "workstream",
]);
const EDUCATION_FIELDS = {
  school: "[data-automation-id='formField-schoolName']",
  degree: "[data-automation-id='formField-degree']",
  field: "[data-automation-id='formField-fieldOfStudy']",
  gpa: "[data-automation-id='formField-gradeAverage']",
  startYear: "[data-automation-id='formField-firstYearAttended']",
  endYear: "[data-automation-id='formField-lastYearAttended']",
} as const;

const LANGUAGE_FIELDS = {
  language:
    "[data-automation-id='formField-language'], [data-automation-id='formField-languageName'], [data-automation-id='formField-languageProficiency-language']",
  proficiency:
    "[data-automation-id='formField-proficiency'], [data-automation-id='formField-languageProficiency-proficiency'], [data-automation-id='formField-languageProficiency']",
} as const;

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Brief grace after typing in case the widget searches as you type, then we press Enter and wait
// patiently for the async result list to render.
const TYPEAHEAD_INITIAL_OPTION_WAIT_MS = 350;
const SKILLS_INITIAL_OPTION_WAIT_MS = 1200;
// Workday loads its option lists asynchronously after Enter (a spinner, then the rows) and can take a
// few seconds. Wait this long for results to appear before giving up on a search.
const OPTION_MATCH_TIMEOUT_MS = 5500;
const SKILLS_OPTION_MATCH_TIMEOUT_MS = 30000;
const SKILLS_LIST_SETTLE_MS = 7000;
const SKILLS_NO_ITEMS_SETTLE_MS = 3000;
const TYPEAHEAD_CHIP_COMMIT_WAIT_MS = 1800;
const SKILLS_CHIP_COMMIT_WAIT_MS = 6000;
// Once a list HAS rendered (rows that don't match, or a "No Items." notice) hold it steady this long
// before abandoning the search — long enough to ride out the brief "No Items." flash that precedes
// the real rows, short enough to move on once the list has genuinely settled.
const LIST_SETTLE_MS = 2200;
const NO_ITEMS_SETTLE_MS = 1200;
type StopCheck = () => boolean;
type IgnoredOptions = ReadonlyMap<HTMLElement, string>;
type TypeaheadWaitConfig = { listSettleMs?: number; noItemsSettleMs?: number };

// TEMP diagnostics — verbose Workday skills/typeahead logging. Flip to false to silence.
const WD_DEBUG = true;
function wdlog(...args: unknown[]) {
  if (WD_DEBUG) console.log("[JP-WD]", ...args);
}
function describeOptions(doc: Document, ignored: IgnoredOptions) {
  const all = allOptionCandidates(doc);
  const fresh = all.filter((option) => !isIgnoredOption(option, ignored));
  return {
    total: all.length,
    fresh: fresh.length,
    labels: fresh.slice(0, 14).map((option) => optionLabel(option)).join(" | "),
    sampleHtml: (fresh[0] ?? all[0])?.outerHTML?.replace(/\s+/g, " ").slice(0, 300) ?? null,
  };
}

function dispatchInputChange(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function nativeTextSetter(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
  if (element.value !== value) element.value = value;
}

function dispatchFocusLike(element: HTMLElement, type: "focus" | "focusin" | "focusout" | "blur") {
  const bubbles = type === "focusin" || type === "focusout";
  try {
    element.dispatchEvent(new FocusEvent(type, { bubbles }));
  } catch {
    element.dispatchEvent(new Event(type, { bubbles }));
  }
}

function dispatchInputLike(element: HTMLElement, type: "beforeinput" | "input", value: string) {
  const InputEventCtor =
    element.ownerDocument.defaultView?.InputEvent ?? (typeof InputEvent !== "undefined" ? InputEvent : undefined);
  if (InputEventCtor) {
    element.dispatchEvent(
      new InputEventCtor(type, {
        bubbles: true,
        cancelable: type === "beforeinput",
        data: value,
        inputType: "insertText",
      }),
    );
    return;
  }
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: type === "beforeinput" }));
}

function commitWorkdayField(element: HTMLElement, wrapper?: HTMLElement | null, value = "") {
  element.focus?.();
  dispatchFocusLike(element, "focus");
  dispatchFocusLike(element, "focusin");
  dispatchInputLike(element, "input", value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
  if (wrapper && wrapper !== element) {
    wrapper.dispatchEvent(new Event("input", { bubbles: true }));
    wrapper.dispatchEvent(new Event("change", { bubbles: true }));
  }
  dispatchKey(element, "Tab");
  element.blur?.();
  dispatchFocusLike(element, "focusout");
  dispatchFocusLike(element, "blur");
}

function setWorkdayText(element: HTMLElement, value: string, wrapper?: HTMLElement | null) {
  element.focus?.();
  dispatchFocusLike(element, "focus");
  dispatchFocusLike(element, "focusin");
  dispatchInputLike(element, "beforeinput", value);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeTextSetter(element, value);
    if (element instanceof HTMLInputElement) element.setAttribute("value", value);
  } else if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    element.textContent = value;
    element.setAttribute("aria-valuetext", value);
  } else {
    element.setAttribute("value", value);
  }
  commitWorkdayField(element, wrapper, value);
}

function setTypeaheadText(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  if (input.value !== value) input.value = value;
  dispatchInputChange(input);
}

function setNativeChecked(input: HTMLInputElement, value: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setter?.call(input, value);
  if (input.checked !== value) input.checked = value;
}

function dispatchTypeaheadKey(element: HTMLElement, key: string) {
  const keyCode =
    key === "Escape" ? 27 : key === "Enter" ? 13 : key === "ArrowDown" ? 40 : key === "Tab" ? 9 : key === " " ? 32 : key.length === 1 ? key.charCodeAt(0) : 0;
  const init = {
    key,
    code: key === "Escape" ? "Escape" : key === "Enter" ? "Enter" : key === "ArrowDown" ? "ArrowDown" : key === " " ? "Space" : key,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit;
  element.dispatchEvent(new KeyboardEvent("keydown", init));
  element.dispatchEvent(new KeyboardEvent("keypress", init));
  element.dispatchEvent(new KeyboardEvent("keyup", init));
}

function workdayProgressRecord(args: {
  label: string;
  canonicalKey: CanonicalFieldKey;
  status: ExtensionFieldFillRecord["status"];
  required?: boolean;
  error?: string;
  valuePreview?: string;
  signatureHint?: string;
}): ExtensionFieldFillRecord {
  return {
    signature: normalizeText(["workday-extra", args.label, args.canonicalKey, args.signatureHint].join(" ")).slice(0, 240),
    label: args.label,
    required: args.required ?? args.status === "needs_user",
    canonicalKey: args.canonicalKey,
    confidence: 0.9,
    source: "adapter",
    status: args.status,
    error: args.error,
    valuePreview: args.valuePreview,
  };
}

function emitWorkdayProgress(context: FillContext, args: Parameters<typeof workdayProgressRecord>[0]) {
  context.onField(workdayProgressRecord(args));
}

export function isWorkdayExperienceOwnedControl(element: HTMLElement) {
  return Boolean(
    element.closest(WORKDAY_EXPERIENCE_OWNED_SELECTOR) &&
      element.ownerDocument.querySelector(MY_EXPERIENCE_ROOT),
  );
}

function myExperienceRoot(doc: Document) {
  const root = doc.querySelector<HTMLElement>(MY_EXPERIENCE_ROOT);
  if (!root) return null;
  const activeStep = visibleText(
    doc.querySelector("[data-automation-id='progressBarActiveStep']")?.textContent,
  );
  if (activeStep && !/my experience/i.test(activeStep)) return null;
  return root;
}

// ---------------------------------------------------------------------------
// Option / typeahead primitives (shared by degree, field of study, skills, school)
// ---------------------------------------------------------------------------

function placeholderText(value: string) {
  const text = normalizeText(value);
  return !text || /^(select|select one|select option|choose|choose one|choose option|none selected)$/.test(text);
}

function optionLabel(option: HTMLElement) {
  return visibleText(
    option.getAttribute("data-automation-label") ||
      option.getAttribute("title") ||
      option.getAttribute("aria-label") ||
      option.textContent ||
      option.getAttribute("data-value") ||
      option.getAttribute("value"),
  )
    .replace(/\bnot\s+checked\b/gi, " ")
    .replace(/\bchecked\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueElements(elements: Array<HTMLElement | null | undefined>) {
  const seen = new Set<HTMLElement>();
  const out: HTMLElement[] = [];
  for (const element of elements) {
    if (!element || seen.has(element)) continue;
    seen.add(element);
    out.push(element);
  }
  return out;
}

function candidateFromPopupDescendant(element: HTMLElement, popup: HTMLElement) {
  if (element.matches(OPTION_SELECTOR)) return element;
  if (element.getAttribute("role") === "checkbox" || (element instanceof HTMLInputElement && element.type === "checkbox")) {
    const row =
      element.closest<HTMLElement>(OPTION_SELECTOR) ??
      element.closest<HTMLElement>("label, li, [data-automation-id*='row' i], [data-automation-id*='item' i]") ??
      element.parentElement;
    return row && row !== popup ? row : null;
  }
  return element !== popup ? element : null;
}

function isSelectedMultiselectItem(element: HTMLElement) {
  return Boolean(element.closest("[data-automation-id='selectedItemList'], [data-automation-id='selectedItem']"));
}

function isUsableOptionCandidate(option: HTMLElement) {
  const label = normalizeText(optionLabel(option));
  return (
    isVisible(option) &&
    !isSelectedMultiselectItem(option) &&
    label.length > 0 &&
    label.length <= 180 &&
    !/^(search results?|no (?:items?|results?|matches?|options?))(?:\s*\(\d+\))?$/.test(label)
  );
}

function elementRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function rectArea(rect: { top: number; right: number; bottom: number; left: number; width: number; height: number }) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function rectIntersectionArea(
  one: { top: number; right: number; bottom: number; left: number },
  two: { top: number; right: number; bottom: number; left: number },
) {
  const width = Math.max(0, Math.min(one.right, two.right) - Math.max(one.left, two.left));
  const height = Math.max(0, Math.min(one.bottom, two.bottom) - Math.max(one.top, two.top));
  return width * height;
}

function optionVisibleClipRatio(option: HTMLElement) {
  const rect = elementRect(option);
  if (!rect || rectArea(rect) === 0) return 1;

  const view = option.ownerDocument.defaultView;
  let clip = {
    top: 0,
    left: 0,
    right: view?.innerWidth || Number.POSITIVE_INFINITY,
    bottom: view?.innerHeight || Number.POSITIVE_INFINITY,
  };

  for (let node = option.parentElement; node && node !== option.ownerDocument.body; node = node.parentElement) {
    const style = view?.getComputedStyle?.(node);
    const clipsChildren =
      node.matches(OPTION_POPUP_SELECTOR) ||
      Boolean(style && /(auto|scroll|hidden|clip)/i.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`));
    if (!clipsChildren) continue;
    const nodeRect = elementRect(node);
    if (!nodeRect || rectArea(nodeRect) === 0) continue;
    clip = {
      top: Math.max(clip.top, nodeRect.top),
      left: Math.max(clip.left, nodeRect.left),
      right: Math.min(clip.right, nodeRect.right),
      bottom: Math.min(clip.bottom, nodeRect.bottom),
    };
  }

  return rectIntersectionArea(rect, clip) / rectArea(rect);
}

function optionClickabilityBonus(option: HTMLElement) {
  const ratio = optionVisibleClipRatio(option);
  if (ratio >= 0.85) return 0.18;
  if (ratio <= SKILL_OPTION_CLIPPED_RATIO) return -0.2;
  return 0;
}

function optionLabelKey(option: HTMLElement) {
  return normalizeText(optionLabel(option));
}

function isScrollableOptionContainer(element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle?.(element);
  return (
    element.matches(OPTION_POPUP_SELECTOR) ||
    element.scrollHeight > element.clientHeight ||
    Boolean(style && /(auto|scroll|hidden|clip)/i.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`))
  );
}

function optionScrollContainers(option: HTMLElement) {
  const containers: HTMLElement[] = [];
  for (let node = option.parentElement; node && node !== option.ownerDocument.body; node = node.parentElement) {
    if (isScrollableOptionContainer(node)) containers.push(node);
  }
  return containers;
}

function parsePixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function virtualRowTop(row: HTMLElement, container: HTMLElement) {
  const styledTop = parsePixelValue(row.style.top || "");
  if (styledTop !== null) return styledTop;
  if (row.offsetTop) return row.offsetTop;
  const rowRect = elementRect(row);
  const containerRect = elementRect(container);
  if (rowRect && containerRect) return rowRect.top - containerRect.top + container.scrollTop;
  return null;
}

function scrollOptionIntoWorkdayView(option: HTMLElement) {
  const row = option.closest<HTMLElement>(WORKDAY_PROMPT_ROW_SELECTOR) ?? option;
  const rowRect = elementRect(row);
  const rowHeight = rowRect?.height || row.offsetHeight || 32;
  for (const container of optionScrollContainers(row)) {
    const top = virtualRowTop(row, container);
    if (top === null) continue;
    const viewportHeight = container.clientHeight || elementRect(container)?.height || rowHeight;
    const targetTop = Math.max(0, top - Math.max(0, (viewportHeight - rowHeight) / 2));
    container.scrollTop = targetTop;
    container.dispatchEvent(new Event("scroll", { bubbles: true }));
  }
  row.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

function allOptionCandidates(doc: Document) {
  const direct = Array.from(doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter(
    (option) => !isSelectedMultiselectItem(option),
  );
  const popupRows = Array.from(doc.querySelectorAll<HTMLElement>(OPTION_POPUP_SELECTOR)).flatMap((popup) => {
    if (
      !isVisible(popup) ||
      isSelectedMultiselectItem(popup) ||
      popup.hasAttribute("hidden") ||
      popup.getAttribute("aria-hidden") === "true"
    ) {
      return [];
    }
    const descendants = Array.from(
      popup.querySelectorAll<HTMLElement>(`${OPTION_SELECTOR}, li, label, [role='checkbox'], input[type='checkbox']`),
    );
    return descendants.map((element) => candidateFromPopupDescendant(element, popup));
  });
  return uniqueElements([...direct, ...popupRows]).filter(isUsableOptionCandidate);
}

function optionSignature(option: HTMLElement) {
  return normalizeText([option.id, optionLabel(option)].filter(Boolean).join(" "));
}

function snapshotOptionCandidates(doc: Document) {
  const snapshot = new Map<HTMLElement, string>();
  for (const option of allOptionCandidates(doc)) snapshot.set(option, optionSignature(option));
  return snapshot;
}

function rememberVisibleOptions(doc: Document, ignoredOptions: Map<HTMLElement, string>) {
  for (const option of allOptionCandidates(doc)) ignoredOptions.set(option, optionSignature(option));
}

function isIgnoredOption(option: HTMLElement, ignoredOptions: IgnoredOptions) {
  return ignoredOptions.get(option) === optionSignature(option);
}

function optionCandidates(doc: Document, ignoredOptions: IgnoredOptions) {
  const all = allOptionCandidates(doc);
  const fresh = all.filter((option) => !isIgnoredOption(option, ignoredOptions));
  return fresh;
}

function hasNoItemsNotice(doc: Document, ignoredOptions: IgnoredOptions) {
  if (optionCandidates(doc, ignoredOptions).length > 0) return false;
  return Array.from(doc.querySelectorAll<HTMLElement>(OPTION_POPUP_SELECTOR)).some((element) => {
    const text = normalizeText(visibleText(element.textContent));
    return !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true" && /\bno (?:items?|results?|matches?|options?)\b/.test(text);
  });
}

function bestMatchingOption(options: HTMLElement[], target: string) {
  const match = bestMatch(
    target,
    options,
    (option) => optionLabel(option) || option.getAttribute("data-value") || option.getAttribute("value") || "",
    OPTION_MATCH_THRESHOLD,
  );
  return match?.option ?? null;
}

function bestMatchingOptionForTargets(options: HTMLElement[], targets: string[]) {
  for (const target of targets) {
    const option = bestMatchingOption(options, target);
    if (option) return option;
  }
  return null;
}

function stripParentheticals(value: string) {
  return value.replace(/\([^)]*\)/g, " ");
}

function parentheticalMatchesTarget(value: string, target: string) {
  const desired = normalizeText(target);
  if (!desired) return false;
  return Array.from(value.matchAll(/\(([^)]*)\)/g)).some((match) =>
    normalizeText(match[1] ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .includes(desired),
  );
}

function strictOptionMatchesTarget(option: HTMLElement, target: string) {
  return chipTextMatchesTarget(optionLabel(option), target);
}

function optionMatchesLiteralTarget(option: HTMLElement, targets: string[]) {
  const label = optionLabelKey(option);
  return Boolean(label && targets.some((target) => normalizeText(target) === label));
}

function bestLiteralExactOptionForTargets(options: HTMLElement[], targets: string[]) {
  for (const target of targets) {
    const option = bestLiteralExactSkillOption(options, target);
    if (option) return option;
  }
  return null;
}

function bestMatchingStrictOptionForTargets(options: HTMLElement[], targets: string[]) {
  for (const target of targets) {
    const option = options.find((candidate) => strictOptionMatchesTarget(candidate, target));
    if (option) return option;
  }
  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeSkillVariantMatches(target: string, label: string) {
  const aliases: Record<string, string[]> = {
    aws: ["amazon web services"],
    "amazon web services": ["aws"],
    gcp: ["google cloud platform"],
    "google cloud platform": ["gcp"],
    jira: ["atlassian jira", "jira software"],
    slack: ["slack software"],
    python: ["python programming language", "python language"],
    react: ["react js", "reactjs", "react javascript"],
    "react js": ["react", "reactjs"],
    node: ["node js", "nodejs"],
    "node js": ["node", "nodejs"],
    postgres: ["postgresql", "postgre sql"],
    postgresql: ["postgres", "postgre sql"],
    "rest apis": ["restful apis", "restful api", "rest api"],
    "rest api": ["restful api", "restful apis", "rest apis"],
    "restful apis": ["rest apis", "rest api"],
    prd: ["product requirement document", "product requirements document"],
    prds: ["product requirement documents", "product requirements documents"],
    kubernetes: ["k8s"],
    k8s: ["kubernetes"],
    "machine learning": ["ml"],
    ml: ["machine learning"],
  };
  if (aliases[target]?.includes(label)) return true;
  const suffixPattern = new RegExp(`^${escapeRegExp(target)}\\s+(?:programming language|language|software|framework|library)$`);
  return suffixPattern.test(label);
}

function skillOptionConfidence(target: string, option: HTMLElement) {
  const desired = normalizeText(target);
  const rawLabel = optionLabel(option);
  const label = normalizeText(rawLabel);
  const baseLabel = normalizeText(stripParentheticals(rawLabel));
  if (!desired || !label) return 0;
  if (label === desired) return 1;
  if (baseLabel === desired) return 0.98;
  if (parentheticalMatchesTarget(rawLabel, desired)) return 0.96;
  if (safeSkillVariantMatches(desired, baseLabel) || safeSkillVariantMatches(desired, label)) return 0.92;

  const desiredTokens = desired.split(/\s+/).filter(Boolean);
  const baseTokens = baseLabel.split(/\s+/).filter(Boolean);
  if (desiredTokens.length === 1 && desired.length <= 3) return 0;
  if (desiredTokens.length === 1 && baseTokens.length <= 3 && baseTokens.includes(desired)) {
    return baseTokens.length === 1 ? 0.9 : 0.72;
  }
  return fuzzyScore(desired, baseLabel) >= 0.92 ? 0.7 : 0;
}

function skillOptionIsLiteralExact(target: string, option: HTMLElement) {
  const desired = normalizeText(target);
  return Boolean(desired && normalizeText(optionLabel(option)) === desired);
}

function bestLiteralExactSkillOption(options: HTMLElement[], target: string) {
  const exactOptions = options.filter((option) => skillOptionIsLiteralExact(target, option));
  if (exactOptions.length === 0) return null;
  return exactOptions.sort((left, right) => optionVisibleClipRatio(right) - optionVisibleClipRatio(left))[0] ?? null;
}

function bestMatchingSkillOption(options: HTMLElement[], targets: string[]) {
  let best: { option: HTMLElement; score: number; rawScore: number } | null = null;
  for (const target of targets) {
    const exactOption = bestLiteralExactSkillOption(options, target);
    if (exactOption) return exactOption;
    for (const option of options) {
      const score = skillOptionConfidence(target, option);
      const exactBonus = skillOptionIsLiteralExact(target, option) ? 0.45 : 0;
      const adjustedScore = score > 0 ? score + exactBonus + optionClickabilityBonus(option) : 0;
      if (!best || adjustedScore > best.score) best = { option, score: adjustedScore, rawScore: score };
    }
  }
  return best && best.rawScore >= 0.72 ? best.option : null;
}

async function scanForLiteralExactOption(
  doc: Document,
  ignoredOptions: IgnoredOptions,
  targets: string[],
  shouldStop?: StopCheck,
) {
  const current = bestLiteralExactOptionForTargets(optionCandidates(doc, ignoredOptions), targets);
  if (current) return current;

  const popups = Array.from(doc.querySelectorAll<HTMLElement>(OPTION_POPUP_SELECTOR)).filter(
    (popup) =>
      isVisible(popup) &&
      !popup.hasAttribute("hidden") &&
      popup.getAttribute("aria-hidden") !== "true" &&
      popup.scrollHeight > popup.clientHeight,
  );

  for (const popup of popups) {
    const originalTop = popup.scrollTop;
    const maxTop = Math.max(0, popup.scrollHeight - popup.clientHeight);
    const step = Math.max(48, (popup.clientHeight || 160) - 32);
    const positions = Array.from(
      new Set([
        0,
        ...Array.from({ length: Math.ceil(maxTop / step) + 1 }, (_, index) => Math.min(maxTop, index * step)),
        maxTop,
      ]),
    );

    for (const position of positions) {
      if (shouldStop?.()) return null;
      popup.scrollTop = position;
      popup.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(180);
      const found = bestLiteralExactOptionForTargets(optionCandidates(doc, ignoredOptions), targets);
      if (found) {
        scrollOptionIntoWorkdayView(found);
        await sleep(160);
        return bestLiteralExactOptionForTargets(optionCandidates(doc, ignoredOptions), targets) ?? found;
      }
    }

    popup.scrollTop = originalTop;
    popup.dispatchEvent(new Event("scroll", { bubbles: true }));
  }

  return null;
}

function bestSameLabelOption(options: HTMLElement[], label: string) {
  const labelKey = normalizeText(label);
  if (!labelKey) return null;
  return options
    .filter((option) => optionLabelKey(option) === labelKey)
    .sort((left, right) => optionVisibleClipRatio(right) - optionVisibleClipRatio(left))[0] ?? null;
}

function optionVisualArea(option: HTMLElement) {
  const rect = elementRect(option);
  return rect ? rectArea(rect) : 0;
}

function bestWorkdayChoiceControl(row: HTMLElement) {
  const controls = Array.from(row.querySelectorAll<HTMLElement>(WORKDAY_CHOICE_CONTROL_SELECTOR));
  if (controls.length === 0) return null;
  const visibleControls = controls
    .map((control, index) => ({
      control,
      index,
      area: optionVisualArea(control),
      ratio: optionVisibleClipRatio(control),
    }))
    .filter((item) => item.area > 0 && item.ratio > SKILL_OPTION_CLIPPED_RATIO)
    .sort((left, right) => right.ratio - left.ratio || right.area - left.area || left.index - right.index);
  return visibleControls[0]?.control ?? controls[0] ?? null;
}

async function activationReadyOption(
  option: HTMLElement,
  doc: Document,
  ignoredOptions: IgnoredOptions,
  targets: string[],
  optionMatcher: (options: HTMLElement[], targets: string[]) => HTMLElement | null,
  shouldStop?: StopCheck,
  preferLiteralExact = false,
) {
  let candidate = option;
  const beforeRatio = optionVisibleClipRatio(candidate);
  if (beforeRatio < SKILL_OPTION_CLICKABLE_RATIO) {
    scrollOptionIntoWorkdayView(candidate);
    await sleep(260);
    if (shouldStop?.()) return candidate;
    candidate = bestSameLabelOption(optionCandidates(doc, ignoredOptions), optionLabel(candidate)) ?? candidate;
  }

  const afterRatio = optionVisibleClipRatio(candidate);
  if (afterRatio <= SKILL_OPTION_CLIPPED_RATIO && !(preferLiteralExact && optionMatchesLiteralTarget(candidate, targets))) {
    const candidateKey = optionLabelKey(candidate);
    const alternative = optionMatcher(
      optionCandidates(doc, ignoredOptions).filter((other) => optionLabelKey(other) !== candidateKey),
      targets,
    );
    if (alternative && optionVisibleClipRatio(alternative) > SKILL_OPTION_CLIPPED_RATIO) {
      wdlog("using visible alternate for clipped option", {
        requested: optionLabel(candidate),
        requestedRatio: afterRatio,
        alternate: optionLabel(alternative),
        alternateRatio: optionVisibleClipRatio(alternative),
      });
      return alternative;
    }
  }

  if (beforeRatio < SKILL_OPTION_CLICKABLE_RATIO || afterRatio < SKILL_OPTION_CLICKABLE_RATIO) {
    wdlog("option visibility", {
      label: optionLabel(candidate),
      beforeRatio,
      afterRatio,
    });
  }
  return candidate;
}

async function waitForMatchingOption(
  doc: Document,
  targets: string[],
  ignoredOptions: IgnoredOptions,
  timeoutMs = OPTION_MATCH_TIMEOUT_MS,
  shouldStop?: StopCheck,
  optionMatcher: (options: HTMLElement[], targets: string[]) => HTMLElement | null = bestMatchingOptionForTargets,
  waitConfig: TypeaheadWaitConfig = {},
) {
  const startedAt = Date.now();
  let settledSince: number | null = null;
  let lastCount = -1;
  const listSettleMs = waitConfig.listSettleMs ?? LIST_SETTLE_MS;
  const noItemsSettleMs = waitConfig.noItemsSettleMs ?? NO_ITEMS_SETTLE_MS;
  while (Date.now() - startedAt <= timeoutMs) {
    if (shouldStop?.()) return null;
    const candidates = optionCandidates(doc, ignoredOptions);
    const option = optionMatcher(candidates, targets);
    if (option) return option;
    // Workday streams results in INCREMENTALLY after Enter (a few rows, then more, then the rest).
    // We must not give up while the list is still growing or the matching row may not have arrived
    // yet — that race is what made matching flaky. Only settle once the list has rendered AND its size
    // has stopped changing for the configured settle window with no match.
    const count = candidates.length;
    const noItemsShown = count === 0 && hasNoItemsNotice(doc, ignoredOptions);
    const listShown = count > 0 || noItemsShown;
    if (listShown && count === lastCount) {
      settledSince ??= Date.now();
      if (Date.now() - settledSince >= (noItemsShown ? noItemsSettleMs : listSettleMs)) return null;
    } else {
      settledSince = null; // empty, loading, or still growing — keep waiting
    }
    lastCount = count;
    await sleep(80);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Degree listbox (a <button> that opens a [role=listbox])
// ---------------------------------------------------------------------------

function degreeTrigger(container: HTMLElement) {
  return container.querySelector<HTMLElement>("button, [role='combobox'], [aria-haspopup='listbox']");
}

function degreeCurrentText(trigger: HTMLElement) {
  return visibleText(
    trigger.getAttribute("aria-valuetext") ||
      trigger.textContent ||
      trigger.getAttribute("aria-label") ||
      trigger.getAttribute("value"),
  );
}

function degreeHasValue(trigger: HTMLElement) {
  return !placeholderText(degreeCurrentText(trigger));
}

function degreeMatches(trigger: HTMLElement, target: string) {
  const current = degreeCurrentText(trigger);
  return !placeholderText(current) && fuzzyScore(current, target) >= OPTION_MATCH_THRESHOLD;
}

function degreeSearchTargets(target: string) {
  const text = normalizeText(target);
  const aliases: string[] = [];
  if (
    /\bb\s*tech\b|\bbtech\b|\bbachelor(?:s|'s)? of technology\b|\bbachelor(?:s|'s)? in technology\b|\bbachelor(?:s|'s)? of engineering\b|\bb\s*e\b|\bbe\b|\bb\s*s\b|\bbs\b|\bb\s*sc\b|\bbsc\b|\bb\s*a\b|\bba\b|\bb\s*com\b|\bbcom\b|\bbca\b|\bbba\b|\bbachelor\b/.test(
      text,
    )
  ) {
    aliases.push("Bachelors degree", "Bachelor's Degree", "Three to Four year University Bachelors degree");
  }
  if (
    /\bm\s*tech\b|\bmtech\b|\bmaster(?:s|'s)? of technology\b|\bmaster(?:s|'s)? in technology\b|\bmaster(?:s|'s)? of engineering\b|\bm\s*e\b|\bme\b|\bm\s*s\b|\bms\b|\bm\s*sc\b|\bmsc\b|\bm\s*a\b|\bma\b|\bm\s*com\b|\bmcom\b|\bmca\b|\bmeng\b|\bmba\b|\bmaster\b/.test(
      text,
    )
  ) {
    aliases.push("Masters degree", "Master's Degree");
  }
  if (/\bphd\b|\bdoctorate\b|\bdoctoral\b|\bdoctor of philosophy\b|\bpsyd\b|\bedd\b|\bjd\b/.test(text)) {
    aliases.push("Doctorate degree");
  }
  if (/\bdiploma\b|\bcertificate\b|\bcertification\b/.test(text)) aliases.push("Certificate");
  if (/\bhigh school\b|\bsecondary\b|\bhigher secondary\b|\bhsc\b|\bssc\b|\b12th\b|\b10th\b/.test(text)) {
    aliases.push("High School");
  }
  return uniqueVisibleTargets([...aliases, target]);
}

function degreeMatchesAny(trigger: HTMLElement, targets: string[]) {
  return targets.some((target) => degreeMatches(trigger, target));
}

async function fillDegree(container: HTMLElement, target: string | null | undefined, shouldStop?: StopCheck) {
  const desired = visibleText(target);
  if (!desired || shouldStop?.()) return false;
  const trigger = degreeTrigger(container);
  if (!trigger || degreeHasValue(trigger)) return false;

  const doc = container.ownerDocument;
  const ignoredOptions = snapshotOptionCandidates(doc);
  const targets = degreeSearchTargets(desired);
  trigger.focus?.();
  activateElement(trigger);
  await sleep(120);
  if (shouldStop?.()) return false;

  // Wait for the listbox to render its options (patiently — same async wait the typeaheads use).
  const option = await waitForMatchingOption(doc, targets, ignoredOptions, OPTION_MATCH_TIMEOUT_MS, shouldStop);
  if (!option) {
    dispatchKey(trigger, "Escape");
    return false;
  }

  activateDropdownOption(option);
  await sleep(180);
  if (shouldStop?.()) return degreeMatchesAny(trigger, targets);
  // If the click didn't commit, confirm the focused option with Enter.
  if (!degreeMatchesAny(trigger, targets)) {
    dispatchKey(option, "Enter");
    dispatchKey(trigger, "Enter");
    await sleep(120);
  }
  dispatchKey(trigger, "Escape");
  return degreeMatchesAny(trigger, targets);
}

// ---------------------------------------------------------------------------
// Multi-select typeahead (field of study, skills, sometimes school)
// ---------------------------------------------------------------------------

function multiSelectRoot(container: HTMLElement) {
  return container.querySelector<HTMLElement>(MULTISELECT_CONTAINER) ?? container;
}

function multiSelectInput(container: HTMLElement) {
  return (
    container.querySelector<HTMLInputElement>(MULTISELECT_INPUT) ??
    container.querySelector<HTMLInputElement>("input:not([type='hidden'])")
  );
}

function selectedChipTexts(container: HTMLElement) {
  const explicit = selectedChipElements(container)
    .map(chipLabel)
    .filter(Boolean);
  if (explicit.length > 0) return Array.from(new Set(explicit));

  const root = multiSelectRoot(container);
  const clone = root.cloneNode(true) as HTMLElement;
  for (const node of Array.from(
    clone.querySelectorAll(
      "input, textarea, [role='listbox']:not([data-automation-id='selectedItemList']), [role='option']:not([data-automation-id='selectedItem']), [data-automation-id='multiselectInputContainer']",
    ),
  )) {
    node.remove();
  }
  const text = cleanChipLabel(clone.textContent || "");
  return text ? [text] : [];
}

function cleanChipLabel(value: string | null | undefined) {
  return visibleText(value)
    .replace(/\bnot\s+checked\b/gi, " ")
    .replace(/\bchecked\b/gi, " ")
    .replace(/\s*,?\s*press\s+(?:delete|backspace).*$/i, " ")
    .replace(/\b(?:remove|delete|clear)\b/gi, " ")
    .replace(/^[×x]\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chipLabel(element: HTMLElement) {
  const selectedList = element.closest<HTMLElement>("[data-automation-id='selectedItemList'], [aria-label*='items selected' i]");
  const prompt = selectedList?.contains(element)
    ? element.querySelector<HTMLElement>("[data-automation-id='promptOption'], [data-automation-label], [title]")
    : null;
  return cleanChipLabel(
    prompt?.getAttribute("data-automation-label") ||
      prompt?.getAttribute("title") ||
      prompt?.textContent ||
      element.getAttribute("data-automation-label") ||
      element.getAttribute("title") ||
      element.getAttribute("aria-label") ||
      element.textContent,
  );
}

function selectedChipElements(container: HTMLElement) {
  const root = multiSelectRoot(container);
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        "[data-automation-id='selectedItemList'] [data-automation-id='selectedItem']",
        "[data-automation-id='selectedItemList'] [data-automation-id='menuItem']",
        "[data-automation-id='selectedItemList'] [data-automation-id='promptOption']",
        "[aria-label*='press delete to clear value' i]",
        "[data-automation-id*='selected' i]",
        "[data-automation-id*='chip' i]",
        "[data-automation-id*='pill' i]",
        "[class*='chip' i]",
        "[class*='pill' i]",
        "[role='listitem']",
      ].join(","),
    ),
  )
    .filter((element) => {
      if (element.querySelector("input, textarea")) return false;
      const selectedList = element.closest<HTMLElement>("[data-automation-id='selectedItemList'], [aria-label*='items selected' i]");
      if (selectedList && root.contains(selectedList)) return true;
      return !element.closest("[role='listbox'], [role='menu']");
    });
}

function removeUnexpectedNewChips(container: HTMLElement, before: ReadonlySet<string>, targets: string[]) {
  let removed = false;
  for (const chip of selectedChipElements(container)) {
    const text = chipLabel(chip);
    if (!text || before.has(text) || targets.some((target) => chipTextMatchesTarget(text, target))) continue;
    const remover = chip.querySelector<HTMLElement>(
      "button, [role='button'], [aria-label*='remove' i], [aria-label*='delete' i], [aria-label*='clear' i], [data-automation-id*='delete' i], [data-automation-id*='remove' i]",
    );
    if (remover) {
      activateElement(remover);
    } else {
      chip.remove();
    }
    removed = true;
  }
  return removed;
}

function hasAnyChip(container: HTMLElement) {
  return selectedChipTexts(container).length > 0;
}

function chipTextMatchesTarget(text: string, target: string) {
  const chip = normalizeText(stripParentheticals(text));
  const desired = normalizeText(stripParentheticals(target));
  if (!chip || !desired) return false;
  if (chip === desired) return true;
  if (parentheticalMatchesTarget(text, desired)) return true;
  if (chip.includes(desired) || desired.includes(chip)) return true;
  return fuzzyScore(chip, desired) >= 0.86;
}

function chipMatches(container: HTMLElement, target: string) {
  return selectedChipTexts(container).some((text) => chipTextMatchesTarget(text, target));
}

function chipMatchesAny(container: HTMLElement, targets: string[]) {
  return targets.some((target) => chipMatches(container, target));
}

async function waitForChipMatch(container: HTMLElement, targets: string[], timeoutMs: number, shouldStop?: StopCheck) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (shouldStop?.()) return false;
    if (chipMatchesAny(container, targets)) return true;
    await sleep(100);
  }
  return chipMatchesAny(container, targets);
}

function uniqueVisibleTargets(values: string[]) {
  return Array.from(new Set(values.map(visibleText).filter(Boolean)));
}

function likelySkillText(skill: string) {
  const text = normalizeText(skill);
  if (!text || text.length < 2 || skill.length > 64) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  if (/[.!?;:]/.test(skill)) return false;
  if (
    words.length >= 4 &&
    /\b(?:built|created|defined|delivered|designed|developed|implemented|improved|increased|led|managed|owned|reduced|used|worked)\b/.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

function skillCandidates(skills: string[]) {
  return uniqueVisibleTargets(skills).filter(likelySkillText).slice(0, SKILLS_MAX_SEARCHES);
}

function skillSearchTargets(target: string) {
  const text = normalizeText(target);
  const aliases: string[] = [];
  if (text === "prd" || text === "prds") {
    aliases.push("PRDs", "PRD", "Product Requirements Documents", "Product Requirement Documents");
  }
  return uniqueVisibleTargets([target, ...aliases]);
}

function fieldOfStudySearchTargets(target: string) {
  const text = normalizeText(target);
  const aliases: string[] = [];

  if (
    /\bece\b/.test(text) ||
    /\belectronics?\b.*\bcommunication\b/.test(text) ||
    /\bcommunication\b.*\belectronics?\b/.test(text)
  ) {
    aliases.push("Electronics Engineering", "Electrical Engineering");
  }
  if (/\bdata science\b|\bdata analytics?\b|\bmachine learning\b|\bartificial intelligence\b|\bai\b/.test(text)) {
    aliases.push("Computer and Information Science");
  }
  if (
    /\bit\b|\binformation science\b|\binformation technology\b|\binformation systems?\b|\bcomputer applications?\b|\bbca\b|\bmca\b/.test(
      text,
    )
  ) {
    aliases.push("Computer and Information Science");
  }
  if (/\bcomputer science\b|\bcomp sci\b|\bcs\b/.test(text)) {
    aliases.push("Computer and Information Science");
  }
  if (/\bcse\b|\bcomputer science engineering\b|\bcomputer science and engineering\b/.test(text)) {
    aliases.push("Computer and Information Science", "Computer Engineering");
  }
  if (/\bee\b|\belectrical and electronics\b|\belectrical electronics\b/.test(text)) {
    aliases.push("Electrical Engineering");
  }
  if (/\baeronautical\b/.test(text)) aliases.push("Aerospace Engineering");
  if (/\bautomobile\b/.test(text)) aliases.push("Automotive Engineering");
  if (/\bbiotech(?:nology)?\b|\bbiological engineering\b|\bbioengineering\b/.test(text)) {
    aliases.push("Agricultural/Biological Engineering and Bioengineering");
  }
  if (/\benvironmental health\b|\benvironmental engineering\b/.test(text)) {
    aliases.push("Environmental/Environmental Health Engineering");
  }

  return uniqueVisibleTargets([...aliases, target]);
}

function workdayPromptParts(option: HTMLElement) {
  // The matched element is the inner label ([data-automation-id=promptOption]); clicking it does NOT
  // select — Workday's selection handler is on the whole option ROW (the virtualized [role=option] /
  // [id^=menuItem] ancestor that also holds the checkbox). Click the row.
  const row = option.closest<HTMLElement>(WORKDAY_PROMPT_ROW_SELECTOR) ?? option;
  const checkbox = bestWorkdayChoiceControl(row);
  return { row, checkbox };
}

function choiceState(element: HTMLElement | null) {
  if (!element) return null;
  const inputChecked =
    element instanceof HTMLInputElement && /^(checkbox|radio)$/i.test(element.type)
      ? element.checked === true || element.hasAttribute("checked")
      : undefined;
  return {
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role"),
    aid: element.getAttribute("data-automation-id"),
    checked: inputChecked,
    ariaChecked: element.getAttribute("aria-checked"),
    ariaSelected: element.getAttribute("aria-selected"),
    dataSelected: element.getAttribute("data-automation-selected") || element.getAttribute("data-selected"),
    visibleRatio: optionVisibleClipRatio(element),
    area: optionVisualArea(element),
  };
}

function activateWorkdayPromptOption(option: HTMLElement, mode: "row" | "control" | "option" = "row") {
  const { row, checkbox } = workdayPromptParts(option);
  wdlog("activate row", {
    rowId: row.id,
    rowRole: row.getAttribute("role"),
    rowAid: row.getAttribute("data-automation-id"),
    hasCheckbox: Boolean(checkbox),
    mode,
    rowState: choiceState(row),
    checkboxState: choiceState(checkbox),
    rowHtml: row.outerHTML.replace(/\s+/g, " ").slice(0, 700),
  });
  const target = mode === "control" ? (checkbox ?? option) : mode === "option" ? option : row;
  if (mode === "control") {
    activateChoiceControl(target);
    return;
  }
  activateDropdownOption(target);
}

function activateChoiceControl(target: HTMLElement) {
  target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  target.focus?.();
  if (target instanceof HTMLInputElement && /^(checkbox|radio)$/i.test(target.type)) {
    try {
      target.click();
    } catch {
      activateElement(target);
    }
    if (!target.checked) setNativeChecked(target, true);
    dispatchInputChange(target);
    dispatchTypeaheadKey(target, " ");
    dispatchTypeaheadKey(target, "Enter");
    return;
  }

  if (target.getAttribute("role") === "checkbox" || target.getAttribute("role") === "radio") {
    target.setAttribute("aria-checked", "true");
    activateElement(target);
    dispatchInputChange(target);
    dispatchTypeaheadKey(target, " ");
    dispatchTypeaheadKey(target, "Enter");
    return;
  }

  activateDropdownOption(target);
  dispatchTypeaheadKey(target, " ");
  dispatchTypeaheadKey(target, "Enter");
}

async function blurTypeaheadForCommit(container: HTMLElement, input: HTMLInputElement, targets: string[], timeoutMs: number, shouldStop?: StopCheck) {
  dispatchTypeaheadKey(input, "Tab");
  dispatchInputChange(input);
  input.blur?.();
  await waitForChipMatch(container, targets, Math.min(2200, timeoutMs), shouldStop);
  return chipMatchesAny(container, targets);
}

async function fillTypeaheadValue(
  container: HTMLElement,
  target: string | null | undefined,
  options: {
    skipIfAnyExistingChip?: boolean;
    searchTargets?: (target: string) => string[];
    shouldStop?: StopCheck;
    initialOptionWaitMs?: number;
    optionMatchTimeoutMs?: number;
    optionMatcher?: (options: HTMLElement[], targets: string[]) => HTMLElement | null;
    listSettleMs?: number;
    noItemsSettleMs?: number;
    chipCommitWaitMs?: number;
    preferLiteralExact?: boolean;
    exhaustLiteralExactBeforeFuzzy?: boolean;
  } = {},
) {
  const desired = visibleText(target);
  if (!desired || options.shouldStop?.() || chipMatches(container, desired)) return false;
  if (options.skipIfAnyExistingChip && hasAnyChip(container)) return false;
  const input = multiSelectInput(container);
  if (!input) return false;

  const doc = container.ownerDocument;
  const ignoredOptions = snapshotOptionCandidates(doc);
  input.focus?.();
  activateElement(input);
  const searchTargets = uniqueVisibleTargets(options.searchTargets?.(desired) ?? [desired]);
  const initialChips = new Set(selectedChipTexts(container));

  wdlog("typeahead start", { desired, searchTargets, ignored: ignoredOptions.size });

  for (const searchValue of searchTargets) {
    if (options.shouldStop?.()) break;
    rememberVisibleOptions(doc, ignoredOptions);
    setTypeaheadText(input, searchValue);
    await sleep(220);
    if (options.shouldStop?.()) break;

    let option = await waitForMatchingOption(
      doc,
      searchTargets,
      ignoredOptions,
      options.initialOptionWaitMs ?? TYPEAHEAD_INITIAL_OPTION_WAIT_MS,
      options.shouldStop,
      options.optionMatcher,
      { listSettleMs: options.listSettleMs, noItemsSettleMs: options.noItemsSettleMs },
    );
    wdlog("phase1", searchValue, "matched:", option ? optionLabel(option) : null, describeOptions(doc, ignoredOptions));
    if (options.exhaustLiteralExactBeforeFuzzy && option && !optionMatchesLiteralTarget(option, searchTargets)) {
      option = null;
    }
    if (!option) {
      // Press Enter to kick off Workday's async search, then wait patiently for the result rows to
      // render (the "wait a second after Enter" step). We do NOT bail early just because some rows are
      // already showing — on the 2nd+ skill those are the previous search's stale/partial results,
      // and bailing there is exactly what made it "skip right past" most skills.
      dispatchTypeaheadKey(input, "Enter");
      await sleep(260);
      if (removeUnexpectedNewChips(container, initialChips, searchTargets)) continue;
      option = await waitForMatchingOption(
        doc,
        searchTargets,
        ignoredOptions,
        options.optionMatchTimeoutMs ?? OPTION_MATCH_TIMEOUT_MS,
        options.shouldStop,
        options.optionMatcher,
        { listSettleMs: options.listSettleMs, noItemsSettleMs: options.noItemsSettleMs },
      );
      if (options.exhaustLiteralExactBeforeFuzzy) {
        option = (await scanForLiteralExactOption(doc, ignoredOptions, searchTargets, options.shouldStop)) ?? option;
      }
      const matcherNow = (options.optionMatcher ?? bestMatchingOptionForTargets)(
        optionCandidates(doc, ignoredOptions),
        searchTargets,
      );
      wdlog(
        "after Enter+wait",
        searchValue,
        "matched:",
        option ? optionLabel(option) : null,
        "wouldMatchNow:",
        matcherNow ? optionLabel(matcherNow) : null,
        describeOptions(doc, ignoredOptions),
      );
    }
    if (!option) continue;

    const chipCommitWaitMs = options.chipCommitWaitMs ?? TYPEAHEAD_CHIP_COMMIT_WAIT_MS;
    const rowCommitWaitMs = Math.min(1200, chipCommitWaitMs);
    const optionMatcher = options.optionMatcher ?? bestMatchingOptionForTargets;
    const attemptedOptions = new Set<HTMLElement>();
    const attemptedSignatures = new Set<string>();
    const attemptedLabels = new Set<string>();

    while (option && attemptedOptions.size < 4) {
      const requestedOption = option;
      option = await activationReadyOption(
        option,
        doc,
        ignoredOptions,
        searchTargets,
        optionMatcher,
        options.shouldStop,
        options.preferLiteralExact,
      );
      const activatedLiteralExact = Boolean(options.preferLiteralExact && optionMatchesLiteralTarget(option, searchTargets));
      attemptedOptions.add(requestedOption);
      attemptedOptions.add(option);
      attemptedSignatures.add(optionSignature(requestedOption));
      attemptedSignatures.add(optionSignature(option));
      attemptedLabels.add(optionLabelKey(requestedOption));
      attemptedLabels.add(optionLabelKey(option));

      wdlog("activating option", optionLabel(option), { visibleRatio: optionVisibleClipRatio(option) });
      activateWorkdayPromptOption(option);
      await waitForChipMatch(container, searchTargets, rowCommitWaitMs, options.shouldStop);
      const removedUnexpectedAfterActivate = removeUnexpectedNewChips(container, initialChips, searchTargets);
      if (removedUnexpectedAfterActivate) {
        wdlog("removed unexpected chip after activate", searchValue);
      }
      if (options.shouldStop?.()) break;
      wdlog(
        "post-activate",
        searchValue,
        "chipMatch:",
        chipMatchesAny(container, searchTargets),
        "chips:",
        selectedChipTexts(container),
        "rootHtml:",
        multiSelectRoot(container).outerHTML.replace(/\s+/g, " ").slice(0, 700),
      );
      // If the click didn't register a chip, confirm the selection with Enter.
      if (!removedUnexpectedAfterActivate && !chipMatchesAny(container, searchTargets)) {
        activateWorkdayPromptOption(option, "control");
        await waitForChipMatch(container, searchTargets, chipCommitWaitMs, options.shouldStop);
        wdlog(
          "post-control-fallback",
          searchValue,
          "chipMatch:",
          chipMatchesAny(container, searchTargets),
          "chips:",
          selectedChipTexts(container),
        );
      }
      if (!removedUnexpectedAfterActivate && !chipMatchesAny(container, searchTargets)) {
        activateWorkdayPromptOption(option, "option");
        dispatchTypeaheadKey(option, "Enter");
        dispatchTypeaheadKey(input, "Enter");
        await waitForChipMatch(container, searchTargets, chipCommitWaitMs, options.shouldStop);
        wdlog("post-enter-fallback", searchValue, "chipMatch:", chipMatchesAny(container, searchTargets), "chips:", selectedChipTexts(container));
      }
      if (!removedUnexpectedAfterActivate && !chipMatchesAny(container, searchTargets)) {
        await blurTypeaheadForCommit(container, input, searchTargets, chipCommitWaitMs, options.shouldStop);
        removeUnexpectedNewChips(container, initialChips, searchTargets);
        wdlog("post-blur-fallback", searchValue, "chipMatch:", chipMatchesAny(container, searchTargets), "chips:", selectedChipTexts(container));
      }
      if (chipMatchesAny(container, searchTargets)) {
        dispatchTypeaheadKey(input, "Escape");
        wdlog("SELECTED", searchValue, "->", selectedChipTexts(container));
        return true;
      }
      if (activatedLiteralExact) {
        wdlog("literal exact option did not commit; not retrying synonym", {
          requested: searchValue,
          option: optionLabel(option),
        });
        break;
      }

      option = optionMatcher(
        optionCandidates(doc, ignoredOptions).filter(
          (candidate) =>
            !attemptedOptions.has(candidate) &&
            !attemptedSignatures.has(optionSignature(candidate)) &&
            !attemptedLabels.has(optionLabelKey(candidate)),
        ),
        searchTargets,
      );
      if (option) wdlog("retrying alternate option", optionLabel(option));
    }
  }

  removeUnexpectedNewChips(container, initialChips, searchTargets);
  dispatchTypeaheadKey(input, "Escape");
  removeUnexpectedNewChips(container, initialChips, searchTargets);
  wdlog("FAILED to select", desired, "chips:", selectedChipTexts(container));
  return false;
}

// Close any open dropdown and clear leftover query text so the next skill starts from a clean slate
// (otherwise the prior skill's still-open result list bleeds into this search).
async function resetTypeahead(container: HTMLElement, shouldStop?: StopCheck) {
  const input = multiSelectInput(container);
  if (!input) return;
  const hadText = visibleText(input.value).length > 0;
  input.focus?.();
  if (hadText) setTypeaheadText(input, "");
  dispatchTypeaheadKey(input, "Escape");
  if (shouldStop?.() || !hadText) return; // nothing was lingering — no need to wait for it to clear
  await sleep(200);
}

async function fillSkills(root: HTMLElement, context: FillContext) {
  const skills = skillCandidates(context.profile.skills);
  const container = root.querySelector<HTMLElement>("[data-automation-id='formField-skills']");
  if (!container) return;
  if (hasAnyChip(container)) {
    emitWorkdayProgress(context, {
      label: "Skills",
      canonicalKey: "skills",
      status: "skipped",
      error: "Already filled.",
      valuePreview: selectedChipTexts(container).join(", "),
    });
    return;
  }

  wdlog("=== fillSkills ===", "candidates:", skills, "cap:", SKILLS_MAX_SELECTED);
  let misses = 0;
  for (const skill of skills) {
    if (context.shouldStop?.()) {
      wdlog("STOP requested — breaking skills loop at", skill);
      break;
    }
    if (selectedChipTexts(container).length >= SKILLS_MAX_SELECTED) {
      wdlog("hit SKILLS_MAX_SELECTED — stopping");
      break;
    }
    if (chipMatches(container, skill)) {
      misses = 0;
      continue;
    }
    wdlog("--- skill:", skill, "selectedSoFar:", selectedChipTexts(container));
    await resetTypeahead(container, context.shouldStop);
    const filled = await fillTypeaheadValue(container, skill, {
      shouldStop: context.shouldStop,
      searchTargets: skillSearchTargets,
      initialOptionWaitMs: SKILLS_INITIAL_OPTION_WAIT_MS,
      optionMatchTimeoutMs: SKILLS_OPTION_MATCH_TIMEOUT_MS,
      optionMatcher: bestMatchingSkillOption,
      listSettleMs: SKILLS_LIST_SETTLE_MS,
      noItemsSettleMs: SKILLS_NO_ITEMS_SETTLE_MS,
      chipCommitWaitMs: SKILLS_CHIP_COMMIT_WAIT_MS,
      preferLiteralExact: true,
      exhaustLiteralExactBeforeFuzzy: true,
    });
    misses = filled ? 0 : misses + 1;
    wdlog("skill result:", skill, "filled:", filled, "misses:", misses, "chips:", selectedChipTexts(container));
    if (misses >= SKILLS_MAX_MISSES_AFTER_SELECTION && selectedChipTexts(container).length > 0) {
      wdlog("hit SKILLS_MAX_MISSES_AFTER_SELECTION — stopping after successful selections");
      break;
    }
  }
  wdlog("=== fillSkills done ===", "final chips:", selectedChipTexts(container));

  if (skills.length > 0) {
    const selected = selectedChipTexts(container);
    emitWorkdayProgress(context, {
      label: "Skills",
      canonicalKey: "skills",
      status: selected.length > 0 ? "filled" : context.shouldStop?.() ? "skipped" : "needs_user",
      error: selected.length > 0 ? undefined : context.shouldStop?.() ? "Stopped." : "No matching option.",
      valuePreview: selected.join(", "),
    });
  }
}

// ---------------------------------------------------------------------------
// Plain controls: text / textarea, checkbox, segmented date
// ---------------------------------------------------------------------------

function fillTextWrapper(
  row: HTMLElement,
  selector: string,
  value: string | null | undefined,
  options: { commitExisting?: boolean } = {},
) {
  const desired = (value ?? "").trim(); // preserve internal newlines (multi-line role descriptions)
  if (!desired) return;
  const wrapper = row.querySelector<HTMLElement>(selector);
  const input =
    wrapper?.querySelector<HTMLElement>("input:not([type='hidden']), textarea, [contenteditable='true'], [role='textbox']");
  if (!input) return;
  const existing = visibleText(
    (input as HTMLInputElement | HTMLTextAreaElement).value ?? input.textContent,
  );
  if (existing) {
    if (options.commitExisting) commitWorkdayField(input, wrapper, existing);
    return;
  }
  setWorkdayText(input, desired, wrapper);
}

function isBoxChecked(box: HTMLElement) {
  if (box instanceof HTMLInputElement && typeof box.checked === "boolean") return box.checked;
  return box.getAttribute("aria-checked") === "true" || box.hasAttribute("checked");
}

function setCheckbox(row: HTMLElement, selector: string, desired: boolean) {
  if (!desired) return;
  const wrapper = row.querySelector<HTMLElement>(selector);
  const box = wrapper?.querySelector<HTMLElement>("input[type='checkbox'], [role='checkbox']");
  if (!box || isBoxChecked(box)) return;
  activateElement(box);
  if (box.getAttribute("role") === "checkbox") box.setAttribute("aria-checked", "true");
}

interface ParsedDate {
  month: number | null;
  year: number | null;
}

function clampMonth(value: number): number | null {
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

function parseProfileDate(value: string | null | undefined): ParsedDate {
  const text = visibleText(value);
  const year = text.match(/(?:19|20)\d{2}/)?.[0] ?? null;
  if (!text || /present|current|now|ongoing/i.test(text)) {
    return { month: null, year: year ? Number(year) : null };
  }
  let month: number | null = null;
  const iso = text.match(/(?:19|20)\d{2}[-/](\d{1,2})/); // YYYY-MM
  const numericLead = text.match(/^(\d{1,2})[-/]/); // MM/YYYY
  if (iso) month = clampMonth(Number(iso[1]));
  else if (numericLead) month = clampMonth(Number(numericLead[1]));
  else {
    const name = text.toLowerCase().match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/);
    if (name) month = MONTH_NAMES.indexOf(name[0]) + 1;
  }
  return { month, year: year ? Number(year) : null };
}

function dateInput(wrapper: HTMLElement, idSelector: string, labelHint: RegExp) {
  return (
    wrapper.querySelector<HTMLInputElement>(idSelector) ??
    Array.from(wrapper.querySelectorAll<HTMLInputElement>("input")).find((input) =>
      labelHint.test(input.getAttribute("aria-label") ?? ""),
    ) ??
    null
  );
}

function setDate(
  row: HTMLElement,
  selector: string,
  parsed: ParsedDate,
  options: { yearOnly?: boolean; commitExisting?: boolean } = {},
) {
  const wrapper = row.querySelector<HTMLElement>(selector);
  if (!wrapper || (parsed.month == null && parsed.year == null)) return;

  const yearField =
    dateInput(wrapper, "[data-automation-id='dateSectionYear-input']", /year/i) ??
    wrapper.querySelector<HTMLInputElement>("input:not([type='hidden'])");
  const monthField = dateInput(wrapper, "[data-automation-id='dateSectionMonth-input']", /month/i);
  let committed = false;

  if (!options.yearOnly && monthField && parsed.month != null) {
    const month = String(parsed.month).padStart(2, "0");
    if (visibleText(monthField.value)) {
      if (options.commitExisting) {
        commitWorkdayField(monthField, wrapper, monthField.value);
        committed = true;
      }
    } else {
      setWorkdayText(monthField, month, wrapper);
      committed = true;
    }
  }
  if (yearField && parsed.year != null) {
    const year = String(parsed.year);
    if (visibleText(yearField.value)) {
      if (options.commitExisting) {
        commitWorkdayField(yearField, wrapper, yearField.value);
        committed = true;
      }
    } else {
      setWorkdayText(yearField, year, wrapper);
      committed = true;
    }
  }
  const committedValue = [
    !options.yearOnly ? visibleText(monthField?.value) : "",
    visibleText(yearField?.value),
  ].filter(Boolean).join("/");
  if (committed && committedValue) {
    wrapper.dispatchEvent(new Event("input", { bubbles: true }));
    wrapper.dispatchEvent(new Event("change", { bubbles: true }));
    dispatchFocusLike(wrapper, "focusout");
    dispatchFocusLike(wrapper, "blur");
  }
}

function profileLocationText(location: MasterProfileLocation) {
  const parts = [location.city, location.state, location.country].map(visibleText).filter(Boolean);
  return Array.from(new Set(parts)).join(", ");
}

function nonLocationPart(part: string) {
  if (NON_LOCATION_FRAGMENTS.has(part)) return true;
  const words = part.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => NON_LOCATION_FRAGMENTS.has(word));
}

function suspiciousExperienceLocation(value: string) {
  const text = visibleText(value);
  if (!text) return false;
  if (text.length > 80 || /[.!?;]/.test(text)) return true;
  const normalized = normalizeText(text);
  const parts = normalized.split(/[,/|]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && parts.every(nonLocationPart)) return true;
  return /\bplatform\b/.test(normalized) && /\btier\b/.test(normalized);
}

function workExperienceLocation(experience: MasterProfileExperience, fallbackLocation: MasterProfileLocation) {
  const raw = visibleText(experience.location);
  if (raw && !suspiciousExperienceLocation(raw)) return raw;
  const fallback = profileLocationText(fallbackLocation);
  if (raw) wdlog("skipping suspicious work location", { raw, fallback });
  return fallback;
}

// ---------------------------------------------------------------------------
// Repeater rows (Work Experience, Education)
// ---------------------------------------------------------------------------

function headingPosition(root: HTMLElement, pattern: RegExp) {
  const order = Array.from(root.querySelectorAll<HTMLElement>("*"));
  const headings = order.filter((element) => element.matches?.(HEADING_SELECTOR));
  const start = headings.find((heading) => pattern.test(visibleText(heading.textContent)));
  if (!start) return null;
  const startIndex = order.indexOf(start);
  // The section ends at the next heading that belongs to a DIFFERENT section. Workday repeats a
  // numbered sub-heading per entry ("Work Experience 1", "Work Experience 2"), which also match the
  // section pattern — treating one of those as the boundary collapses the range to empty and hides
  // the section's "Add Another" button (so the 2nd job/school never gets added). Skip them.
  const nextHeadingIndex = headings
    .map((heading) => order.indexOf(heading))
    .filter((index) => index > startIndex && !pattern.test(visibleText(order[index].textContent)))
    .sort((a, b) => a - b)[0];
  return { order, startIndex, endIndex: nextHeadingIndex ?? order.length };
}

function selectorMatchesSelfOrDescendant(element: HTMLElement, selector: string) {
  return element.matches(selector) || Boolean(element.querySelector(selector));
}

function selectorMatchCount(element: HTMLElement, selector: string) {
  return (element.matches(selector) ? 1 : 0) + element.querySelectorAll(selector).length;
}

function repeaterFieldCount(element: HTMLElement, allSelectors: readonly string[]) {
  return allSelectors.filter((selector) => selectorMatchesSelfOrDescendant(element, selector)).length;
}

// Walk up from a required field (job title / school) to the element that wraps the whole repeater
// entry: the nearest ancestor that still holds exactly one required field but two or more of the
// section's fields. This copes with rows that have no [role='group'] wrapper, rows whose fields are
// split across nested sub-groups, and rows where role='group' sits on the individual field wrappers.
function rowForField(field: HTMLElement, root: HTMLElement, requiredSelector: string, allSelectors: readonly string[]) {
  let best: HTMLElement | null = null;
  for (let node: HTMLElement | null = field; node && node !== root && node !== field.ownerDocument.body; node = node.parentElement) {
    const requiredCount = selectorMatchCount(node, requiredSelector);
    if (requiredCount > 1) break;
    if (requiredCount === 1 && repeaterFieldCount(node, allSelectors) >= 2) best = node;
  }
  return best ?? field.parentElement ?? field;
}

// Detect rows directly from their required field rather than by scanning between section headings:
// real Workday gives every entry its own numbered sub-heading ("Education 1", "Education 2"), which
// collapsed the "between this heading and the next" range to empty and made us miss every row — so
// nothing got filled and the empty-looking section got an extra "Add Another" row tacked on. The
// required selector (job title vs. school) is already section-specific, so heading scoping was
// redundant anyway.
function rowsBySectionFields(root: HTMLElement, requiredSelector: string, allSelectors: readonly string[]) {
  const fields = Array.from(root.querySelectorAll<HTMLElement>(requiredSelector));
  return uniqueElements(fields.map((field) => rowForField(field, root, requiredSelector, allSelectors)));
}

function experienceRows(root: HTMLElement) {
  return rowsBySectionFields(root, EXPERIENCE_FIELDS.jobTitle, [
    EXPERIENCE_FIELDS.jobTitle,
    EXPERIENCE_FIELDS.company,
    EXPERIENCE_FIELDS.location,
    EXPERIENCE_FIELDS.current,
    EXPERIENCE_FIELDS.startDate,
    EXPERIENCE_FIELDS.endDate,
    EXPERIENCE_FIELDS.description,
  ]);
}

function educationRows(root: HTMLElement) {
  return rowsBySectionFields(root, EDUCATION_FIELDS.school, [
    EDUCATION_FIELDS.school,
    EDUCATION_FIELDS.degree,
    EDUCATION_FIELDS.field,
    EDUCATION_FIELDS.gpa,
    EDUCATION_FIELDS.startYear,
    EDUCATION_FIELDS.endYear,
  ]);
}

function languageRows(root: HTMLElement) {
  return rowsBySectionFields(root, LANGUAGE_FIELDS.language, [
    LANGUAGE_FIELDS.language,
    LANGUAGE_FIELDS.proficiency,
  ]);
}

/** The Add / Add Another button belonging to the section whose heading matches `pattern`. */
function sectionAddButton(root: HTMLElement, pattern: RegExp) {
  const located = headingPosition(root, pattern);
  if (!located) return null;
  const { order, startIndex, endIndex } = located;
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const element = order[index];
    if (isSectionAddButton(element) && isVisible(element)) return element;
  }
  return null;
}

function isSectionAddButton(element: HTMLElement) {
  if (element.matches?.(ADD_ROW_BUTTON)) return true;
  if (!element.matches?.("button, [role='button'], input[type='button'], input[type='submit']")) return false;
  const text = visibleText(
    (element as HTMLInputElement).value ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent,
  );
  return /^(?:\+?\s*)?add(?:\s+another)?$/i.test(text);
}

async function ensureRows(
  rowsAccessor: () => HTMLElement[],
  addButtonAccessor: () => HTMLElement | null,
  desiredCount: number,
  shouldStop?: StopCheck,
) {
  let rows = rowsAccessor();
  let attempts = 0;
  const maxAttempts = Math.min(MAX_REPEATER_ROWS + 2, desiredCount + 2);
  while (rows.length < desiredCount && attempts < maxAttempts) {
    if (shouldStop?.()) break;
    const addButton = addButtonAccessor();
    if (!addButton) break;
    const before = rows.length;
    addButton.scrollIntoView?.({ block: "center", inline: "nearest" });
    activateElement(addButton);
    let grew = await waitForRowCount(rowsAccessor, before + 1, 2800, shouldStop);
    if (!grew) {
      addButton.click?.();
      grew = await waitForRowCount(rowsAccessor, before + 1, REPEATER_ROW_WAIT_MS, shouldStop);
    }
    rows = rowsAccessor();
    attempts += 1;
    wdlog("ensureRows add attempt", {
      desiredCount,
      before,
      after: rows.length,
      grew,
      buttonText: visibleText(addButton.textContent || addButton.getAttribute("aria-label")),
      disabled: addButton.getAttribute("aria-disabled") || (addButton as HTMLButtonElement).disabled || null,
    });
    if (!grew) await sleep(500);
  }
  return rows;
}

async function waitForRowCount(rowsAccessor: () => HTMLElement[], target: number, timeoutMs = 1200, shouldStop?: StopCheck) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (shouldStop?.()) return false;
    if (rowsAccessor().length >= target) return true;
    await sleep(100);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Section fillers
// ---------------------------------------------------------------------------

async function fillExperienceRow(
  row: HTMLElement,
  experience: MasterProfileExperience,
  fallbackLocation: MasterProfileLocation,
) {
  const workFieldOptions = { commitExisting: true };
  fillTextWrapper(row, EXPERIENCE_FIELDS.jobTitle, experience.title, workFieldOptions);
  fillTextWrapper(row, EXPERIENCE_FIELDS.company, experience.company, workFieldOptions);
  fillTextWrapper(row, EXPERIENCE_FIELDS.location, workExperienceLocation(experience, fallbackLocation), workFieldOptions);
  setCheckbox(row, EXPERIENCE_FIELDS.current, Boolean(experience.current));
  setDate(row, EXPERIENCE_FIELDS.startDate, parseProfileDate(experience.startDate), workFieldOptions);
  if (!experience.current) {
    setDate(row, EXPERIENCE_FIELDS.endDate, parseProfileDate(experience.endDate), workFieldOptions);
  }
  if (experience.bullets.length > 0) {
    fillTextWrapper(row, EXPERIENCE_FIELDS.description, experience.bullets.join("\n"), workFieldOptions);
  }
}

async function fillWorkExperienceSection(root: HTMLElement, context: FillContext) {
  const experiences = context.profile.experience.slice(0, MAX_REPEATER_ROWS);
  if (experiences.length === 0) return;

  wdlog("work experience rows", {
    desired: experiences.length,
    existing: experienceRows(root).length,
    titles: experiences.map((item) => item.title).filter(Boolean),
  });

  let rows = await ensureRows(
    () => experienceRows(root),
    () => sectionAddButton(root, /work experience|employment/i),
    1,
    context.shouldStop,
  );

  for (let index = 0; index < experiences.length; index += 1) {
    if (context.shouldStop?.()) break;
    rows = experienceRows(root);
    if (rows.length <= index) {
      rows = await ensureRows(
        () => experienceRows(root),
        () => sectionAddButton(root, /work experience|employment/i),
        index + 1,
        context.shouldStop,
      );
    }
    const row = rows[index];
    if (!row) break;
    await fillExperienceRow(row, experiences[index], context.profile.location);
    await sleep(500);
    if (index + 1 < experiences.length && experienceRows(root).length <= index + 1) {
      wdlog("adding next work experience row", { nextIndex: index + 2, currentRows: experienceRows(root).length });
      await ensureRows(
        () => experienceRows(root),
        () => sectionAddButton(root, /work experience|employment/i),
        index + 2,
        context.shouldStop,
      );
    }
  }
}

function rowSchoolValue(row: HTMLElement) {
  const input = row.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `${EDUCATION_FIELDS.school} input, ${EDUCATION_FIELDS.school} textarea`,
  );
  return visibleText(input?.value);
}

function isTypeaheadWrapper(wrapper: HTMLElement) {
  return Boolean(
    wrapper.querySelector(
      `${MULTISELECT_CONTAINER}, [data-automation-id='multiselectInputContainer'], [role='combobox'], [aria-haspopup='listbox']`,
    ),
  );
}

async function fillSchool(row: HTMLElement, school: string | null | undefined, shouldStop?: StopCheck) {
  const desired = visibleText(school);
  if (!desired || shouldStop?.()) return;
  const wrapper = row.querySelector<HTMLElement>(EDUCATION_FIELDS.school);
  if (!wrapper) return;
  if (isTypeaheadWrapper(wrapper)) {
    await fillTypeaheadValue(wrapper, desired, { skipIfAnyExistingChip: true, shouldStop });
    return;
  }
  const existing = visibleText((wrapper.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null)?.value);
  if (existing) return;
  fillTextWrapper(row, EDUCATION_FIELDS.school, desired);
}

async function fillEducationRow(row: HTMLElement, education: MasterProfileEducation, context: FillContext) {
  const shouldStop = context.shouldStop;
  const progressHint = uniqueVisibleTargets([education.school, education.degree ?? "", education.field ?? ""]).join(" ");
  await fillSchool(row, education.school, shouldStop);
  if (shouldStop?.()) return;
  const degreeContainer = row.querySelector<HTMLElement>(EDUCATION_FIELDS.degree);
  if (degreeContainer && visibleText(education.degree)) {
    const trigger = degreeTrigger(degreeContainer);
    const alreadyFilled = Boolean(trigger && degreeHasValue(trigger));
    const filled = await fillDegree(degreeContainer, education.degree, shouldStop);
    emitWorkdayProgress(context, {
      label: "Education: Degree",
      canonicalKey: "education",
      status: filled ? "filled" : alreadyFilled ? "skipped" : shouldStop?.() ? "skipped" : "needs_user",
      error: filled ? undefined : alreadyFilled ? "Already filled." : shouldStop?.() ? "Stopped." : "No matching option.",
      valuePreview: education.degree ?? undefined,
      signatureHint: progressHint,
    });
  }
  if (shouldStop?.()) return;
  const fieldContainer = row.querySelector<HTMLElement>(EDUCATION_FIELDS.field);
  if (fieldContainer && visibleText(education.field)) {
    const alreadyFilled = hasAnyChip(fieldContainer);
    const filled = await fillTypeaheadValue(fieldContainer, education.field, {
      skipIfAnyExistingChip: true,
      searchTargets: fieldOfStudySearchTargets,
      shouldStop,
      optionMatcher: bestMatchingStrictOptionForTargets,
    });
    emitWorkdayProgress(context, {
      label: "Education: Field of Study",
      canonicalKey: "education",
      status: filled ? "filled" : alreadyFilled ? "skipped" : shouldStop?.() ? "skipped" : "needs_user",
      error: filled ? undefined : alreadyFilled ? "Already filled." : shouldStop?.() ? "Stopped." : "No matching option.",
      valuePreview: education.field ?? undefined,
      signatureHint: progressHint,
    });
  }
  if (shouldStop?.()) return;
  fillTextWrapper(row, EDUCATION_FIELDS.gpa, education.gpa);
  setDate(row, EDUCATION_FIELDS.startYear, parseProfileDate(education.startDate), { yearOnly: true });
  setDate(row, EDUCATION_FIELDS.endYear, parseProfileDate(education.endDate), { yearOnly: true });
}

/** Match pre-filled rows to their best education by school, then fill empty rows in order. */
function assignEducationRows(rows: HTMLElement[], education: MasterProfileEducation[]) {
  const used = new Set<number>();
  const assignments: Array<{ row: HTMLElement; education: MasterProfileEducation }> = [];
  const leftoverRows: HTMLElement[] = [];

  for (const row of rows) {
    const school = rowSchoolValue(row);
    if (!school) {
      leftoverRows.push(row);
      continue;
    }
    let best: { index: number; score: number } | null = null;
    for (let index = 0; index < education.length; index += 1) {
      if (used.has(index)) continue;
      const score = fuzzyScore(school, education[index].school);
      if (!best || score > best.score) best = { index, score };
    }
    if (best && best.score >= SCHOOL_MATCH_THRESHOLD) {
      used.add(best.index);
      assignments.push({ row, education: education[best.index] });
    } else {
      leftoverRows.push(row);
    }
  }

  const unused = education.filter((_, index) => !used.has(index));
  leftoverRows.forEach((row, index) => {
    if (unused[index]) assignments.push({ row, education: unused[index] });
  });
  return assignments;
}

async function fillEducationSection(root: HTMLElement, context: FillContext) {
  const education = context.profile.education.slice(0, MAX_REPEATER_ROWS);
  if (education.length === 0) return;

  wdlog("education rows", {
    desired: education.length,
    existing: educationRows(root).length,
    schools: education.map((item) => item.school).filter(Boolean),
  });

  let rows = educationRows(root);
  if (rows.length >= education.length) {
    for (const { row, education: item } of assignEducationRows(rows, education)) {
      if (context.shouldStop?.()) break;
      await fillEducationRow(row, item, context);
    }
    return;
  }

  rows = await ensureRows(
    () => educationRows(root),
    () => sectionAddButton(root, /education/i),
    1,
    context.shouldStop,
  );

  for (let index = 0; index < education.length; index += 1) {
    if (context.shouldStop?.()) break;
    rows = educationRows(root);
    if (rows.length <= index) {
      rows = await ensureRows(
        () => educationRows(root),
        () => sectionAddButton(root, /education/i),
        index + 1,
        context.shouldStop,
      );
    }
    const row = rows[index];
    if (!row) break;
    await fillEducationRow(row, education[index], context);
    await sleep(500);
    if (index + 1 < education.length && educationRows(root).length <= index + 1) {
      wdlog("adding next education row", { nextIndex: index + 2, currentRows: educationRows(root).length });
      await ensureRows(
        () => educationRows(root),
        () => sectionAddButton(root, /education/i),
        index + 2,
        context.shouldStop,
      );
    }
  }
}

function profileLanguageValues(context: FillContext) {
  const profileWithOptionalLanguages = context.profile as typeof context.profile & { languages?: unknown };
  const explicit =
    Array.isArray(profileWithOptionalLanguages.languages)
      ? profileWithOptionalLanguages.languages.filter((value): value is string => typeof value === "string")
      : [];
  const answerValues = context.profile.answers
    .filter((answer) => {
      const key = normalizeText(answer.key);
      const prompt = normalizeText(answer.prompt);
      return (
        key === "screening languages" ||
        key === "languages" ||
        /\blanguages?\b/.test(prompt) && /\b(?:speak|fluent|fluently|known|proficient)\b/.test(prompt)
      );
    })
    .flatMap((answer) => answer.value.split(/[,;\n]+/));

  return uniqueVisibleTargets([...explicit, ...answerValues])
    .filter((language) => !/^(?:none|n\/a|na|not applicable)$/i.test(language))
    .slice(0, MAX_REPEATER_ROWS);
}

function languageRowHasValue(row: HTMLElement) {
  const wrapper = row.querySelector<HTMLElement>(LANGUAGE_FIELDS.language);
  if (!wrapper) return false;
  if (hasAnyChip(wrapper)) return true;
  const input = wrapper.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:not([type='hidden']), textarea");
  return Boolean(visibleText(input?.value));
}

async function fillLanguageRow(row: HTMLElement, language: string, context: FillContext) {
  const shouldStop = context.shouldStop;
  const languageContainer = row.querySelector<HTMLElement>(LANGUAGE_FIELDS.language);
  if (!languageContainer) return false;
  const alreadyFilled = languageRowHasValue(row);
  const filled = isTypeaheadWrapper(languageContainer)
    ? await fillTypeaheadValue(languageContainer, language, {
        skipIfAnyExistingChip: true,
        shouldStop,
        optionMatcher: bestMatchingStrictOptionForTargets,
      })
    : (fillTextWrapper(row, LANGUAGE_FIELDS.language, language), languageRowHasValue(row));

  const proficiencyContainer = row.querySelector<HTMLElement>(LANGUAGE_FIELDS.proficiency);
  if (proficiencyContainer && !shouldStop?.()) {
    const trigger = degreeTrigger(proficiencyContainer);
    if (trigger && !degreeHasValue(trigger)) {
      await fillDegree(proficiencyContainer, "Fluent", shouldStop);
    } else if (!trigger) {
      fillTextWrapper(row, LANGUAGE_FIELDS.proficiency, "Fluent");
    }
  }

  emitWorkdayProgress(context, {
    label: "Language",
    canonicalKey: "answers.screening.languages",
    status: filled || alreadyFilled ? "filled" : shouldStop?.() ? "skipped" : "needs_user",
    error: filled || alreadyFilled ? undefined : shouldStop?.() ? "Stopped." : "No matching option.",
    valuePreview: language,
    signatureHint: language,
  });
  return filled || alreadyFilled;
}

async function fillLanguageSection(root: HTMLElement, context: FillContext) {
  const languages = profileLanguageValues(context);
  if (languages.length === 0) return;

  wdlog("language rows", {
    desired: languages.length,
    existing: languageRows(root).length,
    languages,
  });

  let rows = await ensureRows(
    () => languageRows(root),
    () => sectionAddButton(root, /languages?/i),
    1,
    context.shouldStop,
  );

  for (let index = 0; index < languages.length; index += 1) {
    if (context.shouldStop?.()) break;
    rows = languageRows(root);
    if (rows.length <= index) {
      rows = await ensureRows(
        () => languageRows(root),
        () => sectionAddButton(root, /languages?/i),
        index + 1,
        context.shouldStop,
      );
    }
    const row = rows[index];
    if (!row) break;
    await fillLanguageRow(row, languages[index], context);
    await sleep(500);
    if (index + 1 < languages.length && languageRows(root).length <= index + 1) {
      await ensureRows(
        () => languageRows(root),
        () => sectionAddButton(root, /languages?/i),
        index + 2,
        context.shouldStop,
      );
    }
  }
}

export async function fillWorkdayExperience(context: FillContext): Promise<void> {
  const root = myExperienceRoot(document);
  if (!root) return;
  wdlog("workday-experience build", WORKDAY_EXPERIENCE_BUILD_TAG);

  await fillWorkExperienceSection(root, context);
  if (context.shouldStop?.()) return;
  await fillEducationSection(root, context);
  if (context.shouldStop?.()) return;
  await fillLanguageSection(root, context);
  if (context.shouldStop?.()) return;
  await fillSkills(root, context);
}
