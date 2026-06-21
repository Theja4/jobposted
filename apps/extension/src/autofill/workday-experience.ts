import type { MasterProfileEducation } from "@jobposted/shared";
import {
  activateDropdownOption,
  activateElement,
  dispatchKey,
  isVisible,
  setText,
  sleep,
} from "./fill";
import { normalizeText, optionScore, visibleText } from "./text";
import type { FillContext } from "./types";

const MY_EXPERIENCE_ROOT = "[data-automation-id='applyFlowMyExpPage']";
const WORKDAY_EXPERIENCE_OWNED_SELECTOR = [
  "[data-automation-id='formField-degree']",
  "[data-automation-id='formField-fieldOfStudy']",
  "[data-automation-id='formField-skills']",
].join(",");
const MULTISELECT_CONTAINER = "[data-automation-id='multiSelectContainer']";
const MULTISELECT_INPUT = "[data-automation-id='multiselectInputContainer'] input";
const OPTION_SELECTOR = "[role='option']";
const OPTION_MATCH_THRESHOLD = 0.45;

type EducationRow = {
  group: HTMLElement;
  schoolInput: HTMLInputElement | HTMLTextAreaElement | null;
  degreeContainer: HTMLElement | null;
  fieldContainer: HTMLElement | null;
};

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

function placeholderText(value: string) {
  const text = normalizeText(value);
  return !text || /^(select|select one|select option|choose|choose one|choose option|none selected)$/.test(text);
}

function optionLabel(option: HTMLElement) {
  return visibleText(
    option.getAttribute("aria-label") ||
      option.textContent ||
      option.getAttribute("data-value") ||
      option.getAttribute("value"),
  );
}

function optionCandidates(doc: Document, ignoredOptions: ReadonlySet<HTMLElement>) {
  const fresh = Array.from(doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter(
    (option) => !ignoredOptions.has(option) && isVisible(option) && optionLabel(option),
  );
  if (fresh.length > 0) return fresh;
  return Array.from(doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter(
    (option) => isVisible(option) && optionLabel(option),
  );
}

function bestMatchingOption(options: HTMLElement[], target: string) {
  let best: { option: HTMLElement; score: number } | null = null;
  for (const option of options) {
    const score = Math.max(
      optionScore(optionLabel(option), target),
      optionScore(option.getAttribute("data-value") ?? "", target),
      optionScore(option.getAttribute("value") ?? "", target),
    );
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= OPTION_MATCH_THRESHOLD ? best.option : null;
}

async function waitForMatchingOption(
  doc: Document,
  target: string,
  ignoredOptions: ReadonlySet<HTMLElement>,
  timeoutMs = 1100,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const option = bestMatchingOption(optionCandidates(doc, ignoredOptions), target);
    if (option) return option;
    await sleep(80);
  }
  return null;
}

function educationRows(root: HTMLElement): EducationRow[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[role='group']"))
    .map((group) => {
      const schoolInput = group.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        "[data-automation-id='formField-schoolName'] input, [data-automation-id='formField-schoolName'] textarea",
      );
      const degreeContainer = group.querySelector<HTMLElement>("[data-automation-id='formField-degree']");
      const fieldContainer = group.querySelector<HTMLElement>("[data-automation-id='formField-fieldOfStudy']");
      return { group, schoolInput, degreeContainer, fieldContainer };
    })
    .filter((row) => Boolean(row.schoolInput && (row.degreeContainer || row.fieldContainer)));
}

async function waitForEducationRows(root: HTMLElement, timeoutMs = 1200) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const rows = educationRows(root);
    if (rows.length > 0) return rows;
    await sleep(100);
  }
  return [];
}

function schoolValue(row: EducationRow) {
  return visibleText(row.schoolInput?.value);
}

function matchEducationRow(
  row: EducationRow,
  rowIndex: number,
  education: MasterProfileEducation[],
  usedSchoolMatches: Set<number>,
) {
  const school = schoolValue(row);
  let best: { index: number; item: MasterProfileEducation; score: number } | null = null;
  if (school) {
    for (const [index, item] of education.entries()) {
      if (usedSchoolMatches.has(index)) continue;
      const score = optionScore(school, item.school);
      if (!best || score > best.score) best = { index, item, score };
    }
  }
  if (best && best.score >= 0.55) {
    usedSchoolMatches.add(best.index);
    return best.item;
  }
  return education[rowIndex] ?? null;
}

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
  return !placeholderText(current) && optionScore(current, target) >= OPTION_MATCH_THRESHOLD;
}

