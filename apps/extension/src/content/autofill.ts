import type {
  ExtensionAutofillPageField,
  ExtensionAutofillPlan,
  ExtensionAutofillPlanItem,
  ExtensionFieldControl,
  ExtensionFieldFillRecord,
  ExtensionResumeResponse,
  MasterProfile,
} from "@jobposted/shared";
import type { PlatformFillStrategy } from "./fill-strategy";
import { workdayRepeaterHint } from "./workday";

export interface PageField extends ExtensionAutofillPageField {
  element: HTMLElement;
  elements: HTMLElement[];
  signature: string;
}

export interface ApplyAutofillPlanArgs {
  fields: PageField[];
  plan: ExtensionAutofillPlanItem[];
  getResume: () => Promise<ExtensionResumeResponse | null>;
  strategy?: PlatformFillStrategy | null;
  shouldStop?: () => boolean;
  onFieldStart?: (field: PageField, item: ExtensionAutofillPlanItem) => void;
  onField?: (record: ExtensionFieldFillRecord) => void;
}

const CONTROL_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='image']):not([type='reset'])",
  "textarea",
  "select",
  "[role='combobox']",
  "[role='listbox']",
  "[aria-haspopup='listbox']",
  "[aria-haspopup='menu']",
  "[aria-haspopup='true']",
  "[role='textbox']",
  "[role='radio']",
  "[role='checkbox']",
  "[contenteditable='true']",
].join(",");

const ADD_BUTTON_SELECTOR = "button, [role='button'], input[type='button']";
const FULL_OPTIONS_LIMIT = 30;
const RANKED_OPTIONS_LIMIT = 16;
const DICTIONARY_OPTIONS_LIMIT = 8;
const SECTION_HEADING_SELECTOR = "h1,h2,h3,h4,legend,[role='heading'],[data-automation-id='stepName']";
const SECTION_CONTAINER_SELECTOR = [
  "section",
  "fieldset",
  "[data-testid]",
  "[data-automation-id]",
  "[class*='section' i]",
  "[class*='education' i]",
  "[class*='experience' i]",
  "[class*='employment' i]",
  "[id*='education' i]",
  "[id*='experience' i]",
  "[id*='employment' i]",
].join(",");
const MAX_REPEATER_ROWS = 12;

type OptionDictionary = NonNullable<ExtensionAutofillPageField["optionDictionary"]>;

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function compactNormalized(value: unknown) {
  return normalize(value).replace(/\s+/g, "");
}

function textTokens(value: unknown) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function startsWithTokenPhrase(value: string, prefix: string) {
  return value === prefix || value.startsWith(`${prefix} `);
}

function slug(value: string) {
  return normalize(value).replace(/\s+/g, "-").slice(0, 72) || "field";
}

function textMatchScore(wanted: string, option: string) {
  const a = normalize(wanted);
  const b = normalize(option);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (compactNormalized(a) === compactNormalized(b)) return 0.98;
  if (startsWithTokenPhrase(b, a) || startsWithTokenPhrase(a, b)) return 0.94;
  if (a.length >= 4 && b.includes(a)) return 0.88;
  if (b.length >= 4 && a.includes(b)) return 0.86;
  const aTokens = textTokens(a);
  const bTokens = new Set(textTokens(b));
  if (aTokens.length === 0 || bTokens.size === 0) return 0;
  const overlap = aTokens.filter((token) => bTokens.has(token)).length;
  if (overlap === 0) return 0;
  if (aTokens.length === 1) return 0.72;
  return overlap / Math.max(aTokens.length, bTokens.size);
}

function visibleText(value: unknown) {
  return clean(value);
}

function isPlaceholderOption(value: string) {
  return /^(select|select\.\.\.|select option|select one|choose|choose\.\.\.|choose option|please select|please choose|--|none selected)$/i.test(
    visibleText(value),
  );
}

function looksLikeActionControl(value: string) {
  return /\b(?:add|attach|upload|browse|choose file|dropbox|manual|manually|remove|delete|cancel|submit|apply|send|save|next|continue|back|previous|close|locate me)\b/i.test(
    visibleText(value),
  );
}

function hasClassToken(element: HTMLElement, token: string) {
  return Array.from(element.classList).some((item) => item === token);
}

function isReactSelectRoot(element: HTMLElement) {
  return (
    hasClassToken(element, "select") &&
    Boolean(
      element.querySelector(
        [
          "button[aria-label*='toggle' i]",
          "[class^='select__control']",
          "[class*=' select__control']",
          "input[class*='select__input' i]",
          "[class^='select-shell']",
          "[class*=' select-shell']",
        ].join(","),
      ),
    )
  );
}

function select2FieldRoot(element: HTMLElement) {
  const select2 = element.closest<HTMLElement>("[class*='select2-container' i]");
  if (!select2) return null;
  return select2.closest<HTMLElement>(".field, fieldset, [data-testid], [data-automation-id]") ?? select2;
}

function choiceWidgetRoot(element: HTMLElement) {
  const reactSelect = element.closest<HTMLElement>(".select");
  if (reactSelect && isReactSelectRoot(reactSelect)) return reactSelect;
  const select2 = select2FieldRoot(element);
  if (select2) return select2;
  const field = element.closest<HTMLElement>(".field, fieldset, [data-testid], [data-automation-id]");
  if (field?.querySelector("[class*='select2-container' i]")) return field;
  return null;
}

function isPopupChoiceInternal(element: HTMLElement) {
  if (element instanceof HTMLSelectElement) return false;
  if (
    element.matches(
      [
        ".iti__search-input",
        "[class*='iti__search' i]",
        "[class*='select__input' i]",
        "[class*='select2-input' i]",
      ].join(","),
    ) &&
    element.closest(
      [
        ".iti__dropdown-content",
        ".iti__country-container",
        ".select__menu",
        "[class*='select__menu' i]",
        ".select2-drop",
        ".select2-results",
        "[role='listbox']",
        "[role='menu']",
      ].join(","),
    )
  ) {
    return true;
  }
  const popup = element.closest<HTMLElement>(
    [
      "[role='listbox']",
      "[role='menu']",
      ".select__menu",
      "[class*='select__menu' i]",
      ".select2-results",
      ".select2-drop",
      ".iti__country-list",
    ].join(","),
  );
  if (!popup) return false;
  return popup !== element || element.getAttribute("role") === "listbox" || element.getAttribute("role") === "menu";
}

function textById(doc: Document, id: string | null) {
  if (!id) return "";
  return id
    .split(/\s+/)
    .map((part) => visibleText(doc.getElementById(part)?.textContent))
    .filter(Boolean)
    .join(" ");
}

function isInsideJobPostedPanel(element: Element) {
  return Boolean(element.closest("#jobposted-autofill-panel-host"));
}

function isVisible(element: HTMLElement) {
  if (isInsideJobPostedPanel(element)) return false;
  if (element instanceof HTMLInputElement && /^(hidden|submit|button|image|reset)$/i.test(element.type)) return false;
  // A hidden <select> with real options is the data model behind a custom dropdown
  // widget (select2/chosen/react-select). Keep it: we read its options and fill it by
  // value + change event, which those widgets mirror back into their visible UI.
  if (element instanceof HTMLSelectElement && element.options.length > 1) return true;
  const view = element.ownerDocument.defaultView;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle?.(node);
    if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0")) {
      return false;
    }
  }
  if (hasBrowserLayout(element) && !hasRenderedBox(element)) return false;
  return true;
}

function hasBrowserLayout(element: HTMLElement) {
  const view = element.ownerDocument.defaultView;
  if (!view || typeof element.getBoundingClientRect !== "function") return false;
  const syntheticLayout = Boolean((view as Window & { __jobpostedAutofillLayout?: boolean }).__jobpostedAutofillLayout);
  const userAgent = view.navigator?.userAgent ?? "";
  if (/\b(linkedom|jsdom|happy-dom)\b/i.test(userAgent) && !syntheticLayout) return false;
  const layoutView = view as unknown as { innerWidth?: number; visualViewport?: unknown };
  return syntheticLayout || Boolean(layoutView.visualViewport || layoutView.innerWidth || element.ownerDocument.documentElement?.clientWidth);
}

function hasRenderedBox(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;
  const rects = element.getClientRects?.();
  return Boolean(rects && Array.from(rects).some((item) => item.width > 0 && item.height > 0));
}

export function countVisibleApplicationControls(doc: Document = document) {
  return Array.from(doc.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    (element) => isVisible(element) && !isPopupChoiceInternal(element),
  ).length;
}

function labelElementsText(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return "";
  return Array.from(element.labels ?? [])
    .map((label) => visibleText(label.textContent))
    .filter(Boolean)
    .join(" ");
}

function explicitLabelText(element: HTMLElement) {
  const id = element.getAttribute("id");
  if (!id) return "";
  return visibleText(element.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`)?.textContent);
}

function textWithoutControls(container: HTMLElement) {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${CONTROL_SELECTOR}, button, [role='button']`).forEach((node) => node.remove());
  return visibleText(clone.textContent);
}

function precedes(a: HTMLElement, b: HTMLElement) {
  if (a === b) return false;
  if (a.ownerDocument === b.ownerDocument) {
    const elements = Array.from(a.ownerDocument.querySelectorAll<HTMLElement>("*"));
    const aIndex = elements.indexOf(a);
    const bIndex = elements.indexOf(b);
    if (aIndex >= 0 && bIndex >= 0) return aIndex < bIndex;
  }
  try {
    return Boolean(a.compareDocumentPosition(b) & 4);
  } catch {
    return false;
  }
}

function visibleHeadingText(element: HTMLElement) {
  return visibleText(`${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("data-automation-id") ?? ""} ${element.textContent ?? ""}`);
}

function elementDescriptor(element: HTMLElement) {
  return normalize(
    `${element.id} ${typeof element.className === "string" ? element.className : ""} ${element.getAttribute("data-testid") ?? ""} ${element.getAttribute("data-automation-id") ?? ""} ${element.getAttribute("aria-label") ?? ""}`,
  );
}

function semanticSectionKind(element: HTMLElement) {
  const descriptor = elementDescriptor(element);
  if (/\b(education|school|university|college)\b/.test(descriptor)) return "Education";
  if (/\b(experience|employment|work history|job history|positions?)\b/.test(descriptor)) return "Employment";
  return "";
}

