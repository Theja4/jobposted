import type {
  CanonicalFieldKey,
  ExtensionFieldFillRecord,
  MasterProfile,
  MasterProfileEducation,
  MasterProfileExperience,
} from "@jobposted/shared";
import { activateDropdownOption, activateElement, dispatchKey, isVisible, setText, sleep } from "../autofill/fill";
import { bestMatch } from "../autofill/fuzzy-match";
import type { PageField } from "./autofill";

const MAX_GREENHOUSE_ROWS = 8;
const GREENHOUSE_OPTION_THRESHOLD = 0.6;
const ROW_WAIT_MS = 2400;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type StopCheck = () => boolean;
type FieldStatus = ExtensionFieldFillRecord["status"];

interface StructuredFillArgs {
  doc: Document;
  fields: PageField[];
  profile: MasterProfile;
  shouldStop?: StopCheck;
  onFieldStart?: (field: PageField) => void;
  onField?: (record: ExtensionFieldFillRecord) => void;
}

interface StructuredFillResult {
  records: ExtensionFieldFillRecord[];
  claimedFieldIds: Set<string>;
}

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

function currentValue(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return clean(element.value);
  }
  return clean(element.getAttribute("aria-valuetext") || element.textContent);
}

function choiceValue(control: HTMLElement) {
  const root = choiceRootFor(control);
  return (
    currentValue(control) ||
    clean(
      root.querySelector<HTMLElement>(
        [
          "[class*='select__single-value' i]",
          "[class*='single-value' i]",
          "[aria-live] [class*='value' i]",
        ].join(","),
      )?.textContent,
    )
  );
}

function parseDateParts(value: string | null | undefined) {
  const text = clean(value);
  if (!text) return { month: "", year: "" };
  const iso = text.match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (iso) {
    const monthIndex = iso[2] ? Number(iso[2]) - 1 : -1;
    return {
      month: monthIndex >= 0 && monthIndex < MONTHS.length ? MONTHS[monthIndex] : "",
      year: iso[1],
    };
  }
  const year = text.match(/\b(19|20)\d{2}\b/)?.[0] ?? "";
  const monthIndex = MONTHS.findIndex((month) => new RegExp(`\\b${month.slice(0, 3)}`, "i").test(text));
  return {
    month: monthIndex >= 0 ? MONTHS[monthIndex] : "",
    year,
  };
}

function recordFor(args: {
  field: PageField | null;
  fallbackSignature: string;
  label: string;
  canonicalKey: CanonicalFieldKey;
  status: FieldStatus;
  required?: boolean;
  error?: string;
  valuePreview?: string;
  confidence?: number;
}): ExtensionFieldFillRecord {
  return {
    signature: args.field?.fieldId ?? args.fallbackSignature,
    label: args.field?.label || args.label,
    required: args.field?.required ?? args.required,
    canonicalKey: args.canonicalKey,
    status: args.status,
    confidence: args.confidence ?? 0.94,
    source: "adapter",
    error: args.error,
    valuePreview: args.valuePreview,
  };
}

function fieldForElement(fields: PageField[], element: HTMLElement | null | undefined) {
  if (!element) return null;
  return (
    fields.find((field) => {
      if (field.element === element || field.element.contains(element) || element.contains(field.element)) return true;
      return field.elements.some((candidate) => candidate === element || candidate.contains(element) || element.contains(candidate));
    }) ?? null
  );
}

function fieldForControl(fields: PageField[], control: HTMLElement | null | undefined) {
  const direct = fieldForElement(fields, control);
  if (direct) return direct;
  const selectRoot = control?.closest<HTMLElement>(".select, .field-wrapper, .text-input-wrapper, .checkbox");
  return fieldForElement(fields, selectRoot);
}

function optionText(option: HTMLElement) {
  return clean(
    option.getAttribute("aria-label") ||
      option.getAttribute("data-label") ||
      option.getAttribute("data-value") ||
      option.textContent ||
      (option instanceof HTMLOptionElement ? option.value : ""),
  );
}

function choiceRootFor(control: HTMLElement) {
  return control.closest<HTMLElement>(".select, .field-wrapper, .application-question, fieldset") ?? control;
}

function visibleChoiceOptions(control: HTMLElement, ignored: ReadonlySet<HTMLElement> = new Set()) {
  const doc = control.ownerDocument;
  const root = choiceRootFor(control);
  const local = Array.from(root.querySelectorAll<HTMLElement>("[role='option'], option, li[role='option'], [class*='select__option' i]"));
  const global = Array.from(doc.querySelectorAll<HTMLElement>("[role='option'], option, li[role='option'], [class*='select__option' i]"));
  const seen = new Set<HTMLElement>();
  const result: HTMLElement[] = [];
  for (const option of [...local, ...global]) {
    if (seen.has(option) || ignored.has(option) || !isVisible(option) || !optionText(option)) continue;
    seen.add(option);
    result.push(option);
  }
  return result;
}

