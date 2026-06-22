import type { MasterProfileEducation, MasterProfileExperience } from "@jobposted/shared";
import {
  activateDropdownOption,
  activateElement,
  dispatchKey,
  isVisible,
  setText,
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
const OPTION_SELECTOR = "[role='option']";
const ADD_BUTTON = "[data-automation-id='add-button']";
const HEADING_SELECTOR = "h1, h2, h3, h4, h5, [role='heading']";

// fuzzyScore scale: exact 1, subset/variant ~0.85+, near-miss ~0.6. 0.55 keeps close matches.
const OPTION_MATCH_THRESHOLD = 0.55;
const SCHOOL_MATCH_THRESHOLD = 0.55;
const MAX_REPEATER_ROWS = 8;

const EXPERIENCE_FIELDS = {
  jobTitle: "[data-automation-id='formField-jobTitle']",
  company: "[data-automation-id='formField-companyName']",
  location: "[data-automation-id='formField-location']",
  current: "[data-automation-id='formField-currentlyWorkHere']",
  startDate: "[data-automation-id='formField-startDate']",
  endDate: "[data-automation-id='formField-endDate']",
  description: "[data-automation-id='formField-roleDescription']",
} as const;
const EDUCATION_FIELDS = {
  school: "[data-automation-id='formField-schoolName']",
  degree: "[data-automation-id='formField-degree']",
  field: "[data-automation-id='formField-fieldOfStudy']",
  gpa: "[data-automation-id='formField-gradeAverage']",
  startYear: "[data-automation-id='formField-firstYearAttended']",
  endYear: "[data-automation-id='formField-lastYearAttended']",
} as const;

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const OPTION_MATCH_TIMEOUT_MS = 1100;

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
  const match = bestMatch(
    target,
    options,
    (option) => optionLabel(option) || option.getAttribute("data-value") || option.getAttribute("value") || "",
    OPTION_MATCH_THRESHOLD,
  );
  return match?.option ?? null;
}