function semanticSectionContainer(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node && node !== element.ownerDocument.body; node = node.parentElement) {
    if (!node.matches(SECTION_CONTAINER_SELECTOR)) continue;
    if (semanticSectionKind(node)) return node;
  }
  return null;
}

function semanticSectionText(element: HTMLElement) {
  const container = semanticSectionContainer(element);
  return container ? semanticSectionKind(container) : "";
}

function nearestPrecedingHeading(element: HTMLElement) {
  const headings = Array.from(element.ownerDocument.querySelectorAll<HTMLElement>(SECTION_HEADING_SELECTOR)).filter(isVisible);
  let best: HTMLElement | null = null;
  for (const heading of headings) {
    if (heading === element || precedes(heading, element)) best = heading;
  }
  return best;
}

function nearestPrecedingHeadingText(element: HTMLElement) {
  const heading = nearestPrecedingHeading(element);
  return heading ? visibleHeadingText(heading) : "";
}

function scopedHeadingText(element: HTMLElement) {
  const scoped = element.closest<HTMLElement>("section, fieldset, [data-automation-id], [data-testid]");
  if (!scoped) return "";
  const headings = Array.from(scoped.querySelectorAll<HTMLElement>(SECTION_HEADING_SELECTOR)).filter(
    (heading) => isVisible(heading) && (heading === element || precedes(heading, element)),
  );
  return visibleHeadingText(headings.at(-1) ?? scoped);
}

function nearbyText(element: HTMLElement) {
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    const controls = node.querySelectorAll(CONTROL_SELECTOR);
    if (controls.length > 2) continue;
    const text = textWithoutControls(node);
    if (/[a-z0-9]/i.test(text)) return text.slice(0, 180);
  }
  return "";
}

function labelFor(element: HTMLElement): string {
  const doc = element.ownerDocument;
  const aria = visibleText(element.getAttribute("aria-label"));
  if (aria) return aria;
  const labelled = textById(doc, element.getAttribute("aria-labelledby"));
  if (labelled) return labelled;
  const native = labelElementsText(element);
  if (native) return native;
  const id = element.getAttribute("id");
  if (id) {
    const explicit = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (explicit?.textContent) return visibleText(explicit.textContent);
  }
  const wrapping = element.closest("label");
  if (wrapping?.textContent) return visibleText(wrapping.textContent.replace((element as HTMLInputElement).value ?? "", ""));
  const container = element.closest<HTMLElement>(".field, fieldset, [data-testid], [data-automation-id], [class*='field' i], div");
  const nearbyLabel = container?.querySelector<HTMLElement>(
    "label, legend, [data-testid*='label' i], [data-automation-id*='label' i], [class*='label' i], [class*='heading' i]",
  );
  if (nearbyLabel && !nearbyLabel.contains(element) && nearbyLabel.textContent) {
    const text = visibleText(nearbyLabel.textContent);
    if (text) return text;
  }
  const placeholder = visibleText(element.getAttribute("placeholder"));
  if (placeholder) return placeholder;
  const near = nearbyText(element);
  if (near) return near;
  for (const attr of ["autocomplete", "name", "data-source", "data-automation-id", "data-testid", "id"]) {
    const value = element.getAttribute(attr);
    if (value) return visibleText(value.replace(/[_-]+/g, " "));
  }
  return "Application field";
}

function sectionFor(element: HTMLElement) {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  const scoped = scopedHeadingText(element);
  const semantic = semanticSectionText(element);
  const preceding = nearestPrecedingHeadingText(element);
  return [legend?.textContent, scoped || semantic || preceding]
    .map(visibleText)
    .filter(Boolean)
    .join(" ");
}

function repeaterFor(element: HTMLElement): ExtensionAutofillPageField["repeater"] {
  const workdayHint = workdayRepeaterHint(element);
  if (workdayHint) return workdayHint;
  const local =
    element.closest<HTMLElement>(
      ".select, .select__container, .input-wrapper, .field, fieldset, section, [data-automation-id], [data-testid], [class*='field' i], [class*='education' i], [class*='experience' i], [class*='employment' i], [id*='education' i], [id*='experience' i], [id*='employment' i]",
    ) ?? element;
  const text = normalize(`${labelFor(element)} ${sectionFor(element)} ${textWithoutControls(local)}`);
  if (/\b(education|school|university|college)\b/.test(text)) return "education";
  if (/\b(experience|employment|work history|employer)\b/.test(text)) return "experience";
  return null;
}

function fieldType(element: HTMLElement): ExtensionFieldControl {
  const role = element.getAttribute("role");
  if (role === "radio") return "radio";
  if (role === "checkbox") return "checkbox";
  if (role === "combobox") return "combobox";
  if (isReactSelectRoot(element) || Boolean(element.querySelector("[class*='select2-container' i]"))) return "combobox";
  if (
    role === "textbox" &&
    (element.getAttribute("aria-autocomplete") === "list" ||
      element.getAttribute("aria-autocomplete") === "both" ||
      element.hasAttribute("aria-controls") ||
      element.hasAttribute("aria-owns"))
  ) {
    return "combobox";
  }
  if (role === "textbox") return "text";
  if (element instanceof HTMLTextAreaElement || element.isContentEditable) return "textarea";
  if (element instanceof HTMLSelectElement) return element.multiple ? "multiselect" : "select";
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    if (type === "file") return "file";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "date" || type === "month") return "date";
    if (type === "email") return "email";
    if (type === "tel") return "phone";
    if (type === "url") return "url";
    if (
      element.getAttribute("aria-autocomplete") === "list" ||
      element.getAttribute("aria-autocomplete") === "both" ||
      element.hasAttribute("aria-controls") ||
      element.hasAttribute("aria-owns") ||
      /\bselect__[a-z-]*input\b/i.test(element.className)
    ) {
      return "combobox";
    }
  }
  const haspopup = element.getAttribute("aria-haspopup");
  if (haspopup === "listbox" || haspopup === "true" || haspopup === "menu") return "combobox";
  if (element.getAttribute("role") === "listbox") return "combobox";
  return "text";
}

function isRequired(element: HTMLElement, label: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    if (element.required) return true;
  }
  return element.getAttribute("aria-required") === "true" || /\*\s*$|\brequired\b/i.test(label);
}

function optionTextForElement(element: HTMLElement) {
  return (
    visibleText(element.getAttribute("aria-label")) ||
    textById(element.ownerDocument, element.getAttribute("aria-labelledby")) ||
    visibleText(element.getAttribute("data-value")) ||
    visibleText(element.getAttribute("data-option-value")) ||
    labelElementsText(element) ||
    explicitLabelText(element) ||
    visibleText(element.closest("label")?.textContent) ||
    visibleText(element.textContent) ||
    visibleText((element as HTMLInputElement).value)
  );
}

function nativeSelectOptions(element: HTMLSelectElement) {
  return Array.from(element.options)
    .map((option) => visibleText(option.textContent || option.value))
    .filter((option) => option && !isPlaceholderOption(option));
}

function fieldContainer(element: HTMLElement): HTMLElement {
  return (
    element.closest<HTMLElement>(
      ".field, fieldset, [data-testid], [data-automation-id], [class*='field' i], [class*='question' i], [class*='form-group' i], [class*='select' i]",
    ) ??
    element.parentElement ??
    element
  );
}

export function backingSelect(element: HTMLElement): HTMLSelectElement | null {
  if (element instanceof HTMLSelectElement) return element;
  return fieldContainer(element).querySelector<HTMLSelectElement>("select");
}

function comboboxOptions(element: HTMLElement) {
  const doc = element.ownerDocument;
  const controlledIds = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  const nodes = controlledIds.flatMap((id) =>
    Array.from(doc.getElementById(id)?.querySelectorAll<HTMLElement>("[role='option'], option, li") ?? []),
  );
  // Some widgets render the listbox as a sibling without wiring aria-controls.
  nodes.push(...Array.from(fieldContainer(element).querySelectorAll<HTMLElement>("[role='option']")));
  const datalistId = element instanceof HTMLInputElement ? element.getAttribute("list") : null;
  if (datalistId) {
    nodes.push(...Array.from(doc.getElementById(datalistId)?.querySelectorAll<HTMLElement>("option") ?? []));
  }
  const listed = nodes.map((option) => visibleText(option.textContent || option.getAttribute("value")));
  // Merge in any backing native <select> (select2/chosen/react-select keep one in the DOM).
  const select = backingSelect(element);
  const merged = [...listed, ...(select ? nativeSelectOptions(select) : [])];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of merged) {
    const key = option.toLowerCase();
    if (option && !seen.has(key) && !isPlaceholderOption(option)) {
      seen.add(key);
      result.push(option);
    }
  }
  return result;
}

function mergeOptions(...groups: string[][]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const option of groups.flat()) {
    const text = visibleText(option);
    const key = normalize(text);
    if (!text || !key || seen.has(key) || isPlaceholderOption(text)) continue;
    seen.add(key);
    merged.push(text);
  }
  return merged;
}

function currentValue(element: HTMLElement, elements: HTMLElement[]) {
  if (element instanceof HTMLSelectElement) {
    const selected =
      element.selectedOptions?.[0] ??
      Array.from(element.options).find((option) => option.selected) ??
      element.options[element.selectedIndex];
    return visibleText(selected?.textContent || element.value) || null;
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === "file") return Array.from(element.files ?? []).map((file) => file.name).join(", ") || null;
    if (element.type === "checkbox") return element.checked ? "true" : "";
    if (element.type === "radio") {
      const checked = elements.find((item): item is HTMLInputElement => item instanceof HTMLInputElement && item.checked);
      return checked ? optionTextForElement(checked) : null;
    }
    return element.value || null;
  }
  if (element instanceof HTMLTextAreaElement) return element.value || null;
  if (element.isContentEditable) return visibleText(element.textContent) || null;
  const controlType = fieldType(element);
  if (controlType === "combobox" || controlType === "typeahead") {
    const display = element.querySelector<HTMLElement>(
      [
        "[class*='select__single-value' i]",
        "[class*='select2-chosen' i]",
        "[class*='single-value' i]",
        "[data-testid*='selected' i]",
      ].join(","),
    );
    const displayText = visibleText(display?.textContent || display?.getAttribute("aria-label"));
    if (displayText && !isPlaceholderOption(displayText)) return displayText;
    const ariaValue = visibleText(element.getAttribute("aria-valuetext"));
    if (ariaValue && !isPlaceholderOption(ariaValue)) return ariaValue;
    return null;
  }
  return visibleText(element.getAttribute("aria-valuetext") || element.textContent) || null;
}