function choiceActivationTarget(control: HTMLElement) {
  return (
    choiceRootFor(control).querySelector<HTMLElement>(
      [
        "button[aria-label*='toggle' i]",
        "[class^='select__control']",
        "[class*=' select__control']",
        "[class^='select-shell']",
        "[class*=' select-shell']",
      ].join(","),
    ) ?? control
  );
}

function labelControl(row: HTMLElement, labelPattern: RegExp, selector = "input, textarea, [role='combobox']") {
  const labels = Array.from(row.querySelectorAll<HTMLLabelElement>("label"));
  const label = labels.find((candidate) => labelPattern.test(clean(candidate.textContent)));
  const id = label?.getAttribute("for");
  if (id) {
    const control = row.ownerDocument.getElementById(id);
    if (control instanceof HTMLElement) return control;
  }
  return Array.from(row.querySelectorAll<HTMLElement>(selector)).find((candidate) =>
    labelPattern.test(
      clean(
        [
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("id"),
          candidate.getAttribute("name"),
          candidate.closest("label")?.textContent,
        ].join(" "),
      ),
    ),
  ) ?? null;
}

function employmentRows(doc: Document) {
  return Array.from(doc.querySelectorAll<HTMLInputElement>("input[id^='company-name-']")).map((input) => {
    const row = input.closest<HTMLElement>(".employment-form, [class*='employment' i], fieldset, section") ?? input.parentElement ?? input;
    const index = Number(input.id.match(/company-name-(\d+)/)?.[1] ?? "0");
    return { row, index };
  });
}

function educationRows(doc: Document) {
  return Array.from(doc.querySelectorAll<HTMLElement>("[id^='school--'], [id^='school-name-']")).map((input) => {
    const row = input.closest<HTMLElement>(".education--form, [class*='education' i], fieldset, section") ?? input.parentElement ?? input;
    const index = Number(input.id.match(/(?:school--|school-name-)(\d+)/)?.[1] ?? "0");
    return { row, index };
  });
}

function addButtonFor(doc: Document, intent: "employment" | "education") {
  const container =
    intent === "employment"
      ? doc.querySelector<HTMLElement>(".employment--container, [class*='employment' i]")
      : doc.querySelector<HTMLElement>(".education--container, [class*='education' i]");
  const candidates = Array.from((container ?? doc).querySelectorAll<HTMLElement>("button, [role='button'], input[type='button']")).filter(isVisible);
  return candidates.find((button) =>
    /\badd another\b|\badd\b/i.test(clean(button instanceof HTMLInputElement ? button.value : button.textContent || button.getAttribute("aria-label"))),
  ) ?? null;
}

async function waitForRows(
  doc: Document,
  rows: () => Array<{ row: HTMLElement; index: number }>,
  minimum: number,
  shouldStop?: StopCheck,
) {
  const startedAt = Date.now();
  while (!shouldStop?.() && Date.now() - startedAt < ROW_WAIT_MS) {
    if (rows().length >= minimum) return true;
    await sleep(80);
  }
  return rows().length >= minimum;
}

async function ensureRows(args: {
  doc: Document;
  intent: "employment" | "education";
  desiredRows: number;
  shouldStop?: StopCheck;
}) {
  const desiredRows = Math.max(0, Math.min(MAX_GREENHOUSE_ROWS, args.desiredRows));
  if (desiredRows <= 1) return;
  const rows = args.intent === "employment" ? () => employmentRows(args.doc) : () => educationRows(args.doc);
  for (let current = Math.max(1, rows().length); current < desiredRows; current += 1) {
    if (args.shouldStop?.()) return;
    const button = addButtonFor(args.doc, args.intent);
    if (!button) return;
    activateElement(button);
    await waitForRows(args.doc, rows, current + 1, args.shouldStop);
  }
}

export async function prepareGreenhouseStructuredRows(args: {
  doc: Document;
  profile: MasterProfile;
  shouldStop?: StopCheck;
}) {
  await ensureRows({
    doc: args.doc,
    intent: "employment",
    desiredRows: args.profile.experience.length,
    shouldStop: args.shouldStop,
  });
  if (args.shouldStop?.()) return;
  await ensureRows({
    doc: args.doc,
    intent: "education",
    desiredRows: args.profile.education.length,
    shouldStop: args.shouldStop,
  });
}

