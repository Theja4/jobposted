import type { ExtensionFieldFillRecord, ExtensionFieldMapping } from "@jobposted/shared";
import { looksLikeActionControl, optionScore, visibleText } from "./text";
import type { FieldDescriptor, FillContext } from "./types";

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function textById(doc: Document, id: string | null): string {
  if (!id) return "";
  return id
    .split(/\s+/)
    .map((part) => visibleText(doc.getElementById(part)?.textContent))
    .filter(Boolean)
    .join(" ");
}

function nativeSetter(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
}

function nativeCheckedSetter(element: HTMLInputElement, value: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setter?.call(element, value);
  if (element.checked !== value) element.checked = value;
}

function dispatchFieldEvents(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

function dispatchMouseSequence(element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  const MouseEventCtor = view?.MouseEvent ?? (typeof MouseEvent !== "undefined" ? MouseEvent : undefined);
  const EventCtor = MouseEventCtor ?? Event;
  for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
    try {
      element.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true }));
    } catch {
      element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }
  }
}

function dispatchInputChange(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function valuePreview(value: unknown) {
  if (Array.isArray(value)) return value.join(", ").slice(0, 120);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.slice(0, 120);
  return undefined;
}

function documentLabel(key: ExtensionFieldMapping["canonicalKey"]) {
  return key === "documents.coverLetter" ? "cover letter" : "resume/CV";
}

function isDocumentKey(key: ExtensionFieldMapping["canonicalKey"]) {
  return key === "documents.resume" || key === "documents.coverLetter";
}

function documentUrlForKey(
  key: ExtensionFieldMapping["canonicalKey"],
  docs: Awaited<ReturnType<FillContext["getResume"]>>,
  fallbackValue: ExtensionFieldMapping["value"],
) {
  const signedUrl = key === "documents.coverLetter" ? docs.coverLetterUrl : docs.resumeUrl;
  return signedUrl || (typeof fallbackValue === "string" ? fallbackValue : null);
}

function documentNameForKey(
  key: ExtensionFieldMapping["canonicalKey"],
  docs: Awaited<ReturnType<FillContext["getResume"]>>,
) {
  return key === "documents.coverLetter" ? docs.coverLetterName : docs.resumeName;
}

function documentUploadFlag(key: ExtensionFieldMapping["canonicalKey"]) {
  if (key === "documents.resume") return "jpResumeAttached";
  if (key === "documents.coverLetter") return "jpCoverLetterAttached";
  return null;
}

function documentUploadAlreadyHandled(doc: Document, key: ExtensionFieldMapping["canonicalKey"]) {
  const flag = documentUploadFlag(key);
  return Boolean(flag && doc.documentElement.dataset[flag] === "true");
}

function markDocumentUploadHandled(doc: Document, key: ExtensionFieldMapping["canonicalKey"]) {
  const flag = documentUploadFlag(key);
  if (flag) doc.documentElement.dataset[flag] = "true";
}

// A successfully attached file lives in the page (Workday renders a file-upload-item with a delete
// control), but the per-document jpResumeAttached flag is wiped whenever Workday reloads between
// steps, and the <input type=file> reads empty once Workday has consumed the file — so without a
// DOM check a second fill pass happily attaches the same resume again. Detect the rendered item.
const ATTACHED_FILE_INDICATOR =
  "[data-automation-id='file-upload-item'], [data-automation-id*='file-upload-item' i], [data-automation-id*='delete-file' i], [data-automation-id*='deleteFile' i]";

// Widen from the file input to the largest ancestor that still owns just this one file input — that
// is this upload widget's boundary, so an adjacent resume/cover-letter upload can't trip the check.
function uploadWidgetRoot(input: HTMLElement) {
  let widget: HTMLElement = input;
  for (let node = input.parentElement; node && node !== input.ownerDocument.body; node = node.parentElement) {
    if (node.querySelectorAll("input[type='file']").length > 1) break;
    widget = node;
  }
  return widget;
}

function documentAlreadyAttachedInDom(input: HTMLElement) {
  return Boolean(uploadWidgetRoot(input).querySelector(ATTACHED_FILE_INDICATOR));
}

function filenameFromContentDisposition(header: string | null) {
  if (!header) return null;
  const encoded = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
    } catch {
      return encoded.trim().replace(/^"|"$/g, "");
    }
  }
  return /filename\s*=\s*"([^"]+)"/i.exec(header)?.[1] ?? /filename\s*=\s*([^;]+)/i.exec(header)?.[1]?.trim() ?? null;
}

function extensionForMime(mime: string) {
  const normalized = mime.toLowerCase().split(";")[0]?.trim();
  if (normalized === "application/pdf") return "pdf";
  if (normalized === "application/msword") return "doc";
  if (normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (normalized === "text/plain") return "txt";
  return "pdf";
}

function filenameFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

function safeDocumentFilename(url: string, contentDisposition: string | null, mime: string, label: string, preferredName?: string | null) {
  const raw = preferredName || filenameFromContentDisposition(contentDisposition) || filenameFromUrl(url) || label;
  const clean = raw.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || label;
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  return `${clean}.${extensionForMime(mime)}`;
}

function fileListFromFile(element: HTMLElement, file: File) {
  type DataTransferConstructor = new () => DataTransfer;
  type FileConstructor = new (fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) => File;
  const view = element.ownerDocument.defaultView as (Window & { DataTransfer?: DataTransferConstructor; File?: FileConstructor }) | null;
  const PageFile = view?.File ?? (typeof File !== "undefined" ? File : undefined);
  let pageFile = file;
  if (PageFile) {
    let isSameRealmFile = false;
    try {
      isSameRealmFile = file instanceof PageFile;
    } catch {
      isSameRealmFile = false;
    }
    if (!isSameRealmFile) {
      pageFile = new PageFile([file], file.name, { type: file.type, lastModified: file.lastModified });
    }
  }
  const DataTransferCtor = view?.DataTransfer ?? (typeof DataTransfer !== "undefined" ? DataTransfer : undefined);
  if (DataTransferCtor) {
    try {
      const transfer = new DataTransferCtor();
      transfer.items.add(pageFile);
      return transfer.files;
    } catch {
      // Some DOM shims expose DataTransfer without a constructible implementation.
    }
  }
  const files = [pageFile] as unknown as FileList;
  Object.defineProperty(files, "item", {
    configurable: true,
    value: (index: number) => (index === 0 ? pageFile : null),
  });
  return files;
}

function assignFileInput(input: HTMLInputElement, file: File) {
  const files = fileListFromFile(input, file);
  try {
    input.files = files;
  } catch {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: files,
    });
  }
  dispatchFieldEvents(input);
  return Boolean(input.files?.length);
}