function fieldId(element: HTMLElement, index: number, label: string, type: ExtensionFieldControl) {
  const base =
    element.getAttribute("id") ||
    element.getAttribute("name") ||
    element.getAttribute("data-automation-id") ||
    element.getAttribute("data-testid") ||
    label;
  return `jp-${slug(base)}-${type}-${index}`;
}

function radioGroupLabel(element: HTMLElement): string {
  // A radio group's meaning is the question (fieldset legend / radiogroup label),
  // not the first option's text ("Yes"). Prefer the group label, fall back to nearby.
  const legendText = visibleText(element.closest("fieldset")?.querySelector("legend")?.textContent);
  if (legendText) return legendText;
  const group = element.closest("[role='radiogroup']");
  const aria = visibleText(group?.getAttribute("aria-label"));
  if (aria) return aria;
  const labelledby = textById(element.ownerDocument, group?.getAttribute("aria-labelledby") ?? null);
  if (labelledby) return labelledby;
  const section = sectionFor(element);
  if (section) return section;
  return labelFor(element);
}

function buildField(element: HTMLElement, index: number, elements: HTMLElement[] = [element]): PageField {
  const type = fieldType(element);
  const label = type === "radio" && elements.length > 1 ? radioGroupLabel(element) : labelFor(element);
  const options =
    type === "select" && element instanceof HTMLSelectElement
      ? nativeSelectOptions(element)
      : type === "radio"
        ? elements.map(optionTextForElement).filter(Boolean)
        : type === "combobox" || type === "typeahead"
          ? comboboxOptions(element)
          : [];
  const id = fieldId(element, index, label, type);
  const section = sectionFor(element);
  return {
    fieldId: id,
    signature: id,
    element,
    elements,
    label,
    type,
    options,
    required: elements.some((item) => isRequired(item, label)),
    currentValue: currentValue(element, elements),
    section: section || null,
    repeater: repeaterFor(element),
    repeaterIndex: null,
  };
}

function buildChoiceWidgetField(container: HTMLElement, index: number): PageField {
  return buildField(container, index, [container]);
}

function radioGroupKey(element: HTMLInputElement) {
  const formId = element.form?.getAttribute("id") ?? "form";
  return `${formId}:${element.name || element.closest("fieldset")?.textContent || element.getAttribute("id") || "radio"}`;
}

function checkboxGroupContainer(input: HTMLInputElement): HTMLElement {
  const fieldset = input.closest<HTMLElement>("fieldset");
  if (fieldset && fieldset.querySelectorAll("input[type='checkbox']").length > 1) return fieldset;

  let candidate: HTMLElement = input.parentElement ?? input;
  for (
    let node: HTMLElement | null = input.parentElement;
    node && node.tagName !== "FORM" && node !== input.ownerDocument.body;
    node = node.parentElement
  ) {
    if (node.querySelectorAll("input[type='checkbox']").length > 1) {
      candidate = node;
      if (node.matches("fieldset, [role='group'], [class*='question' i], [class*='field' i], [class*='checkbox' i]")) {
        return node;
      }
    }
  }
  return candidate;
}

function checkboxNameSelector(input: HTMLInputElement) {
  const name = input.getAttribute("name");
  if (!name) return "";
  return `input[type='checkbox'][name="${cssEscape(name)}"]`;
}

function checkboxGroupKey(
  input: HTMLInputElement,
  container: HTMLElement,
  containerKeys: Map<HTMLElement, string>,
): string {
  const nameSelector = checkboxNameSelector(input);
  if (nameSelector) {
    const scope = input.form ?? input.ownerDocument;
    const sameName = Array.from(scope.querySelectorAll<HTMLInputElement>(nameSelector)).filter(isVisible);
    if (sameName.length > 1) {
      const formId = input.form?.getAttribute("id") || input.form?.getAttribute("name") || "form";
      return `name:${formId}:${input.getAttribute("name")}`;
    }
  }

  let key = containerKeys.get(container);
  if (!key) {
    key = `container:${containerKeys.size}`;
    containerKeys.set(container, key);
  }
  return key;
}

function checkboxGroupLabel(input: HTMLInputElement, container: HTMLElement): string {
  const legend = visibleText(input.closest("fieldset")?.querySelector("legend")?.textContent);
  if (legend) return legend;
  const describedBy = textById(input.ownerDocument, input.getAttribute("aria-describedby"));
  const description = visibleText(
    input.getAttribute("description") ||
      input.getAttribute("data-description") ||
      input.getAttribute("aria-description") ||
      describedBy,
  );
  if (description && textMatchScore(description, optionTextForElement(input)) < 0.9) return description.slice(0, 220);
  for (const node of Array.from(
    container.querySelectorAll<HTMLElement>(
      "legend, label, h1, h2, h3, h4, h5, h6, p, strong, [class*='label' i], [class*='question' i]",
    ),
  )) {
    if (node.querySelector("input")) continue;
    const text = visibleText(node.textContent);
    if (text && text.length > 3) return text.slice(0, 220);
  }
  return sectionFor(input) || "Select all that apply";
}

function buildCheckboxGroupField(elements: HTMLInputElement[], index: number, container = checkboxGroupContainer(elements[0])): PageField {
  // Multiple related checkboxes are ONE "select all that apply" question — the
  // individual boxes are its options, not separate questions.
  const label = checkboxGroupLabel(elements[0], container);
  const options = elements.map((element) => optionTextForElement(element)).filter(Boolean);
  const id = `jp-${slug(label)}-multiselect-${index}`;
  return {
    fieldId: id,
    signature: id,
    element: elements[0],
    elements,
    label,
    type: "multiselect",
    options,
    required: elements.some((element) => isRequired(element, label)),
    currentValue:
      elements
        .filter((element) => element.checked)
        .map((element) => optionTextForElement(element))
        .join(", ") || null,
    section: sectionFor(elements[0]) || null,
    repeater: null,
    repeaterIndex: null,
  };
}

function choiceButtonText(element: HTMLElement) {
  return visibleText(element.textContent || element.getAttribute("aria-label") || element.getAttribute("value") || element.getAttribute("data-value"));
}

function isChoiceButtonCandidate(element: HTMLElement) {
  if (element.tagName !== "BUTTON" && element.getAttribute("role") !== "button") return false;
  if (element.getAttribute("role") === "combobox" || element.hasAttribute("aria-haspopup")) return false;
  if (element.closest("[role='listbox'], [role='menu'], [role='option'], [role='menuitem']")) return false;
  if (element.querySelector(CONTROL_SELECTOR)) return false;
  if (!isVisible(element)) return false;
  const text = choiceButtonText(element);
  if (!text || text.length > 64) return false;
  return !looksLikeActionControl(text);
}

function buttonChoiceGroupContainer(button: HTMLElement, candidates: ReadonlySet<HTMLElement>) {
  for (let node = button.parentElement; node && node !== button.ownerDocument.body; node = node.parentElement) {
    const within = Array.from(node.querySelectorAll<HTMLElement>("button, [role='button']")).filter((candidate) => candidates.has(candidate));
    if (within.length >= 2) return node.querySelectorAll(CONTROL_SELECTOR).length === 0 ? node : null;
    if (node.querySelectorAll(CONTROL_SELECTOR).length > 0) return null;
  }
  return null;
}

function buttonChoiceGroupLabel(container: HTMLElement) {
  const labelled = textById(container.ownerDocument, container.getAttribute("aria-labelledby"));
  if (labelled) return labelled;
  const aria = visibleText(container.getAttribute("aria-label"));
  if (aria) return aria;
  const explicit = container.querySelector<HTMLElement>(
    "legend, label, h1, h2, h3, h4, h5, h6, p, strong, [class*='question' i], [class*='label' i], [class*='heading' i]",
  );
  const explicitText = visibleText(explicit?.textContent);
  if (explicitText && !explicit?.querySelector("button, [role='button']")) return explicitText.slice(0, 220);
  return textWithoutControls(container).slice(0, 220);
}

function choiceButtonSelected(element: HTMLElement) {
  if (element.getAttribute("aria-pressed") === "true" || element.getAttribute("aria-checked") === "true" || element.getAttribute("aria-selected") === "true") {
    return true;
  }
  const state = normalize(`${element.getAttribute("data-state") ?? ""} ${element.getAttribute("data-selected") ?? ""}`);
  if (/^(active|checked|on|selected|true)$/.test(state)) return true;
  return Array.from(element.classList).some((token) => /^(active|checked|selected)$/.test(normalize(token)));
}

function discoverButtonChoiceGroups(doc: Document) {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>("button, [role='button']")).filter(isChoiceButtonCandidate);
  const candidateSet = new Set(candidates);
  const groups = new Map<HTMLElement, HTMLElement[]>();
  for (const button of candidates) {
    const container = buttonChoiceGroupContainer(button, candidateSet);
    if (!container) continue;
    groups.set(container, [...(groups.get(container) ?? []), button]);
  }
  return Array.from(groups.entries()).filter(([, buttons]) => buttons.length >= 2);
}

function buildButtonChoiceGroupField(container: HTMLElement, elements: HTMLElement[], index: number): PageField | null {
  const options = elements.map(choiceButtonText).filter(Boolean);
  if (options.length < 2) return null;
  const label = buttonChoiceGroupLabel(container);
  if (!label) return null;
  const current = elements.find(choiceButtonSelected);
  const id = `jp-${slug(label)}-button-choice-${index}`;
  return {
    fieldId: id,
    signature: id,
    element: container,
    elements,
    label,
    type: "radio",
    options,
    required: isRequired(container, label) || elements.some((element) => isRequired(element, label)),
    currentValue: current ? optionTextForElement(current) : null,
    section: sectionFor(container) || null,
    repeater: null,
    repeaterIndex: null,
  };
}

