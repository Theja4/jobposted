import type { ExtensionFieldFillRecord, ExtensionFieldMapping } from "@jobposted/shared";
import { optionScore } from "./text";
import type { FieldDescriptor, FillContext } from "./types";

function nativeSetter(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
}

function dispatchFieldEvents(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

function valuePreview(value: unknown) {
  if (Array.isArray(value)) return value.join(", ").slice(0, 120);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.slice(0, 120);
  return undefined;
}

function hasValue(field: FieldDescriptor) {
  const element = field.element;
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") return element.checked;
    if (element.type === "file") return Boolean(element.files?.length);
    return element.value.trim().length > 0;
  }
  if (element instanceof HTMLTextAreaElement) return element.value.trim().length > 0;
  if (element instanceof HTMLSelectElement) return Boolean(element.value);
  if (element.isContentEditable) return Boolean(element.textContent?.trim());
  return false;
}

function desiredString(value: ExtensionFieldMapping["value"]) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return "";
}

function pickOption(options: HTMLOptionElement[], value: ExtensionFieldMapping["value"]) {
  const desired = desiredString(value);
  let best: { option: HTMLOptionElement; score: number } | null = null;
  for (const option of options) {
    const score = Math.max(optionScore(option.textContent ?? "", desired), optionScore(option.value, desired));
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= 0.45 ? best.option : null;
}

function setText(element: HTMLElement, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeSetter(element, value);
  } else if (element.isContentEditable) {
    element.textContent = value;
  } else {
    element.setAttribute("value", value);
  }
  dispatchFieldEvents(element);
}

function fillSelect(select: HTMLSelectElement, value: ExtensionFieldMapping["value"]) {
  const option = pickOption(Array.from(select.options), value);
  if (!option) return false;
  select.value = option.value;
  if (select.multiple && Array.isArray(value)) {
    for (const item of Array.from(select.options)) {
      item.selected = value.some((desired) => optionScore(item.textContent ?? item.value, desired) >= 0.45);
    }
  }
  dispatchFieldEvents(select);
  return true;
}

function radioGroup(field: FieldDescriptor) {
  const element = field.element;
  if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) return [];
  const escaped = CSS.escape(element.name);
  return Array.from(
    element.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${escaped}"]`),
  );
}

function labelForRadio(input: HTMLInputElement) {
  const id = input.id ? CSS.escape(input.id) : "";
  const explicit = id ? input.ownerDocument.querySelector(`label[for="${id}"]`) : null;
  return explicit?.textContent?.trim() || input.closest("label")?.textContent?.trim() || input.value;
}

function fillRadio(field: FieldDescriptor, value: ExtensionFieldMapping["value"]) {
  const group = radioGroup(field);
  const desired = desiredString(value);
  let best: { input: HTMLInputElement; score: number } | null = null;
  for (const input of group) {
    const score = Math.max(optionScore(labelForRadio(input), desired), optionScore(input.value, desired));
    if (!best || score > best.score) best = { input, score };
  }
  if (!best || best.score < 0.4) return false;
  best.input.click();
  dispatchFieldEvents(best.input);
  return true;
}

function fillCheckbox(field: FieldDescriptor, value: ExtensionFieldMapping["value"]) {
  if (!(field.element instanceof HTMLInputElement)) return false;
  const desired = typeof value === "boolean" ? value : /^(yes|true|y|1)$/i.test(desiredString(value));
  if (field.element.checked !== desired) field.element.click();
  dispatchFieldEvents(field.element);
  return true;
}

async function attachFile(
  input: HTMLInputElement,
  url: string | null | undefined,
  filename: string,
) {
  if (!url) return false;
  const response = await fetch(url);
  if (!response.ok) return false;
  const blob = await response.blob();
  const file = new File([blob], filename, {
    type: blob.type || "application/pdf",
    lastModified: Date.now(),
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  dispatchFieldEvents(input);
  return true;
}

async function fillFile(field: FieldDescriptor, mapping: ExtensionFieldMapping, context: FillContext) {
  if (!(field.element instanceof HTMLInputElement) || field.element.type !== "file") return false;
  const resume = await context.getResume(null);
  if (mapping.canonicalKey === "documents.coverLetter") {
    return attachFile(field.element, resume.coverLetterUrl, "JobPosted-cover-letter.pdf");
  }
  return attachFile(field.element, resume.resumeUrl, "JobPosted-resume.pdf");
}

export async function fillField(
  field: FieldDescriptor,
  mapping: ExtensionFieldMapping,
  context: FillContext,
): Promise<ExtensionFieldFillRecord> {
  const base = {
    signature: field.signature,
    label: field.label,
    canonicalKey: mapping.canonicalKey,
    confidence: mapping.confidence,
    source: mapping.source,
    valuePreview: valuePreview(mapping.value),
  };

  if (mapping.canonicalKey === "unknown" || mapping.value == null) {
    return { ...base, status: field.required ? "needs_user" : "skipped" };
  }
  if (mapping.canonicalKey.startsWith("demographics.") && !context.demographicsEnabled) {
    return { ...base, status: "skipped", error: "Demographics sharing is off." };
  }
  if (!context.overwrite && hasValue(field)) {
    return { ...base, status: "skipped", error: "Already filled." };
  }

  try {
    let filled = false;
    if (field.type === "file") {
      filled = await fillFile(field, mapping, context);
    } else if (field.element instanceof HTMLSelectElement) {
      filled = fillSelect(field.element, mapping.value);
    } else if (field.type === "radio") {
      filled = fillRadio(field, mapping.value);
    } else if (field.type === "checkbox") {
      filled = fillCheckbox(field, mapping.value);
    } else if (field.type === "combobox" || field.type === "typeahead") {
      setText(field.element, desiredString(mapping.value));
      field.element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      field.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      filled = true;
    } else {
      setText(field.element, desiredString(mapping.value));
      filled = true;
    }

    if (!filled) {
      field.element.classList.add("jp-field-highlight");
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
