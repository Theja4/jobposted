import type { AdapterHint } from "./types";
import { normalizeText, visibleText } from "./text";
import type { FieldDescriptor } from "./types";

const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='image']):not([type='reset'])",
  "textarea",
  "select",
  "[role='combobox']",
  "[contenteditable='true']",
].join(",");

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

function labelFor(element: HTMLElement): string {
  const doc = element.ownerDocument;
  const aria = element.getAttribute("aria-label");
  if (aria) return visibleText(aria);

  const ariaLabelledBy = textById(doc, element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) return ariaLabelledBy;

  const id = element.getAttribute("id");
  if (id) {
    const explicit = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (explicit?.textContent) return visibleText(explicit.textContent);
  }

  const wrapping = element.closest("label");
  if (wrapping?.textContent) {
    return visibleText(wrapping.textContent.replace((element as HTMLInputElement).value ?? "", ""));
  }

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return visibleText(placeholder);

  for (const attr of ["name", "data-automation-id", "data-testid", "id"]) {
    const value = element.getAttribute(attr);
    if (value) return visibleText(value.replace(/[_-]+/g, " "));
  }

  return visibleText(element.closest("[data-automation-id], fieldset, div, section")?.textContent).slice(0, 120);
}

function fieldContext(element: HTMLElement): string {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  const section = element.closest("[data-automation-id], section, form");
  return [legend?.textContent, section?.getAttribute("data-automation-id")]
    .map(visibleText)
    .filter(Boolean)
    .join(" ");
}

function controlType(element: HTMLElement): FieldDescriptor["type"] {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return element.multiple ? "multiselect" : "select";
  if (element.getAttribute("role") === "combobox") return "combobox";
  if (element.isContentEditable) return "textarea";
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    if (type === "file") return "file";
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    if (type === "url") return "url";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "date" || type === "month") return "date";
  }
  return "text";
}

function optionsFor(element: HTMLElement): string[] {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => visibleText(option.textContent || option.value));
  }
  if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
    return Array.from(
      element.ownerDocument.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${cssEscape(element.name)}"]`,
      ),
    ).map((input) => labelFor(input) || input.value);
  }
  const ariaControls = element.getAttribute("aria-controls");
  const listbox = ariaControls ? element.ownerDocument.getElementById(ariaControls) : null;
  if (listbox) {
    return Array.from(listbox.querySelectorAll("[role='option'], option")).map((option) =>
      visibleText(option.textContent),
    );
  }
  return [];
}

function isVisible(element: HTMLElement): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const getComputedStyle = element.ownerDocument.defaultView?.getComputedStyle;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;
  return !element.closest("[hidden]");
}

function applyHints(dom: Document, fields: FieldDescriptor[], hints: AdapterHint[]) {
  for (const hint of hints) {
    const nodes = Array.from(dom.querySelectorAll<HTMLElement>(hint.selector));
    for (const node of nodes) {
      const field = fields.find((candidate) => candidate.element === node || candidate.element.contains(node));
      if (!field) continue;
      field.adapterKey = hint.key;
      field.adapterConfidence = hint.confidence ?? 0.95;
    }
  }
}

export function signatureFor(parts: {
  platform: string;
  label: string;
  context: string;
  type: string;
  options: string[];
}) {
  return normalizeText(
    [parts.platform, parts.label, parts.context, parts.type, parts.options.join("|")].join(" "),
  ).slice(0, 240);
}

export function extractFields(dom: Document, platform: string, hints: AdapterHint[] = []): FieldDescriptor[] {
  const seenRadioGroups = new Set<string>();
  const fields: FieldDescriptor[] = [];
  const elements = Array.from(dom.querySelectorAll<HTMLElement>(FIELD_SELECTOR));

  for (const element of elements) {
    if (!isVisible(element)) continue;
    if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
      if (seenRadioGroups.has(element.name)) continue;
      seenRadioGroups.add(element.name);
    }

    const label = labelFor(element);
    const context = fieldContext(element);
    const type = controlType(element);
    const options = optionsFor(element);
    const signature = signatureFor({ platform, label, context, type, options });
    if (!label && type !== "file") continue;
    fields.push({
      id: `${type}:${signature}:${fields.length}`,
      element,
      label,
      context,
      type,
      required:
        element.hasAttribute("required") ||
        element.getAttribute("aria-required") === "true" ||
        /\brequired\b/i.test(`${label} ${context}`),
      options,
      signature,
    });
  }

  applyHints(dom, fields, hints);
  return fields;
}