export function extractPageFields(doc: Document = document): PageField[] {
  const fields: PageField[] = [];
  const seen = new Set<HTMLElement>();
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const roleRadioGroups = new Map<Element, HTMLElement[]>();
  const checkboxGroups = new Map<string, { container: HTMLElement; elements: HTMLInputElement[] }>();
  const checkboxContainerKeys = new Map<HTMLElement, string>();
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(isVisible);
  const choiceWidgetRoots = new Set<HTMLElement>();

  for (const element of candidates) {
    if (isPopupChoiceInternal(element)) {
      seen.add(element);
      continue;
    }
    const widgetRoot = choiceWidgetRoot(element);
    if (widgetRoot && widgetRoot !== element) {
      choiceWidgetRoots.add(widgetRoot);
      seen.add(element);
      continue;
    }
    if (element instanceof HTMLInputElement && element.type === "radio") {
      const key = radioGroupKey(element);
      radioGroups.set(key, [...(radioGroups.get(key) ?? []), element]);
      seen.add(element);
    } else if (element.getAttribute("role") === "radio") {
      const group = element.closest("[role='radiogroup'], fieldset, [data-testid], [data-automation-id]") ?? element.parentElement ?? element;
      roleRadioGroups.set(group, [...(roleRadioGroups.get(group) ?? []), element]);
      seen.add(element);
    } else if (element instanceof HTMLInputElement && element.type === "checkbox" && labelFor(element)) {
      const container = checkboxGroupContainer(element);
      const key = checkboxGroupKey(element, container, checkboxContainerKeys);
      const group = checkboxGroups.get(key) ?? { container, elements: [] };
      group.elements.push(element);
      checkboxGroups.set(key, group);
    }
  }

  for (const elements of radioGroups.values()) {
    if (elements.length > 0) fields.push(buildField(elements[0], fields.length, elements));
  }
  for (const elements of roleRadioGroups.values()) {
    if (elements.length > 0) fields.push(buildField(elements[0], fields.length, elements));
  }
  for (const { container, elements } of checkboxGroups.values()) {
    // 2+ related checkboxes collapse into a single multi-select field; lone
    // checkboxes (consent boxes, etc.) fall through to the per-control loop below.
    if (elements.length >= 2) {
      fields.push(buildCheckboxGroupField(elements, fields.length, container));
      elements.forEach((element) => seen.add(element));
    }
  }
  for (const root of choiceWidgetRoots) {
    fields.push(buildChoiceWidgetField(root, fields.length));
  }
  for (const [container, elements] of discoverButtonChoiceGroups(doc)) {
    const field = buildButtonChoiceGroupField(container, elements, fields.length);
    if (field) fields.push(field);
  }

  for (const element of candidates) {
    if (seen.has(element)) continue;
    if (element instanceof HTMLInputElement && element.type === "checkbox" && !labelFor(element)) continue;
    fields.push(buildField(element, fields.length));
  }

  const indexedFields = assignRepeaterIndexes(fields);
  const byId = new Map<string, PageField>();
  for (const field of indexedFields) {
    const repeaterKey = field.repeater ? `${field.repeater}:${field.repeaterIndex ?? 0}` : "single";
    const key = `${normalize(field.label)}:${field.type}:${field.options.join("|")}:${repeaterKey}`;
    if (!byId.has(key)) byId.set(key, field);
  }
  return Array.from(byId.values());
}

function repeaterFieldKey(field: PageField) {
  const text = normalize(field.label);
  if (field.repeater === "education") {
    if (/\b(school|university|college|institution)\b/.test(text)) return "school";
    if (/\bdegree\b/.test(text)) return "degree";
    if (/\b(field|major|discipline)\b/.test(text)) return "field";
    if (/\bstart\b/.test(text)) return "start";
    if (/\b(end|graduation)\b/.test(text)) return "end";
    return text || "education";
  }
  if (field.repeater === "experience") {
    if (/\b(company|employer|organization)\b/.test(text)) return "company";
    if (/\b(title|role|position)\b/.test(text)) return "title";
    if (/\bstart\b/.test(text)) return "start";
    if (/\b(end|current)\b/.test(text)) return "end";
    return text || "experience";
  }
  return "";
}

function assignRepeaterIndexes(fields: PageField[]) {
  const counters = new Map<string, number>();
  return fields.map((field) => {
    if (!field.repeater) return field;
    const key = `${field.repeater}:${repeaterFieldKey(field)}`;
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    return { ...field, repeaterIndex: index };
  });
}

function optionsLookLikeCallingCodes(options: string[]) {
  return options.some((option) => /(?:^|[^\d])\+?\s*\d{1,4}(?!\d)/.test(option));
}

function dictionaryForField(field: ExtensionAutofillPageField): OptionDictionary | null {
  const text = normalize(`${field.label} ${field.section ?? ""}`);
  if (/\b(phone|mobile|telephone|tel|calling|dial)\b.*\b(country|code)\b|\b(country|code)\b.*\b(phone|mobile|telephone|tel|calling|dial)\b/.test(text)) {
    return "phone_country_code";
  }
  if (/\bcountry\b/.test(text) && optionsLookLikeCallingCodes(field.options)) return "phone_country_code";
  if (/\bcountry\b/.test(text)) return "country";
  if (/\b(state|province|region)\b/.test(text)) return "region";
  if (/\b(school|university|college|institution)\b/.test(text)) return "school";
  if (/\blanguage\b/.test(text)) return "language";
  if (/\b(skill|technology|technologies)\b/.test(text)) return "skill";
  if (/\bcurrency\b/.test(text)) return "currency";
  if (/\b(timezone|time zone)\b/.test(text)) return "timezone";
  return null;
}

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

function phoneDigits(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D+/g, "");
}

function normalizedCountry(value: string | null | undefined) {
  return normalize(value).replace(/\s+/g, " ");
}

function phoneCallingCode(profile: MasterProfile) {
  const raw = profile.identity.phone?.trim() ?? "";
  const digits = phoneDigits(raw);
  if (raw.startsWith("+")) {
    const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate));
    if (code) return `+${code}`;
    if (digits) return `+${digits.slice(0, Math.min(3, digits.length))}`;
  }
  const country = normalizedCountry(profile.location.country ?? profile.workAuth.country);
  return COUNTRY_CALLING_CODES[country] ?? null;
}

function phoneNationalNumber(profile: MasterProfile) {
  let digits = phoneDigits(profile.identity.phone);
  const code = phoneCallingCode(profile)?.replace(/\D+/g, "");
  if (code && digits.startsWith(code) && digits.length > code.length + 6) digits = digits.slice(code.length);
  return digits.replace(/^0+/, "") || profile.identity.phone || "";
}

function compactTargets(values: Array<string | null | undefined>) {
  return values.map(clean).filter(Boolean);
}

function optionTargets(profile: MasterProfile | undefined, dictionary: OptionDictionary | null) {
  if (!profile) return [];
  const countries = compactTargets([profile.location.country, profile.workAuth.country]);
  if (dictionary === "phone_country_code") return compactTargets([phoneCallingCode(profile), ...countries]);
  if (dictionary === "country") return countries;
  if (dictionary === "region") return compactTargets([profile.location.state, profile.location.city]);
  if (dictionary === "school") return profile.education.map((item) => item.school).filter(Boolean);
  if (dictionary === "skill") return profile.skills.slice(0, 40);
  if (dictionary === "currency") return compactTargets([profile.compensation?.currency, profile.compensation?.currentCurrency]);

  return compactTargets([
    profile.identity.firstName,
    profile.identity.lastName,
    profile.identity.email,
    profile.identity.phone,
    profile.location.city,
    profile.location.state,
    profile.location.country,
    profile.workAuth.country,
    ...profile.education.flatMap((item) => [item.school, item.degree, item.field]),
    ...profile.skills.slice(0, 40),
    ...profile.answers.slice(0, 20).map((answer) => answer.value),
  ]);
}

function rankedOptions(options: string[], targets: string[], limit: number) {
  const scored = options.map((option, index) => ({
    option,
    index,
    score: Math.max(0, ...targets.map((target) => textMatchScore(target, option))),
  }));
  const matching = scored
    .filter((item) => item.score >= 0.45)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.option);
  const safety = options.filter((option) => /\b(other|none of the above|not applicable|prefer not|decline|choose not)\b/i.test(option));
  return mergeOptions(matching, safety, options).slice(0, limit);
}

function compactOptionPayload(field: ExtensionAutofillPageField, profile?: MasterProfile) {
  const options = mergeOptions(field.options);
  const optionCount = options.length;
  if (optionCount === 0) {
    return { options, optionMode: null, optionDictionary: null, optionCount: null };
  }
  if (optionCount <= FULL_OPTIONS_LIMIT) {
    return { options, optionMode: "full" as const, optionDictionary: null, optionCount };
  }

  const dictionary = dictionaryForField(field);
  if (dictionary) {
    return {
      options: rankedOptions(options, optionTargets(profile, dictionary), DICTIONARY_OPTIONS_LIMIT),
      optionMode: "local_dictionary" as const,
      optionDictionary: dictionary,
      optionCount,
    };
  }

  return {
    options: rankedOptions(options, optionTargets(profile, "large_unknown"), RANKED_OPTIONS_LIMIT),
    optionMode: "ranked_subset" as const,
    optionDictionary: "large_unknown" as const,
    optionCount,
  };
}

function isChoiceField(field: PageField) {
  return field.type === "combobox" || field.type === "typeahead" || field.type === "select";
}

function isSelectableField(field: PageField) {
  return (
    field.type === "select" ||
    field.type === "radio" ||
    field.type === "combobox" ||
    field.type === "typeahead" ||
    field.type === "multiselect" ||
    (field.options.length > 0 && field.type !== "checkbox")
  );
}

function educationPlanFieldKey(field: Pick<ExtensionAutofillPageField, "label" | "section" | "repeater">) {
  const label = normalize(field.label);
  const section = normalize(field.section ?? "");
  const inEducation = field.repeater === "education" || /\beducation\b/.test(section);
  if (!inEducation && !/\b(school|university|college|institution|degree|field|major|discipline)\b/.test(label)) return null;
  if (/\b(school|university|college|institution)\b/.test(label)) return "school" as const;
  if (/\bdegree\b/.test(label)) return "degree" as const;
  if (/\b(field|major|discipline|area of study)\b/.test(label)) return "field" as const;
  return null;
}

function profileEducationForField(field: PageField, profile: MasterProfile) {
  return profile.education[field.repeaterIndex ?? 0] ?? profile.education[0] ?? null;
}