async function fetchDocumentFile(url: string, label: string, preferredName?: string | null) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Could not download ${label}.`);
  const blob = await response.blob();
  const mime = response.headers.get("content-type") || blob.type || "application/pdf";
  const filename = safeDocumentFilename(url, response.headers.get("content-disposition"), mime, label, preferredName);
  return new File([blob], filename, { type: mime });
}

function normalizedText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fieldOwnIntentText(field: FieldDescriptor) {
  const element = field.element;
  const attrs = [
    field.label,
    element.getAttribute("type"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("autocomplete"),
    element.getAttribute("aria-label"),
    element.getAttribute("placeholder"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-automation-id"),
  ];
  return normalizedText(attrs.filter(Boolean).join(" "));
}

function fieldIntentText(field: FieldDescriptor) {
  return normalizedText([fieldOwnIntentText(field), field.context].filter(Boolean).join(" "));
}

function looksLikePhoneField(field: FieldDescriptor) {
  return /\b(phone|mobile|telephone|tel)\b/.test(fieldIntentText(field));
}

function looksLikeCountryField(field: FieldDescriptor) {
  return /\bcountry\b/.test(fieldOwnIntentText(field));
}

function looksLikePhoneCountryField(field: FieldDescriptor) {
  const ownText = fieldOwnIntentText(field);
  const text = fieldIntentText(field);
  return /\bcountry\b/.test(ownText) && /\b(phone|mobile|telephone|tel|calling|dial)\b/.test(text);
}

function phoneCountryChoiceContainer(field: FieldDescriptor) {
  const element = field.element;
  if (element instanceof HTMLSelectElement) return element;
  if (element.getAttribute("role") === "combobox" || element.hasAttribute("aria-haspopup")) return element;
  const label = normalizedText(field.label);
  const context = normalizedText(field.context);
  if (!/\bcountry\b/.test(`${label} ${context}`) || !/\b(phone|mobile|telephone|tel|code|calling|dial)\b/.test(`${label} ${context}`)) {
    return element;
  }

  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    const automationId = normalizedText(node.getAttribute("data-automation-id"));
    const text = normalizedText(`${node.textContent ?? ""} ${automationId}`);
    const controlCount = node.querySelectorAll("input:not([type='hidden']), textarea, select, [role='combobox'], [aria-haspopup='listbox']").length;
    if (controlCount > 3) return element;
    if (
      /\bcountry\b/.test(text) &&
      /\b(phone|mobile|telephone|tel|code|calling|dial)\b/.test(text) &&
      (automationId.startsWith("formfield") ||
        automationId.includes("phone") ||
        automationId.includes("country") ||
        node.querySelector("[role='combobox'], [aria-haspopup='listbox'], input"))
    ) {
      return node;
    }
  }
  return element;
}

function phoneCountryFillField(field: FieldDescriptor, platform: FillContext["platform"]): FieldDescriptor {
  if (platform !== "workday") return field;
  const container = phoneCountryChoiceContainer(field);
  if (container === field.element && (field.type === "combobox" || field.type === "typeahead")) return field;
  return {
    ...field,
    element: container,
    type: container instanceof HTMLSelectElement ? "select" : "combobox",
    context: [field.context, field.label].filter(Boolean).join(" "),
  };
}

function setPromptSearchText(element: HTMLElement, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeSetter(element, value);
  } else if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    element.textContent = value;
    element.setAttribute("aria-valuetext", value);
  } else {
    element.setAttribute("value", value);
  }
  dispatchInputChange(element);
}

function pressEnter(element: HTMLElement) {
  const init = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit;
  element.dispatchEvent(new KeyboardEvent("keydown", init));
  element.dispatchEvent(new KeyboardEvent("keypress", init));
  element.dispatchEvent(new KeyboardEvent("keyup", init));
}

function workdayPhoneCountryInput(field: FieldDescriptor) {
  const direct = editableTarget(field.element);
  if (direct) return direct;
  const container = phoneCountryChoiceContainer(field);
  if (container !== field.element) return editableTarget(container) ?? container;
  return field.element;
}

async function fillWorkdayPhoneCountryCode(field: FieldDescriptor, value: ExtensionFieldMapping["value"], countryHint: string | null | undefined) {
  const code = callingCodeDigits(value, countryHint);
  if (!code) return false;
  const target = workdayPhoneCountryInput(field);
  target.focus?.();
  activateElement(target);
  await sleep(80);
  setPromptSearchText(target, `+${code}`);
  await sleep(120);
  pressEnter(target);
  dispatchInputChange(target);
  await sleep(450);
  return true;
}

function isPhoneNumberKey(key: ExtensionFieldMapping["canonicalKey"]) {
  return key === "identity.phone" || key === "identity.phoneNational";
}

function isReferralSourceKey(key: ExtensionFieldMapping["canonicalKey"]) {
  const text = normalizedText(key);
  return key.startsWith("answers.") && /\b(?:referral source|job source|application source|candidate source|source)\b/.test(text);
}

function isExactChoiceKey(key: ExtensionFieldMapping["canonicalKey"]) {
  return key === "answers.workday_phone_device_type";
}

function looksLikeChoicePlaceholder(value: string) {
  return /^(select|select option|select one|choose|choose option|please select|please choose|none selected)$/.test(normalizedText(value));
}

function referralSourceOptionScore(label: string, value: string) {
  const raw = visibleText(`${label} ${value}`);
  const text = normalizedText(raw);
  if (!text || looksLikeChoicePlaceholder(raw) || looksLikeActionControl(raw)) return 0;
  if (/\blinked\s?in\b/.test(text)) return 3;
  if (/\bjob (?:board|boards|site|sites|portal|portals|posting|postings)\b/.test(text)) return 2.4;
  if (
    /\b(?:indeed|glassdoor|monster|zip\s?recruiter|wellfound|angel\s?list|angellist|otta|naukri|seek|reed|dice|builtin|hired)\b/.test(
      text,
    ) ||
    /\bgoogle jobs\b/.test(text) ||
    /\byc (?:jobs|work at startup)\b/.test(text)
  ) {
    return 2;
  }
  return 0.1;
}

function exactChoiceScore(option: string, desired: string) {
  const optionText = normalizedText(option);
  const desiredText = normalizedText(desired);
  if (!optionText || !desiredText) return 0;
  return optionText === desiredText ? 1.2 : 0;
}

function looksLikePlaceholder(value: string, field: FieldDescriptor) {
  const text = normalizedText(value);
  if (!text) return true;
  if (looksLikeChoicePlaceholder(value)) return true;
  if (
    (field.type === "combobox" || field.type === "typeahead" || field.type === "select" || field.type === "multiselect") &&
    /\b(select|select option|select one|choose|choose option|please select|please choose)$/.test(text)
  ) {
    return true;
  }
  const label = normalizedText(field.label);
  const context = normalizedText(field.context);
  const placeholder = normalizedText(field.element.getAttribute("placeholder"));
  if ((label && text === label) || (context && text === context) || (placeholder && text === placeholder)) return true;

  // Some Greenhouse-style controls put the question label and the placeholder inside
  // the same clickable combobox. "Question text Select..." is still empty.
  const withoutPrompt = normalizedText(
    text
      .replace(label, " ")
      .replace(context, " ")
      .replace(placeholder, " "),
  );
  return /^(select|select option|select one|choose|choose option|please select|please choose|none selected)?$/.test(withoutPrompt);
}

function valueEchoesPrompt(field: FieldDescriptor, value: ExtensionFieldMapping["value"]) {
  if (typeof value !== "string") return false;
  const text = normalizedText(value);
  if (!text) return false;
  const label = normalizedText(field.label);
  const context = normalizedText(field.context);
  const prompt = normalizedText(`${field.label} ${field.context}`);
  const enoughWords = text.split(/\s+/).filter(Boolean).length >= 4;
  return Boolean(text === label || text === context || text === prompt || (enoughWords && (prompt.includes(text) || text.includes(prompt))));
}

function choiceIsSelected(element: HTMLElement) {
  if (element instanceof HTMLInputElement && (element.type === "radio" || element.type === "checkbox")) {
    return element.checked === true || element.hasAttribute("checked");
  }
  if (
    element.getAttribute("aria-checked") === "true" ||
    element.getAttribute("aria-selected") === "true" ||
    element.getAttribute("aria-pressed") === "true"
  ) {
    return true;
  }
  const state = normalizedText(element.getAttribute("data-state") || element.getAttribute("data-selected"));
  if (/^(active|checked|on|selected|true)$/.test(state)) return true;
  return Array.from(element.classList).some((token) => /^(active|checked|selected)$/.test(normalizedText(token)));
}

function radioOrButtonGroupHasValue(field: FieldDescriptor) {
  if (field.type !== "radio") return false;
  return radioGroup(field).some(choiceIsSelected);
}

function hasValue(field: FieldDescriptor) {
  if (radioOrButtonGroupHasValue(field)) return true;
  const element = field.element;
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") return element.checked === true || element.hasAttribute("checked");
    if (element.type === "file") return Boolean(element.files?.length);
    return !looksLikePlaceholder(element.value, field);
  }
  if (element instanceof HTMLTextAreaElement) return !looksLikePlaceholder(element.value, field);
  if (element instanceof HTMLSelectElement) {
    const selected = Array.from(element.options).find((option) => option.selected || option.hasAttribute("selected"));
    const value = typeof element.value === "string" ? element.value : (selected?.value ?? "");
    if (!selected && !value) return false;
    return !looksLikePlaceholder(fieldCurrentText(field), field);
  }
  if (element.getAttribute("role") === "radio" || element.getAttribute("role") === "checkbox") {
    return element.getAttribute("aria-checked") === "true";
  }
  if (element.getAttribute("role") === "combobox" || element.hasAttribute("aria-haspopup")) {
    const text = visibleText(element.getAttribute("aria-valuetext") || element.textContent);
    return !looksLikePlaceholder(text, field);
  }
  if (looksLikeStructuredChoiceRoot(element)) return !looksLikePlaceholder(fieldCurrentText(field), field);
  if (element.getAttribute("role") === "textbox") return !looksLikePlaceholder(visibleText(element.textContent || element.getAttribute("aria-valuetext")), field);
  if (element.isContentEditable) return !looksLikePlaceholder(element.textContent ?? "", field);
  return false;
}

function structuredChoiceDisplayText(element: HTMLElement) {
  const display = element.querySelector<HTMLElement>(
    [
      "[class*='select__single-value' i]",
      "[class*='select2-chosen' i]",
      "[class*='single-value' i]",
      "[data-testid*='selected' i]",
      "[aria-live='polite']",
    ].join(","),
  );
  return visibleText(display?.textContent || display?.getAttribute("aria-label"));
}

function textWithoutTransientChoiceContent(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      [
        "input",
        "textarea",
        "[role='textbox']",
        "[role='listbox']",
        "[role='menu']",
        "[role='option']",
        "[role='menuitem']",
        "[class*='option' i]",
      ].join(","),
    )
    .forEach((node) => node.remove());
  return visibleText(clone.textContent || clone.getAttribute("aria-label") || clone.getAttribute("value"));
}

function committedChoiceText(field: FieldDescriptor) {
  const element = field.element;
  if (element instanceof HTMLSelectElement) return fieldCurrentText(field);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return "";

  const structuredDisplay = structuredChoiceDisplayText(element);
  if (structuredDisplay) return structuredDisplay;

  const ariaValue = visibleText(element.getAttribute("aria-valuetext"));
  if (ariaValue && !looksLikePlaceholder(ariaValue, field)) return ariaValue;

  const selected = uniqueElements([element, ...comboboxCandidateRoots(field)]).flatMap((root) =>
    Array.from(
      root.querySelectorAll<HTMLElement>(
        "[aria-selected='true'], [aria-checked='true'], [aria-pressed='true'], input[type='radio']:checked, input[type='checkbox']:checked",
      ),
    ),
  );
  const selectedText = selected.map(labelForChoice).filter(Boolean).join(" ");
  if (selectedText) return visibleText(selectedText);

  const stableText = textWithoutTransientChoiceContent(element);
  return looksLikePlaceholder(stableText, field) ? "" : stableText;
}

function fieldCurrentText(field: FieldDescriptor) {
  const element = field.element;
  if (element instanceof HTMLSelectElement) {
    const selected = Array.from(element.options).find((option) => option.selected || option.hasAttribute("selected"));
    const value = typeof element.value === "string" ? element.value : (selected?.value ?? "");
    return visibleText(`${selected?.textContent ?? ""} ${value}`);
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return visibleText(element.value);
  const structuredDisplay = structuredChoiceDisplayText(element);
  if (structuredDisplay) return structuredDisplay;
  return visibleText(element.getAttribute("aria-valuetext") || element.textContent || element.getAttribute("value"));
}

function elementCurrentText(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return visibleText(element.value);
  return visibleText(element.getAttribute("aria-valuetext") || element.textContent || element.getAttribute("value"));
}

function fieldChoiceValueMatches(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
) {
  if (mapping.canonicalKey === "identity.phoneCountryCode") return phoneCountryMatches(field, mapping.value, countryHint);
  const current = fieldCurrentText(field);
  if (looksLikePlaceholder(current, field)) return false;
  if (isReferralSourceKey(mapping.canonicalKey)) return referralSourceOptionScore(current, "") > 0;
  const desired = desiredString(mapping.value);
  if (!desired) return false;
  if (isExactChoiceKey(mapping.canonicalKey)) {
    const currentText = normalizedText(current);
    const desiredText = normalizedText(desired);
    return currentText === desiredText || currentText === `${desiredText} ${desiredText}`;
  }
  if (typeof mapping.value === "boolean") {
    const expected = mapping.value ? "yes" : "no";
    return new RegExp(`\\b${expected}\\b`).test(normalizedText(current)) || optionScore(current, desired) >= 0.45;
  }
  return optionScore(current, desired) >= 0.45;
}

function editableValueMatches(element: HTMLElement, value: ExtensionFieldMapping["value"]) {
  const desired = desiredString(value);
  return Boolean(desired && optionScore(elementCurrentText(element), desired) >= 0.82);
}

function desiredString(value: ExtensionFieldMapping["value"]) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return "";
}

const CALLING_CODES = [
  "1",
  "7",
  "20",
  "27",
  "30",
  "31",
  "32",
  "33",
  "34",
  "36",
  "39",
  "40",
  "41",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "52",
  "55",
  "60",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "81",
  "82",
  "84",
  "86",
  "90",
  "91",
  "92",
  "93",
  "94",
  "95",
  "98",
  "212",
  "213",
  "216",
  "218",
  "234",
  "254",
  "255",
  "256",
  "351",
  "352",
  "353",
  "354",
  "355",
  "356",
  "357",
  "358",
  "359",
  "370",
  "371",
  "372",
  "373",
  "374",
  "375",
  "376",
  "377",
  "380",
  "381",
  "382",
  "383",
  "385",
  "386",
  "387",
  "389",
  "420",
  "421",
  "423",
  "852",
  "853",
  "855",
  "856",
  "880",
  "886",
  "971",
  "972",
  "973",
  "974",
  "975",
  "976",
  "977",
  "992",
  "993",
  "994",
  "995",
  "996",
  "998",
].sort((a, b) => b.length - a.length);
const COUNTRY_CALLING_CODES: Record<string, string> = {
  australia: "+61",
  canada: "+1",
  france: "+33",
  germany: "+49",
  india: "+91",
  ireland: "+353",
  singapore: "+65",
  "united kingdom": "+44",
  uk: "+44",
  "united states": "+1",
  usa: "+1",
};

function normalizedCountry(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function phoneDigits(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D+/g, "");
}

function phoneCallingCode(phone: string | null | undefined, country: string | null | undefined) {
  const raw = phone?.trim() ?? "";
  const digits = phoneDigits(raw);
  if (raw.startsWith("+")) {
    const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate));
    if (code) return `+${code}`;
    if (digits) return `+${digits.slice(0, Math.min(3, digits.length))}`;
  }
  if (digits.length > 10) {
    const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate) && digits.length > candidate.length + 6);
    if (code) return `+${code}`;
  }
  return COUNTRY_CALLING_CODES[normalizedCountry(country)] ?? null;
}

function phoneNationalNumber(phone: string | null | undefined, country: string | null | undefined) {
  let digits = phoneDigits(phone);
  const code = phoneCallingCode(phone, country)?.replace(/\D+/g, "");
  if (code && digits.startsWith(code) && digits.length > code.length + 6) digits = digits.slice(code.length);
  return digits.replace(/^0+/, "") || null;
}

function effectiveValue(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  context: FillContext,
): ExtensionFieldMapping["value"] {
  if (mapping.canonicalKey === "identity.phoneCountryCode") {
    return phoneCallingCode(context.profile.identity.phone, context.profile.location.country) ?? mapping.value ?? null;
  }
  if (mapping.canonicalKey === "identity.phone" || mapping.canonicalKey === "identity.phoneNational") {
    const national = phoneNationalNumber(context.profile.identity.phone, context.profile.location.country);
    return national ?? mapping.value ?? null;
  }
  return mapping.value;
}

function callingCodeDigits(value: ExtensionFieldMapping["value"], countryHint?: string | null) {
  const desired = desiredString(value);
  const digits = phoneDigits(desired);
  if (desired.trim().startsWith("+")) {
    const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate));
    if (code) return code;
  }
  const countryCode = COUNTRY_CALLING_CODES[normalizedCountry(countryHint)]?.replace(/\D+/g, "");
  if (countryCode) return countryCode;
  if (/^\+?\d{1,4}$/.test(desired.trim())) return digits;
  return "";
}

function optionCallingCodes(...values: string[]) {
  const codes = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/(?:^|[^\d])\+?\s*(\d{1,4})(?!\d)/g)) {
      if (match[1]) codes.add(match[1]);
    }
  }
  return codes;
}

function normalizeChoiceText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function phoneCountryOptionScore(
  optionText: string,
  optionValue: string,
  value: ExtensionFieldMapping["value"],
  countryHint: string | null | undefined,
) {
  const desiredCode = callingCodeDigits(value, countryHint);
  if (!desiredCode) return 0;
  const codes = optionCallingCodes(optionText, optionValue);
  const text = normalizeChoiceText(`${optionText} ${optionValue}`);
  const country = normalizedCountry(countryHint);
  if (codes.has(desiredCode)) return country && text.includes(country) ? 1.2 : 1;
  if (codes.size === 0 && country && text.includes(country)) return 1;
  return 0;
}

function phoneCountryMatches(
  field: FieldDescriptor,
  value: ExtensionFieldMapping["value"],
  countryHint: string | null | undefined,
) {
  const desiredCode = callingCodeDigits(value, countryHint);
  const current = phoneCountryNeedsCommittedChoice(field) ? committedChoiceText(field) : fieldCurrentText(field);
  if (!current) return false;
  const country = normalizedCountry(countryHint);
  return Boolean(
    (desiredCode && optionCallingCodes(current).has(desiredCode)) ||
      (country && normalizeChoiceText(current).includes(country)),
  );
}

function phoneCountryHasCommittedChoice(field: FieldDescriptor) {
  const current = committedChoiceText(field);
  if (!current) return false;
  if (optionCallingCodes(current).size > 0) return true;
  return phoneDigits(current).length >= 6;
}

function pickOption(
  options: HTMLOptionElement[],
  value: ExtensionFieldMapping["value"],
  canonicalKey: ExtensionFieldMapping["canonicalKey"],
  countryHint: string | null | undefined,
) {
  if (canonicalKey === "identity.phoneCountryCode") {
    let best: { option: HTMLOptionElement; score: number } | null = null;
    for (const option of options) {
      const score = phoneCountryOptionScore(option.textContent ?? "", option.value, value, countryHint);
      if (!best || score > best.score) best = { option, score };
    }
    return best && best.score > 0 ? best.option : null;
  }
  if (isReferralSourceKey(canonicalKey)) {
    let best: { option: HTMLOptionElement; score: number } | null = null;
    for (const option of options) {
      if (option.disabled) continue;
      const score = referralSourceOptionScore(option.textContent ?? "", option.value);
      if (!best || score > best.score) best = { option, score };
    }
    return best && best.score > 0 ? best.option : null;
  }

  const desired = desiredString(value);
  let best: { option: HTMLOptionElement; score: number } | null = null;
  for (const option of options) {
    const score = isExactChoiceKey(canonicalKey)
      ? Math.max(exactChoiceScore(option.textContent ?? "", desired), exactChoiceScore(option.value, desired))
      : Math.max(optionScore(option.textContent ?? "", desired), optionScore(option.value, desired));
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= (isExactChoiceKey(canonicalKey) ? 1 : 0.45) ? best.option : null;
}

export function isVisible(element: HTMLElement) {
  const getComputedStyle = element.ownerDocument.defaultView?.getComputedStyle;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")) return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;
  const rects = element.getClientRects?.();
  if (rects && Array.from(rects).some((item) => item.width > 0 && item.height > 0)) return true;
  return typeof getComputedStyle !== "function";
}

function editableTarget(element: HTMLElement): HTMLElement | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element.isContentEditable) return element;
  if (element.getAttribute("role") === "textbox") return element;
  return element.querySelector<HTMLElement>(
    "input:not([type='hidden']):not([type='button']):not([type='submit']), textarea, [contenteditable='true'], [role='textbox']",
  );
}

function uniqueElements(elements: Array<HTMLElement | null | undefined>) {
  return elements.filter((element, index, all): element is HTMLElement => Boolean(element) && all.indexOf(element) === index);
}

function comboboxControlledRoots(field: FieldDescriptor) {
  const doc = field.element.ownerDocument;
  const ids = [field.element.getAttribute("aria-controls"), field.element.getAttribute("aria-owns")]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  return uniqueElements(ids.map((id) => doc.getElementById(id) as HTMLElement | null));
}

function activeComboboxPopup(field: FieldDescriptor) {
  const active = field.element.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  return active.closest<HTMLElement>("[role='listbox'], [role='menu'], [role='dialog'], [class*='select2-drop' i], [class*='select__menu' i]");
}

function comboboxCandidateRoots(field: FieldDescriptor) {
  const controlled = comboboxControlledRoots(field);
  const activePopup = activeComboboxPopup(field);
  const scopedActivePopup =
    activePopup && (controlled.length === 0 || controlled.some((root) => root === activePopup || root.contains(activePopup)))
      ? activePopup
      : null;
  return uniqueElements([...controlled, scopedActivePopup]);
}

function looksLikeStructuredChoiceRoot(element: HTMLElement) {
  return Boolean(
    element.querySelector(
      [
        "button[aria-label*='toggle' i]",
        "[class*='select2-container' i]",
        "[class^='select__control']",
        "[class*=' select__control']",
        "[class^='select-shell']",
        "[class*=' select-shell']",
        "select option",
      ].join(","),
    ),
  );
}

function comboboxActivationTargets(field: FieldDescriptor) {
  const nested = Array.from(
    field.element.querySelectorAll<HTMLElement>(
      [
        "[role='combobox']",
        "[aria-haspopup='listbox']",
        "[aria-haspopup='menu']",
        "button[aria-label*='toggle' i]",
        "[class^='select__control']",
        "[class*=' select__control']",
        "[class^='select-shell'] > div:not([class])",
        "[class*=' select-shell'] > div:not([class])",
        "[class*='select2-container' i] a",
        "[class*='select2-container' i] [class*='select2-choice' i]",
      ].join(","),
    ),
  ).filter(isVisible);
  if (nested.length > 0) return uniqueElements(nested);
  return [field.element];
}

async function openCombobox(field: FieldDescriptor, mapping: ExtensionFieldMapping, ignoredGlobalOptions: ReadonlySet<HTMLElement>) {
  for (const target of comboboxActivationTargets(field)) {
    target.focus?.();
    activateElement(target);
    await sleep(140);
    if (comboboxOptionCandidates(field, mapping, ignoredGlobalOptions).length > 0) return;
  }
}

function comboboxEditableTargets(field: FieldDescriptor) {
  const active = field.element.ownerDocument.activeElement instanceof HTMLElement ? field.element.ownerDocument.activeElement : null;
  const roots = uniqueElements([field.element, ...comboboxCandidateRoots(field)]);
  const nested = roots.flatMap((root) => {
    const direct = editableTarget(root);
    const all = Array.from(
      root.querySelectorAll<HTMLElement>(
        "input:not([type='hidden']):not([type='button']):not([type='submit']), textarea, [contenteditable='true'], [role='textbox']",
      ),
    );
    return uniqueElements([direct, ...all]);
  });
  const activeEditable = active ? editableTarget(active) : null;
  return uniqueElements([activeEditable, ...nested]).filter(isVisible);
}

export function setText(element: HTMLElement, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeSetter(element, value);
  } else if (element.isContentEditable || element.getAttribute("role") === "textbox") {
    element.textContent = value;
    element.setAttribute("aria-valuetext", value);
  } else {
    element.setAttribute("value", value);
  }
  dispatchFieldEvents(element);
}

export function dispatchKey(element: HTMLElement, key: string) {
  const keyCode =
    key === "Escape" ? 27 : key === "Enter" ? 13 : key === "ArrowDown" ? 40 : key === "Tab" ? 9 : key.length === 1 ? key.charCodeAt(0) : 0;
  const init = {
    key,
    code: key === "Escape" ? "Escape" : key === "Enter" ? "Enter" : key === "ArrowDown" ? "ArrowDown" : key,
    keyCode,
    which: keyCode,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit;
  element.dispatchEvent(new KeyboardEvent("keydown", init));
  element.dispatchEvent(new KeyboardEvent("keyup", init));
}

function dispatchPointerMouse(element: HTMLElement, type: string) {
  const view = element.ownerDocument.defaultView ?? window;
  const rect = element.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    view,
    button: 0,
    buttons: /down$/i.test(type) ? 1 : 0,
    clientX: rect.left + Math.max(1, rect.width / 2),
    clientY: rect.top + Math.max(1, rect.height / 2),
  };
  const pointerCtor = view.PointerEvent ?? globalThis.PointerEvent;
  if (pointerCtor && type.startsWith("pointer")) {
    element.dispatchEvent(new pointerCtor(type, { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    return;
  }
  const mouseCtor = view.MouseEvent ?? globalThis.MouseEvent ?? view.Event;
  element.dispatchEvent(new mouseCtor(type.replace(/^pointer/, "mouse"), eventInit));
}

export function activateElement(element: HTMLElement) {
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    dispatchPointerMouse(element, type);
  }
}

export function activateDropdownOption(option: HTMLElement) {
  option.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  option.focus?.();
  for (const type of ["pointerover", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    dispatchPointerMouse(option, type);
  }
  dispatchFieldEvents(option);
}

function focusParkingElement(doc: Document) {
  const existing = doc.getElementById("jobposted-autofill-focus-park");
  if (existing instanceof HTMLElement) return existing;
  const button = doc.createElement("button");
  button.id = "jobposted-autofill-focus-park";
  button.type = "button";
  button.tabIndex = -1;
  button.setAttribute("aria-hidden", "true");
  button.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  doc.body?.append(button);
  return button;
}

async function dismissOpenPopups(doc: Document, field?: FieldDescriptor, selectedOption?: HTMLElement) {
  const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const expanded = Array.from(
    doc.querySelectorAll<HTMLElement>("[aria-expanded='true'], [role='combobox'], [aria-haspopup='listbox'], [aria-haspopup='menu']"),
  );
  for (const target of uniqueElements([active, selectedOption, field?.element, ...expanded])) {
    dispatchKey(target, "Escape");
    target.blur?.();
  }
  const park = focusParkingElement(doc);
  park.focus?.({ preventScroll: true });
  dispatchKey(park, "Escape");
  await sleep(90);
}

async function closeCombobox(field: FieldDescriptor, selectedOption?: HTMLElement) {
  await dismissOpenPopups(field.element.ownerDocument, field, selectedOption);
}

function dispatchTypeahead(element: HTMLElement, value: string) {
  for (const char of value) {
    element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true, cancelable: true }));
  }
}

function comboboxSearchValues(
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
) {
  const desired = desiredString(mapping.value);
  if (mapping.canonicalKey !== "identity.phoneCountryCode") return desired ? [desired] : [];
  const code = callingCodeDigits(mapping.value, countryHint);
  return Array.from(new Set([code ? `+${code}` : "", countryHint?.trim() ?? "", code ?? "", desired].filter(Boolean)));
}

function fillSelect(
  select: HTMLSelectElement,
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
) {
  const option = pickOption(Array.from(select.options), mapping.value, mapping.canonicalKey, countryHint);
  if (!option) return false;
  try {
    select.value = option.value;
  } catch {
    // Some test/embedded DOMs expose select.value as read-only; selecting the option is enough.
  }
  option.selected = true;
  if (select.multiple && Array.isArray(mapping.value)) {
    for (const item of Array.from(select.options)) {
      item.selected = mapping.value.some((desired) => optionScore(item.textContent ?? item.value, desired) >= 0.45);
    }
  }
  dispatchFieldEvents(select);
  return true;
}

function radioGroup(field: FieldDescriptor) {
  const element = field.element;
  if (element instanceof HTMLInputElement && element.type === "radio") {
    if (element.name) {
      const escaped = cssEscape(element.name);
      return Array.from(
        element.ownerDocument.querySelectorAll<HTMLElement>(`input[type="radio"][name="${escaped}"]`),
      );
    }
    const group = element.closest("fieldset, [role='radiogroup']");
    if (group) return Array.from(group.querySelectorAll<HTMLElement>("input[type='radio'], [role='radio']"));
    return [element];
  }
  if (element.getAttribute("role") === "radio") {
    const group = element.closest("[role='radiogroup'], fieldset, [data-automation-id], [data-testid]") ?? element.parentElement;
    if (group) return Array.from(group.querySelectorAll<HTMLElement>("[role='radio'], input[type='radio']"));
    return [element];
  }
  // Button-based segmented choice group: the field element is the container holding the option buttons.
  const optionButtons = optionButtonsWithin(element);
  if (optionButtons.length >= 2) return optionButtons;
  return [];
}

function optionButtonsWithin(container: HTMLElement): HTMLElement[] {
  if (container.tagName === "BUTTON") return [];
  return Array.from(container.querySelectorAll<HTMLElement>("button, [role='button']")).filter((element) => {
    if (element.getAttribute("role") === "combobox" || element.hasAttribute("aria-haspopup")) return false;
    if (element.closest("[role='listbox'], [role='menu'], [role='option'], [role='menuitem']")) return false;
    if (element.querySelector("input, textarea, select")) return false;
    if (!isVisible(element)) return false;
    const text = visibleText(element.textContent || element.getAttribute("aria-label"));
    if (!text || text.length > 40) return false;
    return !looksLikeActionControl(text);
  });
}

function labelForChoice(element: HTMLElement) {
  if (element instanceof HTMLInputElement) {
    const id = element.id ? cssEscape(element.id) : "";
    const explicit = id ? element.ownerDocument.querySelector(`label[for="${id}"]`) : null;
    return (
      visibleText(explicit?.textContent) ||
      visibleText(element.closest("label")?.textContent) ||
      visibleText(element.getAttribute("aria-label")) ||
      textById(element.ownerDocument, element.getAttribute("aria-labelledby")) ||
      element.value
    );
  }
  return (
    visibleText(element.getAttribute("aria-label")) ||
    textById(element.ownerDocument, element.getAttribute("aria-labelledby")) ||
    visibleText(element.textContent) ||
    visibleText(element.getAttribute("data-value")) ||
    visibleText(element.getAttribute("value"))
  );
}

function activateChoice(element: HTMLElement, group: HTMLElement[]) {
  if (element instanceof HTMLInputElement) {
    if (element.type === "radio") {
      for (const item of group) {
        if (item instanceof HTMLInputElement && item.type === "radio") nativeCheckedSetter(item, item === element);
      }
    }
    const label = element.closest("label");
    const explicitLabel = element.id ? element.ownerDocument.querySelector<HTMLElement>(`label[for="${cssEscape(element.id)}"]`) : null;
    const visibleTarget = label ?? explicitLabel ?? element;
    dispatchMouseSequence(visibleTarget);
    if (!element.checked) nativeCheckedSetter(element, true);
    element.click();
    dispatchFieldEvents(element);
    if (visibleTarget !== element) dispatchFieldEvents(visibleTarget);
    return;
  }
  for (const item of group) {
    if (item.getAttribute("role") === "radio") item.setAttribute("aria-checked", item === element ? "true" : "false");
  }
  element.click();
  dispatchFieldEvents(element);
}

function fillRadio(field: FieldDescriptor, mapping: ExtensionFieldMapping) {
  const group = radioGroup(field);
  const desired = desiredString(mapping.value);
  let best: { input: HTMLElement; score: number } | null = null;
  for (const input of group) {
    const label = labelForChoice(input);
    const rawValue = `${input.getAttribute("value") ?? ""} ${input.getAttribute("data-value") ?? ""}`;
    const score = isReferralSourceKey(mapping.canonicalKey)
      ? referralSourceOptionScore(label, rawValue)
      : Math.max(
          optionScore(label, desired),
          optionScore(input.getAttribute("value") ?? "", desired),
          optionScore(input.getAttribute("data-value") ?? "", desired),
        );
    if (!best || score > best.score) best = { input, score };
  }
  const threshold = isReferralSourceKey(mapping.canonicalKey) ? 0.1 : 0.4;
  if (!best || best.score < threshold) return false;
  activateChoice(best.input, group);
  if (!(best.input instanceof HTMLInputElement) && best.input.getAttribute("role") !== "radio") return true;
  return choiceIsSelected(best.input);
}

function fillCheckbox(field: FieldDescriptor, value: ExtensionFieldMapping["value"]) {
  if (!(field.element instanceof HTMLInputElement)) return false;
  const desired = typeof value === "boolean" ? value : /^(yes|true|y|1)$/i.test(desiredString(value));
  if (field.element.checked !== desired) {
    activateElement(field.element);
    if (field.element.checked !== desired) nativeCheckedSetter(field.element, desired);
  } else {
    nativeCheckedSetter(field.element, desired);
  }
  dispatchFieldEvents(field.element);
  return field.element.checked === desired;
}

function comboboxOptionCandidates(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  ignoredGlobalOptions: ReadonlySet<HTMLElement> | null = null,
) {
  const doc = field.element.ownerDocument;
  const scopedRoots = uniqueElements([field.element, ...comboboxCandidateRoots(field)]);
  const scoped = scopedRoots.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], option, li, [class*='option' i]")),
  );
  const scopedVisible = scoped.filter((option, index, all) => {
    if (all.indexOf(option) !== index) return false;
    if (option.tagName === "OPTION" && option.closest("select") !== field.element) return false;
    if (!isVisible(option)) return false;
    const text = labelForChoice(option);
    return text.length > 0;
  });
  if (scopedVisible.length > 0) return scopedVisible;

  const selectors = [
    "[role='option']",
    "[role='listbox'] [role='option']",
    "[role='listbox'] li",
    "[role='menu'] [role='menuitem']",
    "[class*='select2-drop' i] li",
    "[class*='select2-result' i]",
    "[class*='select__menu' i] [class*='option' i]",
    "[data-testid*='option' i]",
    "[class*='option' i]",
  ].join(",");
  const candidates = [...scoped, ...Array.from(doc.querySelectorAll<HTMLElement>(selectors))];
  return candidates.filter((option, index, all) => {
    if (all.indexOf(option) !== index) return false;
    if (option.tagName === "OPTION" && option.closest("select") !== field.element) return false;
    if (ignoredGlobalOptions?.has(option) && !scoped.includes(option)) return false;
    if (!isVisible(option)) return false;
    const text = labelForChoice(option);
    return text.length > 0;
  });
}

function scoreComboboxOption(
  option: HTMLElement,
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
) {
  const desired = desiredString(mapping.value);
  const label = labelForChoice(option);
  const dataValue = option.getAttribute("data-value") ?? "";
  const rawValue = option.getAttribute("value") ?? "";
  return mapping.canonicalKey === "identity.phoneCountryCode"
    ? phoneCountryOptionScore(label, `${dataValue} ${rawValue}`, mapping.value, countryHint)
    : isReferralSourceKey(mapping.canonicalKey)
      ? referralSourceOptionScore(label, `${dataValue} ${rawValue}`)
    : isExactChoiceKey(mapping.canonicalKey)
      ? Math.max(exactChoiceScore(label, desired), exactChoiceScore(dataValue, desired), exactChoiceScore(rawValue, desired))
    : Math.max(optionScore(label, desired), optionScore(dataValue, desired), optionScore(rawValue, desired));
}

function rankedComboboxOptions(
  options: HTMLElement[],
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
) {
  const threshold = mapping.canonicalKey === "identity.phoneCountryCode" ? 1 : isReferralSourceKey(mapping.canonicalKey) ? 0.1 : isExactChoiceKey(mapping.canonicalKey) ? 1 : 0.45;
  return options
    .map((option) => ({ option, score: scoreComboboxOption(option, mapping, countryHint) }))
    .filter((candidate) => candidate.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

async function pickComboboxOption(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
  ignoredGlobalOptions: ReadonlySet<HTMLElement> | null = null,
) {
  const freshCandidates = comboboxOptionCandidates(field, mapping, ignoredGlobalOptions);
  const fallbackCandidates = ignoredGlobalOptions
    && mapping.canonicalKey !== "identity.phoneCountryCode"
    ? comboboxOptionCandidates(field, mapping, null).filter((option) => ignoredGlobalOptions.has(option) && !freshCandidates.includes(option))
    : [];
  for (const candidateSet of [freshCandidates, fallbackCandidates]) {
    for (const { option } of rankedComboboxOptions(candidateSet, mapping, countryHint)) {
      activateDropdownOption(option);
      await sleep(160);
      if (!fieldChoiceValueMatches(field, mapping, countryHint)) {
        dispatchKey(option, "Enter");
        dispatchKey(field.element, "Enter");
        await sleep(100);
      }
      if (fieldChoiceValueMatches(field, mapping, countryHint)) {
        await closeCombobox(field, option);
        return true;
      }
    }
  }
  return false;
}

async function waitForComboboxOption(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
  ignoredGlobalOptions: ReadonlySet<HTMLElement> | null = null,
  timeoutMs = 900,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await pickComboboxOption(field, mapping, countryHint, ignoredGlobalOptions)) return true;
    await sleep(80);
  }
  return false;
}

function directOwnedEditableTarget(field: FieldDescriptor) {
  return editableTarget(field.element);
}

function isFreeTextCombobox(field: FieldDescriptor) {
  if (!directOwnedEditableTarget(field)) return false;
  if (field.options.length > 0) return false;
  if (comboboxControlledRoots(field).length > 0) return false;
  if (field.element.getAttribute("aria-haspopup")) return false;
  if (looksLikeStructuredChoiceRoot(field.element)) return false;
  return !looksLikePhoneCountryField(field);
}

function shouldSubmitComboboxSearch(field: FieldDescriptor, editable: HTMLElement) {
  if (field.type !== "combobox" && field.type !== "typeahead") return false;
  return Boolean(
    editable !== field.element ||
      editable.getAttribute("aria-autocomplete") === "list" ||
      editable.getAttribute("aria-controls") ||
      editable.getAttribute("aria-owns") ||
      comboboxControlledRoots(field).length > 0,
  );
}

function requiresOptionSelection(field: FieldDescriptor) {
  if (isFreeTextCombobox(field)) return false;
  const editable = directOwnedEditableTarget(field);
  return Boolean(
    editable &&
      (editable.getAttribute("aria-autocomplete") === "list" ||
        editable.getAttribute("aria-controls") ||
        editable.getAttribute("aria-owns") ||
        comboboxControlledRoots(field).length > 0),
  );
}

function phoneCountryNeedsCommittedChoice(field: FieldDescriptor) {
  return field.type === "combobox" || field.type === "typeahead" || field.type === "multiselect" || requiresOptionSelection(field);
}

async function fillCombobox(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  countryHint: string | null | undefined,
) {
  await dismissOpenPopups(field.element.ownerDocument);
  // Blind keyboard commits (ArrowDown+Enter, raw typeahead) select whatever option the widget
  // happens to highlight. For a phone country dropdown that silently picks the WRONG country
  // (e.g. Austria +43 instead of India +91 and then leaves it there), so for calling-code fields
  // we only ever commit an option we've actually scored as a match — otherwise we leave the
  // control untouched for the user instead of writing a confidently-wrong value.
  const allowBlindKeyCommit = mapping.canonicalKey !== "identity.phoneCountryCode";
  const ignoredGlobalOptions = new Set(comboboxOptionCandidates(field, mapping));
  await openCombobox(field, mapping, ignoredGlobalOptions);
  if (await waitForComboboxOption(field, mapping, countryHint, ignoredGlobalOptions)) return true;

  for (const searchValue of comboboxSearchValues(mapping, countryHint)) {
    for (const editable of comboboxEditableTargets(field)) {
      editable.focus();
      setText(editable, searchValue);
      await sleep(120);
      if (mapping.canonicalKey === "identity.phoneCountryCode" && /^\+?\d{1,4}$/.test(searchValue.trim())) {
        dispatchKey(editable, "Enter");
        dispatchFieldEvents(editable);
        await sleep(180);
        if (phoneCountryMatches(field, mapping.value, countryHint)) return true;
      }
      if (await waitForComboboxOption(field, mapping, countryHint, ignoredGlobalOptions)) return true;
      if (isFreeTextCombobox(field) && editableValueMatches(editable, mapping.value)) return true;
      if (shouldSubmitComboboxSearch(field, editable) && comboboxOptionCandidates(field, mapping, ignoredGlobalOptions).length === 0) {
        dispatchKey(editable, "Enter");
        dispatchFieldEvents(editable);
        await sleep(180);
        if (await waitForComboboxOption(field, mapping, countryHint, ignoredGlobalOptions, 700)) return true;
        if (!requiresOptionSelection(field) && fieldChoiceValueMatches(field, mapping, countryHint)) return true;
        if (isFreeTextCombobox(field) && editableValueMatches(editable, mapping.value)) return true;
      }
      if (allowBlindKeyCommit) {
        dispatchKey(editable, "ArrowDown");
        dispatchKey(editable, "Enter");
        dispatchFieldEvents(editable);
        await sleep(120);
        if (!requiresOptionSelection(field) && fieldChoiceValueMatches(field, mapping, countryHint)) return true;
        if (isFreeTextCombobox(field) && editableValueMatches(editable, mapping.value)) return true;
      }
    }

    if (allowBlindKeyCommit) {
      dispatchTypeahead(field.element, searchValue);
      await sleep(120);
      if (await waitForComboboxOption(field, mapping, countryHint, ignoredGlobalOptions)) return true;
      dispatchKey(field.element, "ArrowDown");
      dispatchKey(field.element, "Enter");
      dispatchFieldEvents(field.element);
      await sleep(120);
      if (fieldChoiceValueMatches(field, mapping, countryHint)) return true;
    }
  }

  if (mapping.canonicalKey === "identity.phoneCountryCode") {
    const direct = directOwnedEditableTarget(field);
    const code = callingCodeDigits(mapping.value, countryHint);
    if (direct && code && !requiresOptionSelection(field)) {
      setText(direct, `+${code}`);
      await sleep(80);
      if (phoneCountryMatches(field, mapping.value, countryHint)) return true;
    }
  }

  return false;
}

export async function fillField(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  context: FillContext,
): Promise<ExtensionFieldFillRecord> {
  const mappingToFill =
    isPhoneNumberKey(mapping.canonicalKey) && looksLikePhoneCountryField(field)
      ? {
          ...mapping,
          canonicalKey: "identity.phoneCountryCode" as const,
          value: phoneCallingCode(context.profile.identity.phone, context.profile.location.country),
          confidence: Math.max(mapping.confidence, 0.93),
          reason: "Recovered a phone mapping for a phone country-code field.",
        }
      : mapping;
  const effectiveMapping = {
    ...mappingToFill,
    value: effectiveValue(field, mappingToFill, context),
  };
  const isWorkdayPhoneCountryCode =
    context.platform === "workday" && effectiveMapping.canonicalKey === "identity.phoneCountryCode";
  const targetField =
    effectiveMapping.canonicalKey === "identity.phoneCountryCode" && !isWorkdayPhoneCountryCode
      ? phoneCountryFillField(field, context.platform)
      : field;
  const base = {
    signature: field.signature,
    label: field.label,
    canonicalKey: effectiveMapping.canonicalKey,
    confidence: effectiveMapping.confidence,
    source: effectiveMapping.source,
    valuePreview: valuePreview(effectiveMapping.value),
  };
  const canResolveDocumentUpload = field.type === "file" && isDocumentKey(effectiveMapping.canonicalKey);

  if (effectiveMapping.canonicalKey === "unknown" || (effectiveMapping.value == null && !canResolveDocumentUpload)) {
    return { ...base, status: field.required ? "needs_user" : "skipped" };
  }
  if (effectiveMapping.canonicalKey.startsWith("demographics.") && !context.demographicsEnabled) {
    return { ...base, status: "skipped", error: "Demographics sharing is off." };
  }
  if (
    isPhoneNumberKey(effectiveMapping.canonicalKey) &&
    (field.type === "combobox" || field.type === "typeahead" || field.type === "select" || field.type === "multiselect")
  ) {
    field.element.classList.add("jp-field-highlight");
    return { ...base, status: field.required ? "needs_user" : "skipped", error: "Refused to write phone number into a choice control." };
  }
  if (
    isPhoneNumberKey(effectiveMapping.canonicalKey) &&
    !looksLikePhoneField(field)
  ) {
    field.element.classList.add("jp-field-highlight");
    return { ...base, status: field.required ? "needs_user" : "skipped", error: "Refused to write phone number into a non-phone field." };
  }
  if (
    isPhoneNumberKey(effectiveMapping.canonicalKey) &&
    looksLikeCountryField(field)
  ) {
    field.element.classList.add("jp-field-highlight");
    return { ...base, status: field.required ? "needs_user" : "skipped", error: "Refused to write phone number into a country field." };
  }
  if (valueEchoesPrompt(field, effectiveMapping.value)) {
    field.element.classList.add("jp-field-highlight");
    return { ...base, status: field.required ? "needs_user" : "skipped", error: "Saved answer matches the question." };
  }
  const alreadyFilled =
    effectiveMapping.canonicalKey === "identity.phoneCountryCode" && phoneCountryNeedsCommittedChoice(targetField)
      ? phoneCountryHasCommittedChoice(targetField)
      : hasValue(targetField);
  if (alreadyFilled) {
    if (field.type === "file" && isDocumentKey(effectiveMapping.canonicalKey)) {
      markDocumentUploadHandled(field.element.ownerDocument, effectiveMapping.canonicalKey);
    }
    return { ...base, status: "skipped", error: "Already filled." };
  }
  if (isWorkdayPhoneCountryCode) {
    const filled = await fillWorkdayPhoneCountryCode(field, effectiveMapping.value, context.profile.location.country);
    if (!filled) {
      field.element.classList.add("jp-field-highlight");
      return { ...base, status: field.required ? "needs_user" : "skipped", error: "No country code available." };
    }
    return { ...base, status: "filled" };
  }
  if (field.type === "file") {
    const label = documentLabel(effectiveMapping.canonicalKey);
    try {
      if (!(field.element instanceof HTMLInputElement)) {
        field.element.classList.add("jp-field-highlight");
        return { ...base, status: field.required ? "needs_user" : "skipped", error: `Could not attach ${label} automatically.` };
      }
      if (
        documentUploadAlreadyHandled(field.element.ownerDocument, effectiveMapping.canonicalKey) ||
        documentAlreadyAttachedInDom(field.element)
      ) {
        markDocumentUploadHandled(field.element.ownerDocument, effectiveMapping.canonicalKey);
        return { ...base, status: "skipped", error: `Already attached ${label}.` };
      }
      const docs = await context.getResume(null);
      const documentUrl = documentUrlForKey(effectiveMapping.canonicalKey, docs, effectiveMapping.value);
      const documentName = documentNameForKey(effectiveMapping.canonicalKey, docs);
      if (!documentUrl) {
        if (field.required) field.element.classList.add("jp-field-highlight");
        return { ...base, status: field.required ? "needs_user" : "skipped", error: `No ${label} available.` };
      }
      const file = await fetchDocumentFile(documentUrl, label, documentName);
      if (!assignFileInput(field.element, file)) {
        field.element.classList.add("jp-field-highlight");
        return { ...base, status: field.required ? "needs_user" : "skipped", error: `Could not attach ${label} automatically.` };
      }
      markDocumentUploadHandled(field.element.ownerDocument, effectiveMapping.canonicalKey);
      return { ...base, status: "filled", valuePreview: file.name };
    } catch (error) {
      field.element.classList.add("jp-field-highlight");
      return {
        ...base,
        status: "failed",
        error: error instanceof Error ? error.message : `Could not attach ${label}.`,
      };
    }
  }

  try {
    let filled = false;
    if (targetField.element instanceof HTMLSelectElement) {
      filled = fillSelect(targetField.element, effectiveMapping, context.profile.location.country);
    } else if (targetField.type === "radio") {
      filled = fillRadio(targetField, effectiveMapping);
    } else if (targetField.type === "checkbox") {
      filled = fillCheckbox(targetField, effectiveMapping.value);
    } else if (targetField.type === "combobox" || targetField.type === "typeahead") {
      filled = await fillCombobox(targetField, effectiveMapping, context.profile.location.country);
    } else {
      setText(targetField.element, desiredString(effectiveMapping.value));
      filled = true;
    }

    if (!filled) {
      targetField.element.classList.add("jp-field-highlight");
      return { ...base, status: field.required ? "needs_user" : "skipped", error: "No matching option." };
    }
    return { ...base, status: "filled" };
  } catch (error) {
    field.element.classList.add("jp-field-highlight");
    return {
      ...base,
      status: "failed",
      error: error instanceof Error ? error.message : "Fill failed.",
    };
  }
}