async function fillDegree(container: HTMLElement, target: string | null | undefined) {
  const desired = visibleText(target);
  if (!desired) return false;
  const trigger = degreeTrigger(container);
  if (!trigger || degreeHasValue(trigger)) return false;

  const doc = container.ownerDocument;
  const ignoredOptions = new Set(Array.from(doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)));
  trigger.focus?.();
  activateElement(trigger);
  await sleep(120);

  const option = await waitForMatchingOption(doc, desired, ignoredOptions);
  if (!option) {
    dispatchKey(trigger, "Escape");
    return false;
  }

  activateDropdownOption(option);
  await sleep(180);
  if (!degreeMatches(trigger, desired)) {
    dispatchKey(option, "Enter");
    dispatchKey(trigger, "Enter");
    await sleep(120);
  }
  dispatchKey(trigger, "Escape");
  return degreeMatches(trigger, desired);
}

function multiSelectRoot(container: HTMLElement) {
  return container.querySelector<HTMLElement>(MULTISELECT_CONTAINER) ?? container;
}

function multiSelectInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>(MULTISELECT_INPUT) ??
    container.querySelector<HTMLInputElement>("input:not([type='hidden'])");
}

function selectedChipTexts(container: HTMLElement) {
  const root = multiSelectRoot(container);
  const explicit = Array.from(
    root.querySelectorAll<HTMLElement>(
      [
        "[data-automation-id*='selected' i]",
        "[data-automation-id*='chip' i]",
        "[data-automation-id*='pill' i]",
        "[class*='chip' i]",
        "[class*='pill' i]",
        "[role='listitem']",
      ].join(","),
    ),
  )
    .filter((element) => !element.querySelector("input, textarea") && !element.closest("[role='listbox']"))
    .map((element) => visibleText(element.textContent || element.getAttribute("aria-label")))
    .filter(Boolean);
  if (explicit.length > 0) return Array.from(new Set(explicit));

  const clone = root.cloneNode(true) as HTMLElement;
  for (const node of Array.from(
    clone.querySelectorAll("input, textarea, [role='listbox'], [role='option'], [data-automation-id='multiselectInputContainer']"),
  )) {
    node.remove();
  }
  const text = visibleText(clone.textContent);
  return text ? [text] : [];
}

function hasAnyChip(container: HTMLElement) {
  return selectedChipTexts(container).length > 0;
}

function chipMatches(container: HTMLElement, target: string) {
  return selectedChipTexts(container).some((text) => optionScore(text, target) >= OPTION_MATCH_THRESHOLD);
}

async function fillTypeaheadValue(
  container: HTMLElement,
  target: string | null | undefined,
  options: { skipIfAnyExistingChip?: boolean } = {},
) {
  const desired = visibleText(target);
  if (!desired || chipMatches(container, desired)) return false;
  if (options.skipIfAnyExistingChip && hasAnyChip(container)) return false;
  const input = multiSelectInput(container);
  if (!input) return false;

  const doc = container.ownerDocument;
  const ignoredOptions = new Set(Array.from(doc.querySelectorAll<HTMLElement>(OPTION_SELECTOR)));
  input.focus?.();
  activateElement(input);
  setText(input, desired);
  await sleep(140);

  const option = await waitForMatchingOption(doc, desired, ignoredOptions);
  if (!option) {
    dispatchKey(input, "Escape");
    return false;
  }

  activateDropdownOption(option);
  await sleep(180);
  if (!chipMatches(container, desired)) {
    dispatchKey(option, "Enter");
    dispatchKey(input, "Enter");
    await sleep(120);
  }
  dispatchKey(input, "Escape");
  return chipMatches(container, desired);
}

async function fillSkills(root: HTMLElement, skills: string[]) {
  const container = root.querySelector<HTMLElement>("[data-automation-id='formField-skills']");
  if (!container || hasAnyChip(container)) return;

  for (const skill of skills.map(visibleText).filter(Boolean)) {
    if (chipMatches(container, skill)) continue;
    await fillTypeaheadValue(container, skill);
  }
}

export async function fillWorkdayExperience(context: FillContext): Promise<void> {
  const root = myExperienceRoot(document);
  if (!root) return;

  const rows = context.profile.education.length > 0 ? await waitForEducationRows(root) : [];
  const usedSchoolMatches = new Set<number>();
  for (const [index, row] of rows.entries()) {
    const education = matchEducationRow(row, index, context.profile.education, usedSchoolMatches);
    if (!education) continue;
    if (row.degreeContainer) await fillDegree(row.degreeContainer, education.degree);
    if (row.fieldContainer) await fillTypeaheadValue(row.fieldContainer, education.field, { skipIfAnyExistingChip: true });
  }

  await fillSkills(root, context.profile.skills);
}