function emit(result: StructuredFillResult, args: StructuredFillArgs, record: ExtensionFieldFillRecord, field: PageField | null) {
  result.records.push(record);
  if (field) result.claimedFieldIds.add(field.fieldId);
  args.onField?.(record);
}

function claimOnly(result: StructuredFillResult, field: PageField | null) {
  if (field) result.claimedFieldIds.add(field.fieldId);
}

function fillTextControl(args: {
  result: StructuredFillResult;
  fillArgs: StructuredFillArgs;
  control: HTMLElement | null;
  value: string | null | undefined;
  label: string;
  canonicalKey: CanonicalFieldKey;
  fallbackSignature: string;
  required?: boolean;
}) {
  const field = fieldForControl(args.fillArgs.fields, args.control);
  if (!field || !args.control) return;
  args.fillArgs.onFieldStart?.(field);
  const value = clean(args.value);
  if (!value) {
    emit(
      args.result,
      args.fillArgs,
      recordFor({
        field,
        fallbackSignature: args.fallbackSignature,
        label: args.label,
        canonicalKey: args.canonicalKey,
        status: field.required || args.required ? "needs_user" : "skipped",
        required: args.required,
        error: field.required || args.required ? "No profile value available." : "No profile value available.",
      }),
      field,
    );
    return;
  }
  setText(args.control, value);
  const filled = currentValue(args.control) === value;
  emit(
    args.result,
    args.fillArgs,
    recordFor({
      field,
      fallbackSignature: args.fallbackSignature,
      label: args.label,
      canonicalKey: args.canonicalKey,
      status: filled ? "filled" : "failed",
      required: args.required,
      error: filled ? undefined : "Could not fill this Greenhouse field.",
      valuePreview: value,
    }),
    field,
  );
}

async function fillChoiceControl(args: {
  result: StructuredFillResult;
  fillArgs: StructuredFillArgs;
  control: HTMLElement | null;
  desired: string | null | undefined;
  label: string;
  canonicalKey: CanonicalFieldKey;
  fallbackSignature: string;
  required?: boolean;
}) {
  const field = fieldForControl(args.fillArgs.fields, args.control);
  if (!field || !args.control) return;
  args.fillArgs.onFieldStart?.(field);
  const desired = clean(args.desired);
  if (!desired) {
    emit(
      args.result,
      args.fillArgs,
      recordFor({
        field,
        fallbackSignature: args.fallbackSignature,
        label: args.label,
        canonicalKey: args.canonicalKey,
        status: field.required || args.required ? "needs_user" : "skipped",
        required: args.required,
        error: field.required || args.required ? "No profile value available." : "No profile value available.",
      }),
      field,
    );
    return;
  }

  const staticMatch = field.options.length > 0 ? bestMatch(desired, field.options, (option) => option, GREENHOUSE_OPTION_THRESHOLD) : null;
  if (field.options.length > 0 && !staticMatch) {
    emit(
      args.result,
      args.fillArgs,
      recordFor({
        field,
        fallbackSignature: args.fallbackSignature,
        label: args.label,
        canonicalKey: args.canonicalKey,
        status: field.required || args.required ? "needs_user" : "skipped",
        required: args.required,
        error: `No safe Greenhouse option matched "${desired}".`,
        valuePreview: desired,
        confidence: 0.58,
      }),
      field,
    );
    return;
  }

  const ignored = new Set<HTMLElement>();
  activateElement(choiceActivationTarget(args.control));
  await sleep(120);
  if (args.fillArgs.shouldStop?.()) return;
  setText(args.control, staticMatch?.option ?? desired);
  dispatchKey(args.control, "ArrowDown");
  await sleep(160);
  if (args.fillArgs.shouldStop?.()) return;

  const options = visibleChoiceOptions(args.control, ignored);
  const dynamicMatch =
    bestMatch(staticMatch?.option ?? desired, options, optionText, GREENHOUSE_OPTION_THRESHOLD) ??
    (staticMatch ? options.find((option) => normalize(optionText(option)) === normalize(staticMatch.option)) ? { option: options.find((option) => normalize(optionText(option)) === normalize(staticMatch.option))!, score: 1 } : null : null);
  if (dynamicMatch) {
    activateDropdownOption(dynamicMatch.option);
    await sleep(80);
  } else if (staticMatch) {
    dispatchKey(args.control, "Enter");
    await sleep(80);
  }

  const expected = dynamicMatch ? optionText(dynamicMatch.option) : staticMatch?.option ?? desired;
  const actualValue = choiceValue(args.control);
  const filled = Boolean(actualValue) && (!expected || normalize(actualValue) === normalize(expected) || fuzzyEnough(actualValue, expected));
  emit(
    args.result,
    args.fillArgs,
    recordFor({
      field,
      fallbackSignature: args.fallbackSignature,
      label: args.label,
      canonicalKey: args.canonicalKey,
      status: filled ? "filled" : field.required || args.required ? "needs_user" : "skipped",
      required: args.required,
      error: filled ? undefined : `Could not select a safe Greenhouse option for "${desired}".`,
      valuePreview: filled ? actualValue : desired,
      confidence: filled ? 0.92 : 0.58,
    }),
    field,
  );
}