async function waitForMatchingOption(
  doc: Document,
  target: string,
  ignoredOptions: ReadonlySet<HTMLElement>,
  timeoutMs = OPTION_MATCH_TIMEOUT_MS,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const option = bestMatchingOption(optionCandidates(doc, ignoredOptions), target);
    if (option) return option;
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
  return selectedChipTexts(container).some((text) => fuzzyScore(text, target) >= OPTION_MATCH_THRESHOLD);
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

// ---------------------------------------------------------------------------
// Plain controls: text / textarea, checkbox, segmented date
// ---------------------------------------------------------------------------

function fillTextWrapper(row: HTMLElement, selector: string, value: string | null | undefined) {
  const desired = (value ?? "").trim(); // preserve internal newlines (multi-line role descriptions)
  if (!desired) return;
  const wrapper = row.querySelector<HTMLElement>(selector);
  const input =
    wrapper?.querySelector<HTMLElement>("input:not([type='hidden']), textarea, [contenteditable='true'], [role='textbox']");
  if (!input) return;
  const existing = visibleText(
    (input as HTMLInputElement | HTMLTextAreaElement).value ?? input.textContent,
  );
  if (existing) return;
  setText(input, desired);
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

function setDate(row: HTMLElement, selector: string, parsed: ParsedDate, options: { yearOnly?: boolean } = {}) {
  const wrapper = row.querySelector<HTMLElement>(selector);
  if (!wrapper || (parsed.month == null && parsed.year == null)) return;

  const yearField =
    dateInput(wrapper, "[data-automation-id='dateSectionYear-input']", /year/i) ??
    wrapper.querySelector<HTMLInputElement>("input:not([type='hidden'])");
  if (yearField && parsed.year != null && !visibleText(yearField.value)) {
    setText(yearField, String(parsed.year));
  }
  if (options.yearOnly) return;

  const monthField = dateInput(wrapper, "[data-automation-id='dateSectionMonth-input']", /month/i);
  if (monthField && parsed.month != null && !visibleText(monthField.value)) {
    setText(monthField, String(parsed.month).padStart(2, "0"));
  }
}

// ---------------------------------------------------------------------------
// Repeater rows (Work Experience, Education)
// ---------------------------------------------------------------------------

function rowsBySignature(root: HTMLElement, requiredSelector: string) {
  return Array.from(root.querySelectorAll<HTMLElement>("[role='group']")).filter((group) =>
    group.querySelector(requiredSelector),
  );
}

function experienceRows(root: HTMLElement) {
  return rowsBySignature(root, EXPERIENCE_FIELDS.jobTitle);
}

function educationRows(root: HTMLElement) {
  return rowsBySignature(root, EDUCATION_FIELDS.school);
}

function headingPosition(root: HTMLElement, pattern: RegExp) {
  const order = Array.from(root.querySelectorAll<HTMLElement>("*"));
  const headings = order.filter((element) => element.matches?.(HEADING_SELECTOR));
  const start = headings.find((heading) => pattern.test(visibleText(heading.textContent)));
  if (!start) return null;
  const startIndex = order.indexOf(start);
  const nextHeadingIndex = headings
    .map((heading) => order.indexOf(heading))
    .filter((index) => index > startIndex)
    .sort((a, b) => a - b)[0];
  return { order, startIndex, endIndex: nextHeadingIndex ?? order.length };
}

/** The Add / Add Another button belonging to the section whose heading matches `pattern`. */
function sectionAddButton(root: HTMLElement, pattern: RegExp) {
  const located = headingPosition(root, pattern);
  if (!located) return null;
  const { order, startIndex, endIndex } = located;
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const element = order[index];
    if (element.matches?.(ADD_BUTTON) && isVisible(element)) return element;
  }
  return null;
}

async function ensureRows(
  rowsAccessor: () => HTMLElement[],
  addButton: HTMLElement | null,
  desiredCount: number,
) {
  let rows = rowsAccessor();
  let safety = 0;
  while (addButton && rows.length < desiredCount && safety < desiredCount + 2) {
    const before = rows.length;
    activateElement(addButton);
    const grew = await waitForRowCount(rowsAccessor, before + 1);
    rows = rowsAccessor();
    if (!grew) break;
    safety += 1;
  }
  return rows;
}

async function waitForRowCount(rowsAccessor: () => HTMLElement[], target: number, timeoutMs = 1200) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (rowsAccessor().length >= target) return true;
    await sleep(100);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Section fillers
// ---------------------------------------------------------------------------

async function fillExperienceRow(row: HTMLElement, experience: MasterProfileExperience) {
  fillTextWrapper(row, EXPERIENCE_FIELDS.jobTitle, experience.title);
  fillTextWrapper(row, EXPERIENCE_FIELDS.company, experience.company);
  fillTextWrapper(row, EXPERIENCE_FIELDS.location, experience.location);
  setCheckbox(row, EXPERIENCE_FIELDS.current, Boolean(experience.current));
  setDate(row, EXPERIENCE_FIELDS.startDate, parseProfileDate(experience.startDate));
  if (!experience.current) {
    setDate(row, EXPERIENCE_FIELDS.endDate, parseProfileDate(experience.endDate));
  }
  if (experience.bullets.length > 0) {
    fillTextWrapper(row, EXPERIENCE_FIELDS.description, experience.bullets.join("\n"));
  }
}

async function fillWorkExperienceSection(root: HTMLElement, context: FillContext) {
  const experiences = context.profile.experience.slice(0, MAX_REPEATER_ROWS);
  if (experiences.length === 0) return;

  const addButton = sectionAddButton(root, /work experience|employment/i);
  const rows = await ensureRows(() => experienceRows(root), addButton, experiences.length);

  for (let index = 0; index < rows.length && index < experiences.length; index += 1) {
    const row = rows[index];
    const titleInput = row.querySelector<HTMLInputElement>(`${EXPERIENCE_FIELDS.jobTitle} input`);
    if (visibleText(titleInput?.value)) continue; // respect resume-prefilled rows
    await fillExperienceRow(row, experiences[index]);
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

async function fillSchool(row: HTMLElement, school: string | null | undefined) {
  const desired = visibleText(school);
  if (!desired) return;
  const wrapper = row.querySelector<HTMLElement>(EDUCATION_FIELDS.school);
  if (!wrapper) return;
  if (isTypeaheadWrapper(wrapper)) {
    await fillTypeaheadValue(wrapper, desired, { skipIfAnyExistingChip: true });
    return;
  }
  fillTextWrapper(row, EDUCATION_FIELDS.school, desired);
}

async function fillEducationRow(row: HTMLElement, education: MasterProfileEducation) {
  await fillSchool(row, education.school);
  const degreeContainer = row.querySelector<HTMLElement>(EDUCATION_FIELDS.degree);
  if (degreeContainer) await fillDegree(degreeContainer, education.degree);
  const fieldContainer = row.querySelector<HTMLElement>(EDUCATION_FIELDS.field);
  if (fieldContainer) await fillTypeaheadValue(fieldContainer, education.field, { skipIfAnyExistingChip: true });
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

  const addButton = sectionAddButton(root, /education/i);
  const rows = await ensureRows(() => educationRows(root), addButton, education.length);

  for (const { row, education: item } of assignEducationRows(rows, education)) {
    await fillEducationRow(row, item);
  }
}

export async function fillWorkdayExperience(context: FillContext): Promise<void> {
  const root = myExperienceRoot(document);
  if (!root) return;

  await fillWorkExperienceSection(root, context);
  await fillEducationSection(root, context);
  await fillSkills(root, context.profile.skills);
}