function educationValueForField(field: PageField, profile: MasterProfile) {
  const education = profileEducationForField(field, profile);
  if (!education) return null;
  const key = educationPlanFieldKey(field);
  if (key === "school") return clean(education.school);
  if (key === "degree") return clean(education.degree);
  if (key === "field") return clean(education.field);
  return null;
}

function bestOptionMatch<T>(wanted: string, options: T[], label: (option: T) => string) {
  let best: { option: T; score: number } | null = null;
  for (const option of options) {
    const score = optionMatchScore(wanted, label(option));
    if (!best || score > best.score) best = { option, score };
  }
  return best && best.score >= 0.45 ? best : null;
}

function isUnlistedEducationOption(value: string) {
  return /\b(other|not listed|not in list|not available|not applicable|unlisted|unknown|not found|cannot find|can't find)\b/i.test(
    value,
  );
}

const EDUCATION_FALLBACK_PATTERNS = [
  /\bother\b/i,
  /\b(not listed|not in list|not available|unlisted|not found|cannot find|can't find)\b/i,
  /\b(not applicable|unknown)\b/i,
];

function educationFallbackOption<T>(
  field: Pick<ExtensionAutofillPageField, "label" | "section" | "repeater">,
  options: T[],
  label: (option: T) => string,
) {
  if (!educationPlanFieldKey(field)) return null;
  for (const pattern of EDUCATION_FALLBACK_PATTERNS) {
    const match = options.find((option) => pattern.test(label(option)));
    if (match) return match;
  }
  return options.find((option) => isUnlistedEducationOption(label(option))) ?? null;
}

function reliableEducationOption<T>(
  field: Pick<ExtensionAutofillPageField, "label" | "section" | "repeater">,
  wanted: string,
  options: T[],
  label: (option: T) => string,
) {
  const best = bestOptionMatch(wanted, options, label);
  if (best && best.score >= 0.72) return best.option;
  return educationFallbackOption(field, options, label);
}

function educationPlanItemForField(field: PageField, profile: MasterProfile): ExtensionAutofillPlanItem | null {
  const value = educationValueForField(field, profile);
  if (!value) return null;
  const option =
    field.type === "select" || field.type === "radio" || field.type === "combobox" || field.type === "typeahead" || field.type === "multiselect"
      ? reliableEducationOption(field, value, field.options, (item) => item)
      : null;
  return {
    fieldId: field.fieldId,
    action: isSelectableField(field) ? "select" : "fill",
    value,
    optionLabel: option ?? (isSelectableField(field) ? value : null),
    confidence: option ? 0.9 : 0.82,
    note: "Profile education value.",
  };
}

export function mergeProfileEducationPlan(fields: PageField[], plan: ExtensionAutofillPlan, profile: MasterProfile): ExtensionAutofillPlan {
  const replacements = new Map<string, ExtensionAutofillPlanItem>();
  const fieldById = new Map(fields.map((field) => [field.fieldId, field]));
  for (const field of fields) {
    const item = educationPlanItemForField(field, profile);
    if (item) replacements.set(field.fieldId, item);
  }
  if (replacements.size === 0) return plan;

  const mergedIds = new Set<string>();
  const deferredSchoolFields: ExtensionAutofillPlanItem[] = [];
  const mergedFields = plan.fields.flatMap((item) => {
    const replacement = replacements.get(item.fieldId);
    if (replacement) {
      mergedIds.add(item.fieldId);
      if (educationPlanFieldKey(fieldById.get(item.fieldId) ?? { label: "", section: null, repeater: null }) === "school") {
        deferredSchoolFields.push(replacement);
        return [];
      }
      return [replacement];
    }
    return [item];
  });
  for (const field of fields) {
    const replacement = replacements.get(field.fieldId);
    if (!replacement || mergedIds.has(field.fieldId)) continue;
    if (educationPlanFieldKey(field) === "school") {
      deferredSchoolFields.push(replacement);
    } else {
      mergedFields.push(replacement);
    }
  }

  return { ...plan, fields: [...mergedFields, ...deferredSchoolFields] };
}

export async function hydrateChoiceFieldOptions(
  fields: PageField[],
  options: { waitMs?: number; shouldStop?: () => boolean } = {},
) {
  const waitMs = options.waitMs ?? 160;
  for (const field of fields) {
    if (options.shouldStop?.()) break;
    if (!isChoiceField(field)) continue;

    field.options = mergeOptions(field.options, staticChoiceOptionTexts(field.element));
    if (field.options.length > 0) continue;

    const ignoredOptions = new Set(visibleGlobalChoiceOptions(field.element));
    const target = activateChoice(field.element);
    await sleep(waitMs);
    field.options = mergeOptions(field.options, visibleDynamicChoiceOptions(field.element, ignoredOptions).map(optionTextForElement));
    if (field.options.length === 0) {
      const input = searchInputForChoice(field.element);
      if (input) {
        await openSearchableChoice(field.element, input, ignoredOptions);
        field.options = mergeOptions(field.options, visibleDynamicChoiceOptions(field.element, ignoredOptions).map(optionTextForElement));
      }
    }
    closeChoice(target);
    await sleep(20);
  }
  return fields;
}

export function compactFields(fields: PageField[], profile?: MasterProfile): ExtensionAutofillPageField[] {
  return fields.map(({ element: _element, elements: _elements, signature: _signature, ...field }) => {
    const optionPayload = compactOptionPayload(field, profile);
    return { ...field, ...optionPayload };
  });
}

function valuePreview(value: unknown) {
  if (Array.isArray(value)) return value.join(", ").slice(0, 120);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.slice(0, 120);
  return undefined;
}

function recordFor(
  field: PageField,
  item: ExtensionAutofillPlanItem,
  status: ExtensionFieldFillRecord["status"],
  error?: string,
  preview?: string,
): ExtensionFieldFillRecord {
  return {
    signature: field.signature,
    label: field.label,
    required: field.required,
    canonicalKey: "unknown",
    status,
    confidence: item.confidence,
    source: item.action === "skip" ? "skip" : "llm",
    valuePreview: preview ?? item.optionLabel ?? valuePreview(item.value),
    error,
  };
}

function nativeValueSetter(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(element, value);
  if (element.value !== value) element.value = value;
}

function nativeCheckedSetter(element: HTMLInputElement, value: boolean) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  setter?.call(element, value);
  if (element.checked !== value) element.checked = value;
}

function dispatchFieldEvents(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  const FocusEventCtor = element.ownerDocument.defaultView?.FocusEvent ?? Event;
  element.dispatchEvent(new FocusEventCtor("blur", { bubbles: true }));
}

function textValue(item: ExtensionAutofillPlanItem) {
  if (typeof item.value === "boolean") return item.value ? "Yes" : "No";
  if (Array.isArray(item.value)) return item.value.join(", ");
  return typeof item.value === "string" ? item.value : item.optionLabel ?? "";
}

function looksLikePhoneNumberField(field: PageField) {
  const text = normalize(`${field.label} ${field.section ?? ""}`);
  return /\b(phone|mobile|telephone|tel)\b/.test(text) && !/\b(country|code|calling|dial)\b/.test(text);
}

function nationalPhoneText(value: string) {
  const trimmed = value.trim();
  const digits = phoneDigits(trimmed);
  if (!trimmed.startsWith("+") || digits.length < 8) return value;
  const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate));
  if (!code || digits.length <= code.length + 6) return value;
  return digits.slice(code.length).replace(/^0+/, "") || value;
}

function fillEditable(element: HTMLElement, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    nativeValueSetter(element, value);
    dispatchFieldEvents(element);
    return element.value.trim().length > 0 || value.trim().length === 0;
  }
  if (element.isContentEditable) {
    element.textContent = value;
    dispatchFieldEvents(element);
    return true;
  }
  element.focus();
  element.textContent = value;
  dispatchFieldEvents(element);
  return true;
}

function optionMatchScore(wanted: string, option: string) {
  return textMatchScore(wanted, option);
}

function bestOption<T>(wanted: string, options: T[], label: (option: T) => string) {
  return bestOptionMatch(wanted, options, label)?.option ?? null;
}

function affirmativeSingleChoiceFallback(wanted: string, options: string[]) {
  const realOptions = options.map(clean).filter((option) => option && !isPlaceholderOption(option));
  if (realOptions.length !== 1) return null;
  const wantedText = normalize(wanted);
  if (!/\b(yes|true|confirm|confirmed|agree|accept|acknowledge|consent|understand|understood)\b/.test(wantedText)) return null;
  const onlyOption = realOptions[0]!;
  return /\b(confirm|confirmed|agree|accept|acknowledge|consent|understand|understood|yes)\b/i.test(onlyOption)
    ? onlyOption
    : null;
}

