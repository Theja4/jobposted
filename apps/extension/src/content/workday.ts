import type { ExtensionFieldFillRecord } from "@jobposted/shared";
import type { PlatformFillStrategy } from "./fill-strategy";

export const WORKDAY_HOST_SUFFIXES = ["myworkdayjobs.com", "workdayjobs.com"] as const;

export const WORKDAY_SELECTORS = {
  applicationRoot: "[data-automation-id='workdayApplication'], [data-automation-id*='workday' i]",
  myExperienceRoot: "[data-automation-id='applyFlowMyExpPage']",
  stepName: "[data-automation-id='stepName']",
  activeProgressStep:
    "[data-automation-id='progressBarActiveStep'], [data-automation-id='progressTrackerActiveStep']",
  jobHeading: "[data-automation-id='jobPostingHeader']",
  company: "[data-automation-id='company']",
  fieldContainer: "[data-automation-id]",
  stepHeading: "h1,h2,h3,h4,[data-automation-id='stepName']",
  addRowButton: "[data-automation-id='add-button'], [data-automation-id='addAnother'], button, [role='button']",
  educationField:
    "[data-automation-id='formField-schoolName'], [data-automation-id*='education' i], [data-automation-id*='school' i]",
  experienceField:
    "[data-automation-id='formField-companyName'], [data-automation-id='formField-jobTitle'], [data-automation-id*='employment' i], [data-automation-id*='experience' i]",
  skillsField:
    "[data-automation-id='formField-skills'], [data-automation-id='multiSelectContainer'], [data-automation-id='multiselectInputContainer']",
  skillsInput:
    "[data-automation-id='formField-skills'] input, [data-automation-id='multiselectInputContainer'] input, [data-automation-id='multiSelectContainer'] input",
  option:
    "[role='option'], [role='menuitem'], [id^='menuItem'], [data-automation-id*='menuItem' i], [data-automation-id*='option' i]",
} as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isWorkdayHost(hostname: string) {
  const host = hostname.toLowerCase();
  return WORKDAY_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function workdayHostFromUrl(url: string) {
  try {
    return isWorkdayHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function hasWorkdayDom(doc: Document) {
  return Boolean(doc.querySelector(WORKDAY_SELECTORS.applicationRoot));
}

export function isWorkdayPage(url: string, doc: Document) {
  return workdayHostFromUrl(url) || hasWorkdayDom(doc);
}

export function workdayStepName(doc: Document) {
  return clean(
    doc.querySelector(WORKDAY_SELECTORS.activeProgressStep)?.textContent ||
      doc.querySelector(WORKDAY_SELECTORS.stepName)?.textContent,
  );
}

export function workdayJobHeading(doc: Document) {
  return clean(doc.querySelector(WORKDAY_SELECTORS.jobHeading)?.textContent);
}

export function workdayCompany(doc: Document) {
  return clean(doc.querySelector(WORKDAY_SELECTORS.company)?.textContent);
}

export function workdayRepeaterHint(element: HTMLElement): "education" | "experience" | null {
  const container = element.closest<HTMLElement>(WORKDAY_SELECTORS.fieldContainer);
  const automationText = normalize(
    [
      container?.getAttribute("data-automation-id"),
      container?.getAttribute("data-automation-label"),
      container?.textContent,
    ].join(" "),
  );

  if (/\b(education|school|university|college|degree|field of study)\b/.test(automationText)) {
    return "education";
  }
  if (/\b(experience|employment|work history|employer|job title|position)\b/.test(automationText)) {
    return "experience";
  }
  return null;
}

function isVisible(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle?.(element);
  return !(style && (style.display === "none" || style.visibility === "hidden"));
}

function buttonText(button: HTMLElement) {
  return normalize(
    [
      button instanceof HTMLInputElement ? button.value : button.textContent,
      button.getAttribute("aria-label"),
      button.getAttribute("data-automation-id"),
      button.getAttribute("data-automation-label"),
    ].join(" "),
  );
}

function closestSection(element: HTMLElement) {
  return (
    element.closest<HTMLElement>(
      "section, fieldset, [data-automation-id*='section' i], [data-automation-id*='education' i], [data-automation-id*='experience' i], [data-automation-id*='employment' i]",
    ) ?? element.parentElement
  );
}

function sectionForIntent(doc: Document, intent: "education" | "experience") {
  const matcher =
    intent === "education"
      ? /\b(education|school|university|college)\b/
      : /\b(experience|employment|work history|job history)\b/;
  const headings = Array.from(doc.querySelectorAll<HTMLElement>("h1, h2, h3, h4, [role='heading'], legend"));
  const heading = headings.find((element) =>
    matcher.test(normalize(`${element.getAttribute("data-automation-id") ?? ""} ${element.textContent ?? ""}`)),
  );
  if (heading) return closestSection(heading);

  const sections = Array.from(doc.querySelectorAll<HTMLElement>("section, fieldset, [data-automation-id*='section' i]"));
  const section = sections.find((element) =>
    matcher.test(normalize(`${element.getAttribute("data-automation-id") ?? ""} ${element.textContent ?? ""}`)),
  );
  return section ?? null;
}

function rowCount(doc: Document, intent: "education" | "experience") {
  const selectorBases = (intent === "education" ? WORKDAY_SELECTORS.educationField : WORKDAY_SELECTORS.experienceField)
    .split(",")
    .map((selector) => selector.trim())
    .filter(Boolean);
  const fieldControls = [
    ...selectorBases.flatMap((selector) => [
      `${selector} input`,
      `${selector} textarea`,
      `${selector} [role='combobox']`,
    ]),
    intent === "education"
      ? "input[data-automation-id*='school' i], input[data-automation-id*='degree' i]"
      : "input[data-automation-id*='company' i], input[data-automation-id*='jobTitle' i]",
  ].join(",");
  const fields = Array.from(doc.querySelectorAll<HTMLElement>(fieldControls)).filter(isVisible);
  if (fields.length === 0) return 0;
  const rows = new Set<HTMLElement>();
  for (const field of fields) {
    rows.add(
      field.closest<HTMLElement>(
        "[data-automation-id*='repeater' i], [data-automation-id*='row' i], [data-automation-id^='formField-' i], li, div",
      ) ?? field,
    );
  }
  return Math.max(1, rows.size);
}

function findAddRowButton(doc: Document, intent: "education" | "experience") {
  const section = sectionForIntent(doc, intent);
  const candidates = Array.from((section ?? doc).querySelectorAll<HTMLElement>(WORKDAY_SELECTORS.addRowButton)).filter(isVisible);
  const intentPattern =
    intent === "education"
      ? /\b(add|another|more).*(education|school)|\b(education|school).*(add|another|more)|\badd another\b|\badd\b/
      : /\b(add|another|more).*(experience|employment|work)|\b(experience|employment|work).*(add|another|more)|\badd another\b|\badd\b/;
  return candidates.find((button) => intentPattern.test(buttonText(button))) ?? null;
}

async function waitForRows(doc: Document, intent: "education" | "experience", minimum: number, shouldStop?: () => boolean) {
  const startedAt = Date.now();
  while (!shouldStop?.() && Date.now() - startedAt < 2_500) {
    if (rowCount(doc, intent) >= minimum) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  return rowCount(doc, intent) >= minimum;
}

export async function ensureWorkdayRepeaterRows(args: {
  doc: Document;
  intent: "education" | "experience";
  desiredRows: number;
  shouldStop?: () => boolean;
}) {
  const desiredRows = Math.max(0, Math.min(8, args.desiredRows));
  if (desiredRows <= 1) return;
  for (let current = Math.max(1, rowCount(args.doc, args.intent)); current < desiredRows; current += 1) {
    if (args.shouldStop?.()) return;
    const button = findAddRowButton(args.doc, args.intent);
    if (!button) return;
    button.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (rowCount(args.doc, args.intent) < current + 1) {
      const MouseEventCtor = button.ownerDocument.defaultView?.MouseEvent ?? Event;
      button.dispatchEvent(new MouseEventCtor("click", { bubbles: true, cancelable: true }));
    }
    await waitForRows(args.doc, args.intent, current + 1, args.shouldStop);
  }
}

function nativeValueSetter(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  if (input.value !== value) input.value = value;
}

function dispatchInputChange(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function dispatchTypeaheadKey(element: HTMLElement, key: string) {
  const code = key === "Enter" ? 13 : key === "ArrowDown" ? 40 : key === "Tab" ? 9 : 0;
  const init = { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true } as KeyboardEventInit;
  const KeyboardEventCtor = element.ownerDocument.defaultView?.KeyboardEvent ?? KeyboardEvent;
  element.dispatchEvent(new KeyboardEventCtor("keydown", init));
  element.dispatchEvent(new KeyboardEventCtor("keyup", init));
}

function skillValues(value: unknown) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;]+/).map(clean).filter(Boolean);
  return [];
}

function optionText(option: HTMLElement) {
  return clean(option.getAttribute("aria-label") || option.textContent || option.getAttribute("data-automation-label"));
}

function optionScore(wanted: string, option: string) {
  const a = normalize(wanted);
  const b = normalize(option);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.replace(/\s+/g, "") === b.replace(/\s+/g, "")) return 0.98;
  if (a.includes(b) || b.includes(a)) return 0.82;
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = b.split(/\s+/);
  const overlap = bTokens.filter((token) => aTokens.has(token)).length;
  return overlap / Math.max(aTokens.size, bTokens.length);
}

function bestOption(doc: Document, wanted: string) {
  let best: { option: HTMLElement; score: number } | null = null;
  for (const option of Array.from(doc.querySelectorAll<HTMLElement>(WORKDAY_SELECTORS.option)).filter(isVisible)) {
    const score = optionScore(wanted, optionText(option));
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= 0.55 ? best.option : null;
}

function selectedSkillText(root: HTMLElement) {
  return normalize(root.textContent ?? "");
}

export async function fillWorkdaySkills(args: {
  field: { element: HTMLElement; label: string };
  value: unknown;
  shouldStop?: () => boolean;
}) {
  const root =
    args.field.element.closest<HTMLElement>(WORKDAY_SELECTORS.skillsField) ??
    args.field.element.ownerDocument.querySelector<HTMLElement>(WORKDAY_SELECTORS.skillsField);
  const input = root?.querySelector<HTMLInputElement>(WORKDAY_SELECTORS.skillsInput) ??
    args.field.element.querySelector<HTMLInputElement>("input") ??
    (args.field.element instanceof HTMLInputElement ? args.field.element : null);
  if (!root || !input) return { filled: 0, attempted: 0 };

  let filled = 0;
  const values = skillValues(args.value).slice(0, 60);
  for (const skill of values) {
    if (args.shouldStop?.()) break;
    if (selectedSkillText(root).includes(normalize(skill))) {
      filled += 1;
      continue;
    }
    input.focus();
    nativeValueSetter(input, skill);
    dispatchInputChange(input);
    dispatchTypeaheadKey(input, "ArrowDown");
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const option = bestOption(input.ownerDocument, skill);
    if (option) {
      option.click();
      dispatchInputChange(option);
    } else {
      dispatchTypeaheadKey(input, "Enter");
      dispatchInputChange(input);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    filled += 1;
  }
  return { filled, attempted: values.length };
}

function isSkillsField(field: { element: HTMLElement; label: string }) {
  return /\bskills?\b/i.test(field.label) || Boolean(field.element.closest(WORKDAY_SELECTORS.skillsField));
}

function workdayRecord(args: {
  signature: string;
  label: string;
  status: ExtensionFieldFillRecord["status"];
  confidence: number;
  error?: string;
  valuePreview?: string;
}): ExtensionFieldFillRecord {
  return {
    signature: args.signature,
    label: args.label,
    canonicalKey: "skills",
    status: args.status,
    confidence: args.confidence,
    source: "llm",
    error: args.error,
    valuePreview: args.valuePreview,
  };
}

export function createWorkdayFillStrategy(): PlatformFillStrategy {
  return {
    id: "workday",
    async preparePage({ doc, profile, shouldStop }) {
      const quickApply = Array.from(doc.querySelectorAll<HTMLElement>("button, [role='button'], input[type='button']")).find((button) =>
        /\b(quick apply|autofill with resume|use my resume)\b/i.test(
          `${button instanceof HTMLInputElement ? button.value : button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`,
        ),
      );
      quickApply?.click();
      await ensureWorkdayRepeaterRows({
        doc,
        intent: "education",
        desiredRows: profile.education.length,
        shouldStop,
      });
      await ensureWorkdayRepeaterRows({
        doc,
        intent: "experience",
        desiredRows: profile.experience.length,
        shouldStop,
      });
    },
    async fillField({ field, item, shouldStop }) {
      if (!isSkillsField(field)) return null;
      const result = await fillWorkdaySkills({ field, value: item.value, shouldStop });
      if (result.attempted === 0) return null;
      return workdayRecord({
        signature: field.signature,
        label: field.label,
        status: result.filled > 0 ? "filled" : field.required ? "needs_user" : "skipped",
        confidence: item.confidence,
        error: result.filled > 0 ? undefined : "Could not add Workday skills.",
        valuePreview: `${result.filled}/${result.attempted} skills`,
      });
    },
  };
}