function fuzzyEnough(value: string, expected: string) {
  return Boolean(bestMatch(expected, [value], (option) => option, GREENHOUSE_OPTION_THRESHOLD));
}

function fillCheckboxControl(args: {
  result: StructuredFillResult;
  fillArgs: StructuredFillArgs;
  control: HTMLInputElement | null;
  value: boolean | null | undefined;
  label: string;
  canonicalKey: CanonicalFieldKey;
  fallbackSignature: string;
}) {
  const field = fieldForControl(args.fillArgs.fields, args.control);
  if (!field || !args.control) return;
  args.fillArgs.onFieldStart?.(field);
  const desired = args.value === true;
  if (args.control.checked !== desired) {
    activateElement(args.control);
    if (args.control.checked !== desired) args.control.checked = desired;
    args.control.dispatchEvent(new Event("input", { bubbles: true }));
    args.control.dispatchEvent(new Event("change", { bubbles: true }));
  }
  emit(
    args.result,
    args.fillArgs,
    recordFor({
      field,
      fallbackSignature: args.fallbackSignature,
      label: args.label,
      canonicalKey: args.canonicalKey,
      status: desired ? "filled" : "skipped",
      required: false,
      valuePreview: desired ? "Yes" : "No",
      error: desired ? undefined : "Not a current role.",
    }),
    field,
  );
}

function controlByIdInRow(doc: Document, row: HTMLElement, id: string) {
  const element = doc.getElementById(id);
  return element instanceof HTMLElement && row.contains(element) ? element : null;
}

function employmentControl(doc: Document, row: HTMLElement, index: number, key: string, label: RegExp) {
  return controlByIdInRow(doc, row, `${key}-${index}`) ?? labelControl(row, label);
}

function educationControl(doc: Document, row: HTMLElement, index: number, key: string, label: RegExp) {
  return (
    controlByIdInRow(doc, row, `${key}--${index}`) ??
    controlByIdInRow(doc, row, `${key}-${index}`) ??
    labelControl(row, label)
  );
}

async function fillEmploymentRow(result: StructuredFillResult, args: StructuredFillArgs, row: HTMLElement, index: number, experience: MasterProfileExperience) {
  const doc = args.doc;
  fillTextControl({
    result,
    fillArgs: args,
    control: employmentControl(doc, row, index, "company-name", /\bcompany\b/i),
    value: experience.company,
    label: `Employment ${index + 1} company`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-company`,
    required: true,
  });
  if (args.shouldStop?.()) return;
  fillTextControl({
    result,
    fillArgs: args,
    control: employmentControl(doc, row, index, "title", /\btitle|job title|position\b/i),
    value: experience.title,
    label: `Employment ${index + 1} title`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-title`,
    required: true,
  });

  const start = parseDateParts(experience.startDate);
  const end = parseDateParts(experience.endDate);
  if (args.shouldStop?.()) return;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: employmentControl(doc, row, index, "start-date-month", /\bstart date month\b/i),
    desired: start.month,
    label: `Employment ${index + 1} start month`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-start-month`,
    required: true,
  });
  if (args.shouldStop?.()) return;
  fillTextControl({
    result,
    fillArgs: args,
    control: employmentControl(doc, row, index, "start-date-year", /\bstart date year\b/i),
    value: start.year,
    label: `Employment ${index + 1} start year`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-start-year`,
    required: true,
  });
  if (args.shouldStop?.()) return;
  const current = experience.current === true || (!experience.endDate && experience.current !== false);
  fillCheckboxControl({
    result,
    fillArgs: args,
    control: doc.getElementById(`current-role-${index}_1`) as HTMLInputElement | null,
    value: current,
    label: `Employment ${index + 1} current role`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-current`,
  });

  const endMonth = employmentControl(doc, row, index, "end-date-month", /\bend date month\b/i);
  const endYear = employmentControl(doc, row, index, "end-date-year", /\bend date year\b/i);
  if (current) {
    claimOnly(result, fieldForControl(args.fields, endMonth));
    claimOnly(result, fieldForControl(args.fields, endYear));
    return;
  }
  if (args.shouldStop?.()) return;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: endMonth,
    desired: end.month,
    label: `Employment ${index + 1} end month`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-end-month`,
    required: true,
  });
  if (args.shouldStop?.()) return;
  fillTextControl({
    result,
    fillArgs: args,
    control: endYear,
    value: end.year,
    label: `Employment ${index + 1} end year`,
    canonicalKey: "experience",
    fallbackSignature: `jobposted-greenhouse-employment-${index}-end-year`,
    required: true,
  });
}