function choiceActivationTarget(element: HTMLElement) {
  if (isReactSelectRoot(element)) {
    const input = element.querySelector<HTMLInputElement>("input.select__input, input[aria-autocomplete], input[role='combobox'], input:not([type='hidden'])");
    if (input) return input;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element.getAttribute("role") === "combobox" ||
    element.hasAttribute("aria-haspopup")
  ) {
    return element;
  }
  const selectors = [
    "[class^='select__control']",
    "[class*=' select__control']",
    "[class*='select2-container' i] a",
    "[class*='select2-container' i] [class*='select2-choice' i]",
    "button",
    "[role='combobox']",
    "[aria-haspopup='listbox']",
    "[aria-haspopup='menu']",
    "[class^='select-shell'] > div:not([class])",
    "[class*=' select-shell'] > div:not([class])",
    "input",
    "[role='textbox']",
  ];
  for (const selector of selectors) {
    const target = element.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return element;
}

function dispatchMouseLike(element: HTMLElement, type: string) {
  const view = element.ownerDocument.defaultView ?? window;
  const rect = element.getBoundingClientRect?.();
  const clientX = rect ? rect.left + Math.max(1, rect.width / 2) : 0;
  const clientY = rect ? rect.top + Math.max(1, rect.height / 2) : 0;
  const isDown = /(?:pointerdown|mousedown)$/i.test(type);
  const eventInit = { bubbles: true, cancelable: true, button: 0, buttons: isDown ? 1 : 0, clientX, clientY, view };
  const PointerEventCtor = view.PointerEvent ?? globalThis.PointerEvent;
  if (PointerEventCtor && type.startsWith("pointer")) {
    element.dispatchEvent(
      new PointerEventCtor(type, { ...eventInit, pointerId: 1, pointerType: "mouse", isPrimary: true }),
    );
    return;
  }
  const MouseEventCtor = view.MouseEvent ?? globalThis.MouseEvent ?? Event;
  element.dispatchEvent(new MouseEventCtor(type.replace(/^pointer/, "mouse"), eventInit));
}

function isSearchableChoiceInput(element: HTMLElement) {
  return (
    element instanceof HTMLInputElement &&
    (/\bselect__[a-z-]*input\b/i.test(element.className) ||
      element.getAttribute("role") === "combobox" ||
      element.getAttribute("aria-autocomplete") === "list" ||
      element.getAttribute("aria-autocomplete") === "both")
  );
}

function reactSelectControl(element: HTMLElement) {
  return isReactSelectRoot(element)
    ? element.querySelector<HTMLElement>("[class^='select__control'], [class*=' select__control']")
    : null;
}

function activateChoice(element: HTMLElement) {
  const target = choiceActivationTarget(element);
  element.scrollIntoView?.({ block: "center", inline: "nearest" });
  const control = reactSelectControl(element);
  if (control && control !== target) {
    dispatchMouseLike(control, "pointerdown");
    dispatchMouseLike(control, "mousedown");
    dispatchMouseLike(control, "pointerup");
    dispatchMouseLike(control, "mouseup");
    control.click();
  }
  target.focus?.();
  if (isSearchableChoiceInput(target)) {
    // React-select-like widgets often ignore synthetic mouse events on the
    // wrapper, so also open from their focused input plus keyboard nav.
    target.click();
    return target;
  }
  dispatchMouseLike(target, "pointerdown");
  dispatchMouseLike(target, "mousedown");
  dispatchMouseLike(target, "pointerup");
  dispatchMouseLike(target, "mouseup");
  target.click();
  return target;
}

async function commitSearchableChoiceByText(field: PageField, input: HTMLInputElement, targetLabel: string, selectedOptionLabel?: string) {
  const searchText = selectedOptionLabel || targetLabel;
  clearChoiceSearchText(input);
  setChoiceSearchText(input, searchText);
  await sleep(180);
  pressChoiceKey(input, "Enter");
  return waitForChoiceSelection(field, targetLabel, selectedOptionLabel ?? searchText, 500);
}

function pressChoiceKey(element: HTMLElement, key: string) {
  const KeyboardEventCtor = element.ownerDocument.defaultView?.KeyboardEvent ?? KeyboardEvent;
  const keyCode = key === "Enter" ? 13 : key === "Escape" ? 27 : key === "ArrowDown" ? 40 : key === "ArrowUp" ? 38 : 0;
  const init = { key, code: key, bubbles: true, cancelable: true, keyCode, which: keyCode } as KeyboardEventInit;
  for (const type of ["keydown", "keyup"]) {
    const event = new KeyboardEventCtor(type, init);
    for (const [prop, value] of [
      ["key", key],
      ["code", key],
      ["keyCode", keyCode],
      ["which", keyCode],
    ] as const) {
      if ((event as unknown as Record<string, unknown>)[prop]) continue;
      try {
        Object.defineProperty(event, prop, { configurable: true, value });
      } catch {
        // Some browsers expose these as read-only; the constructor init already covers them there.
      }
    }
    element.dispatchEvent(event);
  }
}

function closeChoice(element: HTMLElement) {
  const target = choiceActivationTarget(element);
  pressChoiceKey(target, "Escape");
  target.blur?.();
}

function choiceControlElements(element: HTMLElement) {
  return [
    element,
    ...Array.from(
      element.querySelectorAll<HTMLElement>(
        [
          "[aria-controls]",
          "[aria-owns]",
          "[role='combobox']",
          "[aria-haspopup='listbox']",
          "[aria-haspopup='menu']",
          "[class^='select__control']",
          "[class*=' select__control']",
          "input",
          "[role='textbox']",
        ].join(","),
      ),
    ),
  ];
}

function controlledChoiceIds(element: HTMLElement) {
  return choiceControlElements(element)
    .flatMap((control) => [control.getAttribute("aria-controls"), control.getAttribute("aria-owns")])
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
}

function controlledChoiceOptionElements(element: HTMLElement) {
  const doc = element.ownerDocument;
  return controlledChoiceIds(element).flatMap((id) =>
    Array.from(doc.getElementById(id)?.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], option, li, [data-value]") ?? []),
  );
}

function choiceOptionSelector() {
  return [
    "[role='option']",
    "[role='menuitem']",
    "option",
    "li",
    "[data-value]",
    "[data-option-value]",
    "[data-automation-id*='option' i]",
    "[data-testid*='option' i]",
    ".select2-result",
    ".select2-result-label",
    ".select2-results__option",
    ".select2-results li",
    ".select__option",
    ".select__menu [class*='option' i]",
    "[class*='select__menu' i] [class*='option' i]",
  ].join(",");
}

function visibleGlobalChoiceOptions(element: HTMLElement) {
  const doc = element.ownerDocument;
  return Array.from(
    doc.querySelectorAll<HTMLElement>(
      [
        "[role='option']",
        "[role='menuitem']",
        "[role='listbox'] li",
        "[role='menu'] li",
        "[role='listbox'] [data-value]",
        "[role='menu'] [data-value]",
        "[data-value]",
        "[data-option-value]",
        "[data-automation-id*='option' i]",
        "[data-testid*='option' i]",
        ".select2-result",
        ".select2-result-label",
        ".select2-results__option",
        ".select2-results li",
        ".select__option",
        ".select__menu [class*='option' i]",
        "[class*='select__menu' i] [class*='option' i]",
      ].join(","),
    ),
  ).filter((option) => isVisible(option) && !option.closest("#jobposted-autofill-panel-host"));
}

function visibleDynamicChoiceOptions(element: HTMLElement, ignoredOptions: ReadonlySet<HTMLElement> = new Set()) {
  const controlled = controlledChoiceOptionElements(element).filter(isVisible);
  if (controlled.length > 0) return Array.from(new Set(controlled));

  const local = Array.from(fieldContainer(element).querySelectorAll<HTMLElement>(choiceOptionSelector())).filter(isVisible);
  if (local.length > 0) return Array.from(new Set(local));

  const openPopup = visibleGlobalChoiceOptions(element).filter((option) => !ignoredOptions.has(option));
  return Array.from(new Set([...controlled, ...local, ...openPopup])).filter(isVisible);
}

function staticChoiceOptionTexts(element: HTMLElement) {
  const backing = backingSelect(element);
  const local = Array.from(
    fieldContainer(element).querySelectorAll<HTMLElement>(
      [
        "[role='option']",
        "[role='menuitem']",
        "option",
        "li",
        "[data-value]",
        "[data-option-value]",
        "[data-automation-id*='option' i]",
        "[data-testid*='option' i]",
        ".select2-result",
        ".select2-result-label",
        ".select2-results__option",
        ".select2-results li",
        ".select__option",
        ".select__menu [class*='option' i]",
        "[class*='select__menu' i] [class*='option' i]",
      ].join(","),
    ),
  );
  return mergeOptions(
    backing ? nativeSelectOptions(backing) : [],
    controlledChoiceOptionElements(element).map(optionTextForElement),
    local.map(optionTextForElement),
  );
}

function dynamicChoiceOptionTexts(element: HTMLElement) {
  const backing = backingSelect(element);
  return mergeOptions(
    backing ? nativeSelectOptions(backing) : [],
    visibleDynamicChoiceOptions(element).map(optionTextForElement),
  );
}

function searchInputForChoice(element: HTMLElement) {
  const target = choiceActivationTarget(element);
  if (target instanceof HTMLInputElement) return target;
  return element.querySelector<HTMLInputElement>("input:not([type='hidden']), [role='textbox']");
}

function setChoiceSearchText(input: HTMLInputElement, value: string) {
  nativeValueSetter(input, value);
  const InputEventCtor = input.ownerDocument.defaultView?.InputEvent ?? InputEvent;
  input.dispatchEvent(new InputEventCtor("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clearChoiceSearchText(input: HTMLInputElement) {
  nativeValueSetter(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectChoiceOption(option: HTMLElement) {
  const target =
    option.closest<HTMLElement>(
      "[role='option'], [role='menuitem'], .select2-result, .select2-results__option, .select__option, [class*='select__option' i], li, [data-value], [data-option-value]",
    ) ?? option;
  target.scrollIntoView?.({ block: "nearest" });
  dispatchMouseLike(target, "pointerover");
  dispatchMouseLike(target, "mouseover");
  dispatchMouseLike(target, "mousemove");
  dispatchMouseLike(target, "pointerdown");
  dispatchMouseLike(target, "mousedown");
  dispatchMouseLike(target, "pointerup");
  dispatchMouseLike(target, "mouseup");
  target.click();
}

function emptyRequiredChoiceMirrors(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLInputElement>(
      "input[required][aria-hidden='true'], input[required][class*='requiredInput' i]",
    ),
  ).filter((input) => visibleText(input.value).length === 0);
}

function filledRequiredChoiceMirrors(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLInputElement>(
      "input[required][aria-hidden='true'], input[required][class*='requiredInput' i]",
    ),
  )
    .map((input) => visibleText(input.value))
    .filter(Boolean);
}

function selectedChoiceText(field: PageField) {
  const element = field.element;
  if (element instanceof HTMLSelectElement) return currentValue(element, field.elements) ?? "";
  const display = element.querySelector<HTMLElement>(
    [
      "[class*='select__single-value' i]",
      "[class*='select2-chosen' i]",
      "[class*='single-value' i]",
      "[data-testid*='selected' i]",
    ].join(","),
  );
  const displayText = visibleText(display?.textContent || display?.getAttribute("aria-label"));
  if (displayText && !isPlaceholderOption(displayText)) return displayText;
  const ariaValue = visibleText(element.getAttribute("aria-valuetext"));
  if (ariaValue && !isPlaceholderOption(ariaValue)) return ariaValue;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return "";
  if (isReactSelectRoot(element)) return "";
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      [
        "[aria-live]",
        "[role='log']",
        "input",
        "textarea",
        "[role='textbox']",
        "[role='listbox']",
        "[role='menu']",
        "[role='option']",
        "[role='menuitem']",
        "[class*='a11yText' i]",
        "[class*='placeholder' i]",
        "[class*='input-container' i]",
        "[class*='option' i]",
      ].join(","),
    )
    .forEach((node) => node.remove());
  const text = visibleText(clone.textContent || clone.getAttribute("aria-label") || clone.getAttribute("value"));
  return isPlaceholderOption(text) ? "" : text;
}

function choiceSelectionMatches(field: PageField, targetLabel: string, selectedOptionLabel?: string) {
  const selected = selectedChoiceText(field);
  if (selected && textMatchScore(targetLabel, selected) >= 0.45) return true;
  if (selected && selectedOptionLabel && textMatchScore(selectedOptionLabel, selected) >= 0.45) return true;
  const mirrorValues = filledRequiredChoiceMirrors(field.element);
  if (mirrorValues.length > 0) {
    if (!selectedOptionLabel) return true;
    if (mirrorValues.some((value) => textMatchScore(selectedOptionLabel, value) >= 0.45 || textMatchScore(targetLabel, value) >= 0.45)) return true;
    return true;
  }
  if (emptyRequiredChoiceMirrors(field.element).length > 0) return false;
  if (selectedOptionLabel && (field.element instanceof HTMLInputElement || field.element instanceof HTMLTextAreaElement)) {
    const value = visibleText(field.element.value);
    if (value && textMatchScore(selectedOptionLabel, value) >= 0.88 && textMatchScore(targetLabel, value) >= 0.45) return true;
  }
  return false;
}

function choiceTargetLabel(field: PageField, label: string) {
  const educationOption = reliableEducationOption(field, label, field.options, (option) => option);
  if (educationOption) return educationOption;
  if (educationPlanFieldKey(field)) return label;
  return bestOption(label, field.options, (option) => option) ?? affirmativeSingleChoiceFallback(label, field.options) ?? label;
}

function dynamicChoiceMatch(field: PageField, targetLabel: string, options: HTMLElement[]) {
  return reliableEducationOption(field, targetLabel, options, optionTextForElement) ?? bestOption(targetLabel, options, optionTextForElement);
}

function shouldAvoidSyntheticChoiceSearch(field: PageField) {
  const reactSelectRoot = field.element.closest<HTMLElement>(".select");
  return educationPlanFieldKey(field) === "school" && Boolean(reactSelectRoot && isReactSelectRoot(reactSelectRoot));
}

function fillSelect(field: PageField, label: string) {
  if (!(field.element instanceof HTMLSelectElement)) return false;
  const select = field.element;
  const options = Array.from(select.options);
  const optionLabel = (option: HTMLOptionElement) => option.textContent || option.value;
  const targetLabel = affirmativeSingleChoiceFallback(label, options.map(optionLabel)) ?? label;
  const match = bestOption(targetLabel, options, optionLabel);
  if (!match) return false;
  for (const option of options) option.selected = option === match;
  try {
    select.selectedIndex = options.indexOf(match);
  } catch {
    // selectedIndex is read-only in some non-browser DOMs; option.selected covers it.
  }
  try {
    if (select.value !== match.value) select.value = match.value;
  } catch {
    // select.value is a derived, read-only getter in some non-browser DOMs.
  }
  dispatchFieldEvents(select);
  return true;
}

async function waitForChoiceSelection(field: PageField, targetLabel: string, selectedOptionLabel?: string, timeoutMs = 800) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (choiceSelectionMatches(field, targetLabel, selectedOptionLabel)) return true;
    await sleep(60);
  }
  return false;
}

async function openSearchableChoice(element: HTMLElement, input: HTMLInputElement, ignoredOptions: ReadonlySet<HTMLElement> = new Set()) {
  input.focus();
  input.click();
  await sleep(90);
  pressChoiceKey(input, "ArrowDown");
  await sleep(220);
  return visibleDynamicChoiceOptions(element, ignoredOptions);
}

function fillRadio(field: PageField, label: string) {
  const match = bestOption(label, field.elements, optionTextForElement);
  if (!match) return false;
  if (match instanceof HTMLInputElement) {
    nativeCheckedSetter(match, true);
    dispatchFieldEvents(match);
    return match.checked;
  }
  for (const element of field.elements) {
    if (element === match || element instanceof HTMLInputElement) continue;
    element.setAttribute("aria-checked", "false");
    if (element.tagName === "BUTTON" || element.getAttribute("role") === "button") element.setAttribute("aria-pressed", "false");
  }
  match.focus?.();
  dispatchMouseLike(match, "pointerdown");
  dispatchMouseLike(match, "mousedown");
  dispatchMouseLike(match, "pointerup");
  dispatchMouseLike(match, "mouseup");
  match.click();
  match.setAttribute("aria-checked", "true");
  if (match.tagName === "BUTTON" || match.getAttribute("role") === "button") match.setAttribute("aria-pressed", "true");
  dispatchFieldEvents(match);
  return true;
}

function fillCheckbox(field: PageField, checked: boolean) {
  const element = field.element;
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    nativeCheckedSetter(element, checked);
    dispatchFieldEvents(element);
    return element.checked === checked;
  }
  if (checked) element.click();
  element.setAttribute("aria-checked", checked ? "true" : "false");
  dispatchFieldEvents(element);
  return true;
}

function neutralCheckboxOption(field: PageField) {
  const text = normalize(`${field.label} ${field.section ?? ""} ${field.options.join(" ")}`);
  const pick = (regex: RegExp) => field.options.find((option) => regex.test(option));
  if (/\b(prior question|previous question|if you selected)\b/.test(text)) {
    return (
      pick(/\bnot applicable\b/i) ??
      pick(/\bnone of these apply(?: to me)?\b/i) ??
      pick(/\bnone of the above\b/i)
    );
  }
  return (
    pick(/\bnone of the above\b/i) ??
    pick(/\bnone of these apply(?: to me)?\b/i) ??
    pick(/\bnot applicable\b/i)
  );
}

function shouldAutoChooseNeutralCheckbox(field: PageField) {
  const text = normalize(`${field.label} ${field.section ?? ""} ${field.options.join(" ")}`);
  return /\b(sanction|export control|ofac|embargo|cuba|iran|north korea|syria|crimea|belarus|applies to you|select all that apply|prior question|previous question)\b/.test(
    text,
  );
}

function filenameFromContentDisposition(header: string | null) {
  if (!header) return null;
  return /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)?.[1] ?? null;
}

function filenameFromUrl(url: string) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

function extensionForMime(mime: string) {
  const type = mime.toLowerCase().split(";")[0]?.trim();
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (type === "application/msword") return "doc";
  if (type === "text/plain") return "txt";
  return "pdf";
}

function safeFilename(url: string, disposition: string | null, mime: string, fallback: string) {
  const raw = fallback || filenameFromContentDisposition(disposition) || filenameFromUrl(url) || "JobPosted Resume";
  const cleanName = raw.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "JobPosted Resume";
  return /\.[a-z0-9]{2,5}$/i.test(cleanName) ? cleanName : `${cleanName}.${extensionForMime(mime)}`;
}

function fileListFromFile(element: HTMLElement, file: File) {
  type DataTransferConstructor = new () => DataTransfer;
  const view = element.ownerDocument.defaultView as (Window & { DataTransfer?: DataTransferConstructor }) | null;
  const DataTransferCtor = view?.DataTransfer ?? (typeof DataTransfer !== "undefined" ? DataTransfer : undefined);
  if (DataTransferCtor) {
    try {
      const transfer = new DataTransferCtor();
      transfer.items.add(file);
      return transfer.files;
    } catch {
      // Some test DOMs expose DataTransfer without a constructible implementation.
    }
  }
  const files = [file] as unknown as FileList;
  Object.defineProperty(files, "item", {
    configurable: true,
    value: (index: number) => (index === 0 ? file : null),
  });
  return files;
}

async function fillFile(field: PageField, resume: ExtensionResumeResponse | null) {
  const input = field.element instanceof HTMLInputElement ? field.element : field.element.querySelector<HTMLInputElement>("input[type='file']");
  if (!input) return { ok: false, error: "No file input was available." };
  const wantsCoverLetter = /\bcover letter\b/i.test(field.label);
  const url = wantsCoverLetter ? resume?.coverLetterUrl : resume?.resumeUrl;
  const name = wantsCoverLetter ? resume?.coverLetterName : resume?.resumeName;
  if (!url) return { ok: false, error: wantsCoverLetter ? "No cover letter available." : "No resume available." };
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) return { ok: false, error: "Could not download the document." };
  const blob = await response.blob();
  const mime = response.headers.get("content-type") || blob.type || "application/pdf";
  const file = new File([blob], safeFilename(url, response.headers.get("content-disposition"), mime, name ?? ""), { type: mime });
  const files = fileListFromFile(input, file);
  try {
    input.files = files;
  } catch {
    Object.defineProperty(input, "files", { configurable: true, value: files });
  }
  dispatchFieldEvents(input);
  return { ok: Boolean(input.files?.length), filename: file.name, error: input.files?.length ? undefined : "The file input rejected the document." };
}