async function fillEducationRow(result: StructuredFillResult, args: StructuredFillArgs, row: HTMLElement, index: number, education: MasterProfileEducation) {
  const doc = args.doc;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "school", /\bschool\b/i),
    desired: education.school,
    label: `Education ${index + 1} school`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-school`,
    required: true,
  });
  if (args.shouldStop?.()) return;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "degree", /\bdegree\b/i),
    desired: education.degree,
    label: `Education ${index + 1} degree`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-degree`,
    required: true,
  });
  if (args.shouldStop?.()) return;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "discipline", /\bdiscipline|field of study|major\b/i),
    desired: education.field,
    label: `Education ${index + 1} discipline`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-discipline`,
    required: true,
  });

  const start = parseDateParts(education.startDate);
  const end = parseDateParts(education.endDate);
  if (args.shouldStop?.()) return;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "start-date-month", /\bstart date month\b/i),
    desired: start.month,
    label: `Education ${index + 1} start month`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-start-month`,
    required: false,
  });
  fillTextControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "start-date-year", /\bstart date year\b/i),
    value: start.year,
    label: `Education ${index + 1} start year`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-start-year`,
    required: false,
  });
  if (args.shouldStop?.()) return;
  await fillChoiceControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "end-date-month", /\bend date month\b/i),
    desired: end.month,
    label: `Education ${index + 1} end month`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-end-month`,
    required: false,
  });
  fillTextControl({
    result,
    fillArgs: args,
    control: educationControl(doc, row, index, "end-date-year", /\bend date year\b/i),
    value: end.year,
    label: `Education ${index + 1} end year`,
    canonicalKey: "education",
    fallbackSignature: `jobposted-greenhouse-education-${index}-end-year`,
    required: false,
  });
}

export function isGreenhouseStructuredField(field: PageField) {
  const text = normalize(
    [
      field.fieldId,
      field.label,
      field.section,
      field.element.getAttribute("id"),
      field.element.getAttribute("name"),
      field.element.getAttribute("aria-label"),
    ].join(" "),
  );
  return (
    /\b(company name|title|current role|employment)\b/.test(text) ||
    /\b(school|degree|discipline|education)\b/.test(text) ||
    /\b(start date|end date)\b/.test(text)
  ) && Boolean(field.element.closest(".employment--container, .education--container, [class*='employment' i], [class*='education' i]"));
}

export async function fillGreenhouseStructuredFields(args: StructuredFillArgs): Promise<StructuredFillResult> {
  const result: StructuredFillResult = { records: [], claimedFieldIds: new Set() };
  const employment = employmentRows(args.doc)
    .sort((a, b) => a.index - b.index)
    .slice(0, Math.min(args.profile.experience.length, MAX_GREENHOUSE_ROWS));
  for (let rowIndex = 0; rowIndex < employment.length; rowIndex += 1) {
    if (args.shouldStop?.()) break;
    const profileRow = args.profile.experience[rowIndex];
    if (!profileRow) break;
    await fillEmploymentRow(result, args, employment[rowIndex]!.row, employment[rowIndex]!.index, profileRow);
  }

  const education = educationRows(args.doc)
    .sort((a, b) => a.index - b.index)
    .slice(0, Math.min(args.profile.education.length, MAX_GREENHOUSE_ROWS));
  for (let rowIndex = 0; rowIndex < education.length; rowIndex += 1) {
    if (args.shouldStop?.()) break;
    const profileRow = args.profile.education[rowIndex];
    if (!profileRow) break;
    await fillEducationRow(result, args, education[rowIndex]!.row, education[rowIndex]!.index, profileRow);
  }

  for (const field of args.fields) {
    if (isGreenhouseStructuredField(field)) result.claimedFieldIds.add(field.fieldId);
  }

  return result;
}