async function fillCombobox(field: PageField, label: string) {
  const element = field.element;
  let targetLabel = choiceTargetLabel(field, label);
  const backing = backingSelect(element);
  if (backing && fillSelect({ ...field, element: backing }, targetLabel)) return true;

  const ignoredOptions = new Set(visibleGlobalChoiceOptions(element));
  const target = activateChoice(element);
  await sleep(160);

  let options = visibleDynamicChoiceOptions(element, ignoredOptions);
  const input = searchInputForChoice(element);
  if (options.length === 0 && input) {
    options = await openSearchableChoice(element, input, ignoredOptions);
  }
  const hydrated = mergeOptions(field.options, options.map(optionTextForElement));
  if (hydrated.length > field.options.length) field.options = hydrated;
  targetLabel = choiceTargetLabel(field, targetLabel);
  let match = dynamicChoiceMatch(field, targetLabel, options);
  if (match) {
    const matchLabel = optionTextForElement(match);
    selectChoiceOption(match);
    if (await waitForChoiceSelection(field, targetLabel, matchLabel)) return true;
    if (input && (await commitSearchableChoiceByText(field, input, targetLabel, matchLabel))) return true;
    pressChoiceKey(input ?? target, "Enter");
    if (await waitForChoiceSelection(field, targetLabel, matchLabel, 400)) return true;
  }

  if (input) {
    if (visibleDynamicChoiceOptions(element, ignoredOptions).length === 0) await openSearchableChoice(element, input, ignoredOptions);
    if (shouldAvoidSyntheticChoiceSearch(field)) {
      closeChoice(target);
      return false;
    }
    setChoiceSearchText(input, targetLabel);
    await sleep(220);
    options = visibleDynamicChoiceOptions(element, ignoredOptions);
    const filtered = mergeOptions(field.options, options.map(optionTextForElement));
    if (filtered.length > field.options.length) field.options = filtered;
    targetLabel = choiceTargetLabel(field, targetLabel);
    match = dynamicChoiceMatch(field, targetLabel, options);
    if (match) {
      const matchLabel = optionTextForElement(match);
      selectChoiceOption(match);
      if (await waitForChoiceSelection(field, targetLabel, matchLabel)) return true;
      if (await commitSearchableChoiceByText(field, input, targetLabel, matchLabel)) return true;
      pressChoiceKey(input, "Enter");
      if (await waitForChoiceSelection(field, targetLabel, matchLabel, 400)) return true;
      clearChoiceSearchText(input);
      closeChoice(target);
      return false;
    }
    if (options.length > 0) {
      pressChoiceKey(input, "ArrowDown");
      pressChoiceKey(input, "Enter");
      if (await waitForChoiceSelection(field, targetLabel)) return true;
    }
    if (input.value) clearChoiceSearchText(input);
  }

  closeChoice(target);
  return false;
}

function fillCheckboxGroup(field: PageField, item: ExtensionAutofillPlanItem) {
  let wanted = (
    Array.isArray(item.value) ? item.value : [item.optionLabel ?? (typeof item.value === "string" ? item.value : "")]
  )
    .map(clean)
    .filter(Boolean);
  if (wanted.length === 0) {
    const safe = neutralCheckboxOption(field);
    if (safe && shouldAutoChooseNeutralCheckbox(field)) wanted = [safe];
  }
  if (wanted.length === 0) {
    return recordFor(field, item, field.required ? "needs_user" : "skipped", item.note ?? "No option chosen.");
  }
  const checkboxes = field.elements.filter((element): element is HTMLInputElement => element instanceof HTMLInputElement);
  const selected = new Set<HTMLInputElement>();
  for (const choice of wanted) {
    const match = bestOption(choice, checkboxes, optionTextForElement);
    if (match) selected.add(match);
  }
  for (const checkbox of checkboxes) {
    nativeCheckedSetter(checkbox, selected.has(checkbox));
    dispatchFieldEvents(checkbox);
  }
  const checked = selected.size;
  return recordFor(
    field,
    item,
    checked > 0 ? "filled" : field.required ? "needs_user" : "skipped",
    checked > 0 ? undefined : "No matching checkbox option.",
    `${checked} selected`,
  );
}

async function fillPlanItem(field: PageField, item: ExtensionAutofillPlanItem, getResume: ApplyAutofillPlanArgs["getResume"]) {
  if (field.type === "multiselect" && field.elements.length > 1) return fillCheckboxGroup(field, item);
  if (item.action === "skip") return recordFor(field, item, field.required ? "needs_user" : "skipped", item.note ?? "Skipped.");
  if (item.action === "attach") {
    const result = await fillFile(field, await getResume());
    return result.ok
      ? recordFor(field, item, "filled", undefined, result.filename)
      : recordFor(field, item, field.required ? "needs_user" : "skipped", result.error);
  }
  if (item.action === "check" || item.action === "uncheck") {
    const ok = fillCheckbox(field, item.action === "check");
    return recordFor(field, item, ok ? "filled" : "failed", ok ? undefined : "Could not update checkbox.");
  }
  if (item.action === "select" || (item.action === "fill" && isSelectableField(field))) {
    const label = item.optionLabel || textValue(item);
    if (!label) return recordFor(field, item, field.required ? "needs_user" : "skipped", "No dropdown option was provided.");
    const ok =
      field.type === "select"
        ? fillSelect(field, label)
        : field.type === "radio"
          ? fillRadio(field, label)
          : await fillCombobox(field, label);
    return recordFor(field, item, ok ? "filled" : "needs_user", ok ? undefined : `Could not select ${label}.`);
  }
  const value = looksLikePhoneNumberField(field) ? nationalPhoneText(textValue(item)) : textValue(item);
  const ok = fillEditable(field.element, value);
  return recordFor(field, item, ok ? "filled" : "failed", ok ? undefined : "Could not fill this field.");
}

async function fillOtherReveal(
  before: ReadonlySet<string>,
  field: PageField,
  item: ExtensionAutofillPlanItem,
  onField?: (record: ExtensionFieldFillRecord) => void,
) {
  if (!item.optionLabel || !/\b(other|not listed)\b/i.test(item.optionLabel) || typeof item.value !== "string" || !item.value.trim()) {
    return [];
  }
  await sleep(260);
  const revealed = extractPageFields(field.element.ownerDocument).filter((candidate) => !before.has(candidate.fieldId));
  const target =
    revealed.find((candidate) => /text|textarea/.test(candidate.type) && /\b(other|specify|school|institution|university)\b/i.test(candidate.label)) ??
    revealed.find((candidate) => /text|textarea/.test(candidate.type) && normalize(candidate.section) === normalize(field.section));
  if (!target) return [];
  const revealItem: ExtensionAutofillPlanItem = {
    fieldId: target.fieldId,
    action: "fill",
    value: item.value,
    optionLabel: null,
    confidence: Math.min(item.confidence, 0.82),
    note: "Filled the free-text value revealed by Other.",
  };
  const record = await fillPlanItem(target, revealItem, async () => null);
  onField?.(record);
  return [record];
}

export async function applyAutofillPlan(args: ApplyAutofillPlanArgs) {
  const byId = new Map(args.fields.map((field) => [field.fieldId, field]));
  const before = new Set(args.fields.map((field) => field.fieldId));
  const records: ExtensionFieldFillRecord[] = [];

  for (const item of args.plan) {
    if (args.shouldStop?.()) break;
    const field = byId.get(item.fieldId);
    if (!field) continue;
    args.onFieldStart?.(field, item);
    const record =
      (await args.strategy?.fillField?.({
        field,
        item,
        getResume: args.getResume,
        shouldStop: args.shouldStop,
      })) ?? (await fillPlanItem(field, item, args.getResume));
    records.push(record);
    args.onField?.(record);
    const revealRecords = await fillOtherReveal(before, field, item, args.onField);
    records.push(...revealRecords);
    await sleep(80);
  }

  return records;
}

function addButtonIntent(button: HTMLElement) {
  return normalize(`${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("data-automation-id") ?? ""}`);
}

function repeaterIntentRegex(intent: "education" | "experience") {
  return intent === "education"
    ? /\b(add|another|more).*(education|school|university|college)|\b(education|school|university|college).*(add|another|more)\b/
    : /\b(add|another|more).*(experience|employment|work|job|position|role)|\b(experience|employment|work|job|position|role).*(add|another|more)\b/;
}

function sectionIntentRegex(intent: "education" | "experience") {
  return intent === "education"
    ? /\b(education|school|university|college)\b/
    : /\b(experience|employment|work history|job history|positions?)\b/;
}

function headingMatchesRepeaterIntent(element: HTMLElement, intent: "education" | "experience") {
  const semantic = semanticSectionText(element);
  if (semantic && sectionIntentRegex(intent).test(normalize(semantic))) return true;
  const heading = nearestPrecedingHeading(element);
  if (!heading) return false;
  return sectionIntentRegex(intent).test(normalize(visibleHeadingText(heading)));
}

function closestRepeaterSection(element: HTMLElement) {
  return (
    semanticSectionContainer(element) ??
    element.closest<HTMLElement>(SECTION_CONTAINER_SELECTOR) ??
    element.parentElement ??
    element
  );
}

function sectionForRepeaterIntent(doc: Document, intent: "education" | "experience") {
  const pattern = sectionIntentRegex(intent);
  const heading = Array.from(doc.querySelectorAll<HTMLElement>("h1, h2, h3, h4, legend, [role='heading']"))
    .filter(isVisible)
    .find((element) => pattern.test(normalize(`${element.getAttribute("data-automation-id") ?? ""} ${element.textContent ?? ""}`)));
  if (heading) return closestRepeaterSection(heading);

  return (
    Array.from(
      doc.querySelectorAll<HTMLElement>(SECTION_CONTAINER_SELECTOR),
    )
      .filter(isVisible)
      .find((element) => pattern.test(`${elementDescriptor(element)} ${normalize(element.textContent ?? "")}`)) ?? null
  );
}

function genericAddButtonText(button: HTMLElement) {
  return /^(?:\+?\s*)?(add|add another|add more|another|more)$/i.test(
    visibleText((button as HTMLInputElement).value || button.textContent || button.getAttribute("aria-label")),
  );
}

function findRepeaterAddButton(doc: Document, intent: "education" | "experience") {
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(ADD_BUTTON_SELECTOR)).filter(isVisible);
  const explicit = candidates.find((candidate) => repeaterIntentRegex(intent).test(addButtonIntent(candidate)));
  if (explicit) return explicit;

  const byNearestHeading = candidates.filter(genericAddButtonText).find((candidate) => headingMatchesRepeaterIntent(candidate, intent));
  if (byNearestHeading) return byNearestHeading;

  const section = sectionForRepeaterIntent(doc, intent);
  if (!section) return null;
  return Array.from(section.querySelectorAll<HTMLElement>(ADD_BUTTON_SELECTOR))
    .filter(isVisible)
    .find(genericAddButtonText) ?? null;
}

async function clickAddButtons(doc: Document, intent: "education" | "experience", count: number) {
  const desiredCount = Math.max(0, Math.min(count, MAX_REPEATER_ROWS));
  for (let index = 1; index < desiredCount; index += 1) {
    const button = findRepeaterAddButton(doc, intent);
    if (!button) return;
    button.click();
    await sleep(240);
  }
}

export async function ensureRepeaters(doc: Document, profile: MasterProfile) {
  if (profile.education.length > 1) await clickAddButtons(doc, "education", profile.education.length);
  if (profile.experience.length > 1) await clickAddButtons(doc, "experience", profile.experience.length);
}
