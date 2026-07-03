import type { AdapterHint } from "./types";
import { looksLikeActionControl, normalizeText, visibleText } from "./text";
import type { FieldDescriptor } from "./types";
import { isWorkdayExperienceOwnedControl } from "./workday-experience";

const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='image']):not([type='reset'])",
  "textarea",
  "select",
  "[role='combobox']",
  "[role='radio']",
  "[role='textbox']",
  "[aria-haspopup='listbox']",
  "[aria-haspopup='menu']",
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

function labelElementsText(element: HTMLElement): string {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    return "";
  }
  return Array.from(element.labels ?? [])
    .map((label) => visibleText(label.textContent))
    .filter(Boolean)
    .join(" ");
}

function textWithoutControls(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const node of Array.from(
    clone.querySelectorAll(`${FIELD_SELECTOR}, button, [role='button']`),
  )) {
    node.remove();
  }
  return visibleText(clone.textContent);
}

function singleControlContainerText(element: HTMLElement): string {
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    const controlCount = node.querySelectorAll(FIELD_SELECTOR).length;
    if (controlCount > 1) continue;
    const text = textWithoutControls(node);
    if (/[a-z0-9]/i.test(text)) return text.slice(0, 120);
  }
  return "";
}

function nearbyControlGroupText(element: HTMLElement): string {
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    if (node.matches("fieldset, form, section")) return "";
    const controlCount = node.querySelectorAll(FIELD_SELECTOR).length;
    if (controlCount <= 1) continue;
    if (controlCount > 4) return "";
    const text = textWithoutControls(node);
    if (/[a-z0-9]/i.test(text)) return text.slice(0, 160);
  }
  return "";
}

function nearbyPeerFieldText(element: HTMLElement): string {
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    if (node.matches("fieldset, form, section")) return "";
    const controls = Array.from(node.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
    if (controls.length <= 1) continue;
    if (controls.length > 5) return "";
    const texts = controls
      .filter((control) => control !== element && !control.contains(element) && !element.contains(control))
      .map((control) => labelFor(control))
      .filter(Boolean);
    if (texts.length > 0) return texts.join(" ").slice(0, 160);
  }
  return "";
}

function customRadioGroup(element: HTMLElement) {
  return element.closest("[role='radiogroup'], fieldset, [data-automation-id], [data-testid]") ?? element.parentElement;
}

function customRadioGroupLabel(element: HTMLElement) {
  const group = customRadioGroup(element);
  if (!group) return "";
  const aria = group.getAttribute("aria-label");
  if (aria) return visibleText(aria);
  const labelledBy = textById(element.ownerDocument, group.getAttribute("aria-labelledby"));
  if (labelledBy) return labelledBy;
  const legend = group.querySelector("legend");
  if (legend?.textContent) return visibleText(legend.textContent);
  const label = group.querySelector<HTMLElement>(
    "label, [data-automation-id*='label' i], [data-testid*='label' i], [id*='label' i], [class*='label' i], [class*='heading' i]",
  );
  if (label?.textContent) return visibleText(label.textContent);
  return textWithoutControls(group as HTMLElement).slice(0, 120);
}

function customRadioOptionText(element: HTMLElement) {
  return (
    visibleText(element.getAttribute("aria-label")) ||
    textById(element.ownerDocument, element.getAttribute("aria-labelledby")) ||
    visibleText(element.textContent) ||
    visibleText(element.getAttribute("data-value"))
  );
}

function isPlaceholderText(value: string) {
  return /^(select|select option|choose|choose option|please select|select\.\.\.|choose\.\.\.)$/i.test(visibleText(value));
}

function isChoiceLike(element: HTMLElement) {
  return (
    element.getAttribute("role") === "combobox" ||
    element.getAttribute("aria-haspopup") === "listbox" ||
    element.getAttribute("aria-haspopup") === "menu"
  );
}

function hasClassToken(element: HTMLElement, token: string) {
  return Array.from(element.classList).some((item) => item === token);
}

function isGreenhouseReactSelectRoot(element: HTMLElement) {
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

function greenhouseChoiceContainerFor(element: HTMLElement) {
  const reactSelect = element.closest<HTMLElement>(".select");
  if (reactSelect && isGreenhouseReactSelectRoot(reactSelect)) return reactSelect;
  const select2 = select2FieldRoot(element);
  if (select2) return select2;
  const field = element.closest<HTMLElement>(".field, fieldset, [data-testid], [data-automation-id]");
  if (field?.querySelector("[class*='select2-container' i]")) return field;
  return null;
}

function uploadFileLabelText(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement) || element.type !== "file") return "";
  const doc = element.ownerDocument;
  const id = element.getAttribute("id");
  const direct = id ? doc.getElementById(`upload-label-${id}`) : null;
  const directText = visibleText(direct?.textContent);
  if (directText) return directText;

  for (let node = element.parentElement; node && node !== doc.body; node = node.parentElement) {
    const uploadLabels = Array.from(
      node.querySelectorAll<HTMLElement>(
        "[id*='upload-label' i], [class*='upload-label' i], [data-testid*='upload-label' i], [data-automation-id*='upload-label' i]",
      ),
    )
      .map((label) => visibleText(label.textContent))
      .filter((text) => text && !looksLikeActionControl(text));
    const documentLabel = uploadLabels.find((text) => /\b(resume|cv|curriculum vitae|cover letter)\b/i.test(text));
    if (documentLabel) return documentLabel;
    if (uploadLabels.length === 1) return uploadLabels[0] ?? "";
    if (node.matches("form, section, fieldset")) break;
  }
  return "";
}

function labelFor(element: HTMLElement): string {
  if (element.getAttribute("role") === "radio") {
    const groupLabel = customRadioGroupLabel(element);
    if (groupLabel) return groupLabel;
  }

  const doc = element.ownerDocument;
  const aria = element.getAttribute("aria-label");
  if (aria && !(isChoiceLike(element) && isPlaceholderText(aria))) return visibleText(aria);

  const ariaLabelledBy = textById(doc, element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy && !(isChoiceLike(element) && isPlaceholderText(ariaLabelledBy))) return ariaLabelledBy;

  const uploadLabel = uploadFileLabelText(element);
  if (uploadLabel) return uploadLabel;

  const nativeLabels = labelElementsText(element);
  if (nativeLabels) return nativeLabels;

  const id = element.getAttribute("id");
  if (id) {
    const explicit = doc.querySelector(`label[for="${cssEscape(id)}"]`);
    if (explicit?.textContent) return visibleText(explicit.textContent);
  }

  const wrapping = element.closest("label");
  if (wrapping?.textContent) {
    const wrappingText = visibleText(wrapping.textContent);
    const withoutValue = visibleText(wrappingText.replace((element as HTMLInputElement).value ?? "", ""));
    if (element instanceof HTMLInputElement && element.type === "checkbox") return withoutValue || wrappingText;
    return withoutValue;
  }

  const container = element.closest("[data-automation-id], [data-testid], div");
  const nearbyLabel = container?.querySelector<HTMLElement>(
    "label, [data-automation-id*='label' i], [data-testid*='label' i], [id*='label' i], [class*='label' i], [class*='heading' i]",
  );
  if (nearbyLabel && !nearbyLabel.contains(element) && nearbyLabel.textContent) {
    const text = visibleText(nearbyLabel.textContent);
    if (text) return text;
  }

  const wrapperText = singleControlContainerText(element);
  if (wrapperText) return wrapperText;

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) return visibleText(placeholder);

  for (const attr of ["autocomplete", "name", "data-source", "data-automation-id", "data-testid", "id"]) {
    const value = element.getAttribute(attr);
    if (value) return visibleText(value.replace(/[_-]+/g, " "));
  }

  return visibleText(element.closest("[data-automation-id], fieldset, div, section")?.textContent).slice(0, 120);
}

function fieldContext(element: HTMLElement): string {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  const section = element.closest("[data-automation-id], section, form");
  return [legend?.textContent, section?.getAttribute("data-automation-id"), nearbyControlGroupText(element), nearbyPeerFieldText(element)]
    .map(visibleText)
    .filter(Boolean)
    .join(" ");
}

function controlsChoicePopup(element: HTMLElement) {
  const ids = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  return ids.some((id) => {
    const controlled = element.ownerDocument.getElementById(id);
    return Boolean(
      controlled &&
        (controlled.getAttribute("role") === "listbox" ||
          controlled.getAttribute("role") === "menu" ||
          controlled.querySelector("[role='option'], [role='menuitem'], option, li")),
    );
  });
}

function controlType(element: HTMLElement): FieldDescriptor["type"] {
  const role = element.getAttribute("role");
  if (role === "radio") return "radio";
  if (role === "combobox" || element.getAttribute("aria-haspopup") === "listbox" || element.getAttribute("aria-haspopup") === "menu") {
    return "combobox";
  }
  if (role === "textbox") return "text";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return element.multiple ? "multiselect" : "select";
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
    if (element.getAttribute("aria-autocomplete") === "list" || controlsChoicePopup(element)) return "combobox";
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
  if (element.getAttribute("role") === "radio") {
    const group = customRadioGroup(element);
    const radios = Array.from((group ?? element.ownerDocument).querySelectorAll<HTMLElement>("[role='radio']"));
    return radios.map(customRadioOptionText).filter(Boolean);
  }
  const controlledIds = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  const listboxes = controlledIds
    .map((id) => element.ownerDocument.getElementById(id))
    .filter((node): node is HTMLElement => Boolean(node));
  const inputList = element instanceof HTMLInputElement ? element.getAttribute("list") : null;
  if (inputList) {
    const datalist = element.ownerDocument.getElementById(inputList);
    if (datalist) listboxes.push(datalist);
  }
  const options = listboxes.flatMap((listbox) =>
    Array.from(listbox.querySelectorAll<HTMLElement>("[role='option'], option, li")).map((option) =>
      visibleText(option.textContent || option.getAttribute("aria-label") || option.getAttribute("data-value")),
    ),
  );
  if (options.length > 0) {
    return options;
  }
  return [];
}

function requiredFor(element: HTMLElement, label: string, context: string) {
  if (element.hasAttribute("required") || element.getAttribute("aria-required") === "true") return true;
  if (/\brequired\b/i.test(`${label} ${context}`)) return true;
  if (/\*/.test(`${label} ${context}`)) return true;
  const requiredContainer = element.closest("[aria-required='true'], [data-required='true'], .required");
  return Boolean(requiredContainer && requiredContainer.querySelectorAll(FIELD_SELECTOR).length === 1);
}

function isVisible(element: HTMLElement): boolean {
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

function isDropdownInternalControl(element: HTMLElement) {
  const popup = element.closest("[role='listbox'], [role='menu'], [role='option'], [role='menuitem']");
  if (popup && popup !== element) return true;
  const greenhouseChoice = greenhouseChoiceContainerFor(element);
  if (greenhouseChoice && greenhouseChoice !== element) return true;
  const combobox = element.closest("[role='combobox'], [aria-haspopup='listbox'], [aria-haspopup='menu']");
  return Boolean(combobox && combobox !== element);
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

function isOptionButtonCandidate(element: HTMLElement, requireVisible = true): boolean {
  if (isWorkdayExperienceOwnedControl(element)) return false;
  if (element.tagName !== "BUTTON" && element.getAttribute("role") !== "button") return false;
  // Dropdown triggers and listbox internals are handled by the combobox path, not here.
  if (element.getAttribute("role") === "combobox" || element.hasAttribute("aria-haspopup")) return false;
  if (element.closest("[role='listbox'], [role='menu'], [role='option'], [role='menuitem']")) return false;
  if (element.querySelector(FIELD_SELECTOR)) return false;
  if (requireVisible && !isVisible(element)) return false;
  const text = visibleText(element.textContent || element.getAttribute("aria-label"));
  if (!text || text.length > 40) return false;
  return !looksLikeActionControl(text);
}

function buttonGroupLabel(container: HTMLElement): string {
  for (let node: HTMLElement | null = container; node && node !== container.ownerDocument.body; node = node.parentElement) {
    const text = textWithoutControls(node);
    if (/[a-z0-9]/i.test(text)) return text.slice(0, 160);
  }
  return "";
}

/** Tightest pure-button ancestor that groups >=2 option buttons (no inputs mixed in). */
function buttonGroupContainer(button: HTMLElement, candidates: ReadonlySet<HTMLElement>): HTMLElement | null {
  for (let node = button.parentElement; node && node !== button.ownerDocument.body; node = node.parentElement) {
    const within = Array.from(node.querySelectorAll<HTMLElement>("button, [role='button']")).filter((candidate) =>
      candidates.has(candidate),
    );
    if (within.length >= 2) {
      return node.querySelectorAll(FIELD_SELECTOR).length === 0 ? node : null;
    }
    if (node.querySelectorAll(FIELD_SELECTOR).length > 0) return null;
  }
  return null;
}

function uniqueByElement(elements: HTMLElement[]) {
  return elements.filter((element, index, all) => all.indexOf(element) === index);
}

function documentOrder(a: FieldDescriptor, b: FieldDescriptor) {
  if (a.element === b.element) return 0;
  const position = a.element.compareDocumentPosition(b.element);
  if (position & 2) return 1; // DOCUMENT_POSITION_PRECEDING
  if (position & 4) return -1; // DOCUMENT_POSITION_FOLLOWING
  return 0;
}

function greenhouseChoiceRoots(dom: Document) {
  const reactSelects = Array.from(dom.querySelectorAll<HTMLElement>(".select")).filter(isGreenhouseReactSelectRoot);
  const select2Roots = Array.from(dom.querySelectorAll<HTMLElement>("[class*='select2-container' i]"))
    .map((element) => select2FieldRoot(element) ?? element)
    .filter((element): element is HTMLElement => Boolean(element));
  return uniqueByElement([...reactSelects, ...select2Roots]).filter(isVisible);
}

function greenhouseChoiceLabel(container: HTMLElement) {
  const labelledBy = textById(container.ownerDocument, container.getAttribute("aria-labelledby"));
  if (labelledBy) return labelledBy;
  const label = container.querySelector<HTMLElement>(
    "label, [data-automation-id*='label' i], [data-testid*='label' i], [id*='label' i], [class*='label' i], [class*='heading' i]",
  );
  if (label?.textContent) return visibleText(label.textContent);
  return textWithoutControls(container).slice(0, 160);
}

function greenhouseChoiceOptions(container: HTMLElement) {
  const options = Array.from(
    container.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], option, li, [class*='option' i]"),
  )
    .map((option) => visibleText(option.textContent || option.getAttribute("aria-label") || option.getAttribute("data-value") || option.getAttribute("value")))
    .filter((option) => option && !isPlaceholderText(option));
  return options.filter((option, index, all) => all.indexOf(option) === index);
}

/**
 * Greenhouse has two common custom-select families that often hide the real field behind a
 * search input/select2 shell. Emit the visible wrapper as the field so filling opens and selects
 * the widget instead of typing "Yes"/"No" into its internal search box.
 */
function extractGreenhouseChoiceWidgets(dom: Document, platform: string, existing: FieldDescriptor[]): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  for (const container of greenhouseChoiceRoots(dom)) {
    if (existing.some((field) => field.element === container || container.contains(field.element) || field.element.contains(container))) continue;
    const label = greenhouseChoiceLabel(container);
    if (!label) continue;
    const context = fieldContext(container);
    const type = "combobox" as const;
    const options = greenhouseChoiceOptions(container);
    const signature = signatureFor({ platform, label, context, type, options });
    fields.push({
      id: `${type}:${signature}:${existing.length + fields.length}`,
      element: container,
      label,
      context,
      type,
      required: requiredFor(container, label, context),
      options,
      signature,
    });
  }
  return fields;
}

/**
 * Some design systems (Ashby, several React form kits) render single-choice questions as a row of
 * <button> toggles instead of radios/selects, which the field selector ignores. Detect those groups
 * and emit one synthetic radio-type field per group so they can be resolved and filled.
 */
function extractButtonChoiceGroups(
  dom: Document,
  platform: string,
  existing: FieldDescriptor[],
  options: { requireVisible?: boolean } = {},
): FieldDescriptor[] {
  const requireVisible = options.requireVisible ?? true;
  const candidates = Array.from(dom.querySelectorAll<HTMLElement>("button, [role='button']")).filter((element) =>
    isOptionButtonCandidate(element, requireVisible),
  );
  if (candidates.length < 2) return [];
  const candidateSet = new Set(candidates);
  const groups = new Map<HTMLElement, HTMLElement[]>();
  for (const button of candidates) {
    const container = buttonGroupContainer(button, candidateSet);
    if (!container) continue;
    const list = groups.get(container) ?? [];
    list.push(button);
    groups.set(container, list);
  }

  const fields: FieldDescriptor[] = [];
  for (const [container, buttons] of groups) {
    if (buttons.length < 2) continue;
    if (existing.some((field) => field.element === container || container.contains(field.element) || field.element.contains(container))) continue;
    const label = buttonGroupLabel(container);
    if (!label) continue;
    const options = buttons.map((button) => visibleText(button.textContent || button.getAttribute("aria-label"))).filter(Boolean);
    if (options.length < 2) continue;
    const context = fieldContext(container);
    const type = "radio" as const;
    const signature = signatureFor({ platform, label, context, type, options });
    fields.push({
      id: `${type}:${signature}:${fields.length}`,
      element: container,
      label,
      context,
      type,
      required: requiredFor(container, label, context),
      options,
      signature,
    });
  }
  return fields;
}

function nativeRadioQuestionContainer(input: HTMLInputElement) {
  return (
    input.closest<HTMLElement>(".application-question, fieldset, [role='radiogroup'], [data-testid], [data-automation-id]") ??
    input.parentElement
  );
}

function nativeRadioQuestionLabel(container: HTMLElement, input: HTMLInputElement) {
  const aria = container.getAttribute("aria-label");
  if (aria) return visibleText(aria);
  const labelledBy = textById(input.ownerDocument, container.getAttribute("aria-labelledby"));
  if (labelledBy) return labelledBy;
  const label = container.querySelector<HTMLElement>(
    "legend, .application-label .text, .application-label, [data-qa*='question' i], [class*='question' i] [class*='label' i], [class*='label' i], [class*='heading' i]",
  );
  if (label?.textContent) {
    const text = visibleText(label.textContent);
    if (text) return text;
  }
  return textWithoutControls(container).slice(0, 160);
}

function nativeRadioOptionText(input: HTMLInputElement) {
  const id = input.id ? cssEscape(input.id) : "";
  const explicit = id ? input.ownerDocument.querySelector(`label[for="${id}"]`) : null;
  return (
    visibleText(explicit?.textContent) ||
    visibleText(input.closest("label")?.textContent) ||
    visibleText(input.getAttribute("aria-label")) ||
    textById(input.ownerDocument, input.getAttribute("aria-labelledby")) ||
    visibleText(input.value)
  );
}

function extractNativeRadioGroups(dom: Document, platform: string, existing: FieldDescriptor[]): FieldDescriptor[] {
  const groups = new Map<string, HTMLInputElement[]>();
  for (const input of Array.from(dom.querySelectorAll<HTMLInputElement>("input[type='radio'][name]"))) {
    if (!input.name) continue;
    if (isWorkdayExperienceOwnedControl(input)) continue;
    const group = groups.get(input.name) ?? [];
    group.push(input);
    groups.set(input.name, group);
  }

  const fields: FieldDescriptor[] = [];
  for (const [name, radios] of groups) {
    if (radios.length < 2) continue;
    if (existing.some((field) => radios.some((radio) => field.element === radio || field.element.contains(radio) || radio.contains(field.element)))) continue;
    const first = radios[0];
    if (!first) continue;
    const container = nativeRadioQuestionContainer(first);
    if (!container) continue;
    const label = nativeRadioQuestionLabel(container, first);
    if (!label) continue;
    const options = radios.map(nativeRadioOptionText).filter(Boolean);
    if (options.length < 2) continue;
    const context = fieldContext(first);
    const type = "radio" as const;
    const signature = signatureFor({ platform, label, context, type, options });
    fields.push({
      id: `${type}:${signature}:${existing.length + fields.length}`,
      element: first,
      label,
      context,
      type,
      required: radios.some((radio) => requiredFor(radio, label, context)),
      options,
      signature,
    });
  }
  return fields;
}

function extractEmergencyFields(dom: Document, platform: string): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const seenRadioGroups = new Set<string>();
  for (const element of Array.from(dom.querySelectorAll<HTMLElement>(FIELD_SELECTOR))) {
    if (isWorkdayExperienceOwnedControl(element)) continue;
    if (element.closest("[role='listbox'], [role='menu'], [role='option'], [role='menuitem']")) continue;
    const type = controlType(element);
    if (element instanceof HTMLInputElement) {
      if (element.type === "hidden" || element.type === "submit" || element.type === "button" || element.type === "image" || element.type === "reset") continue;
      if (element.type === "radio" && element.name) {
        if (seenRadioGroups.has(element.name)) continue;
        seenRadioGroups.add(element.name);
        continue;
      }
    }
    const label = labelFor(element);
    const context = fieldContext(element);
    const options = optionsFor(element);
    if (!label && type !== "file") continue;
    const signature = signatureFor({ platform, label, context, type, options });
    fields.push({
      id: `${type}:${signature}:emergency-${fields.length}`,
      element,
      label,
      context,
      type,
      required: requiredFor(element, label, context),
      options,
      signature,
    });
  }
  fields.push(...extractNativeRadioGroups(dom, platform, fields));
  fields.push(...extractButtonChoiceGroups(dom, platform, fields, { requireVisible: false }));
  return fields;
}

function hasNonFileFormControls(dom: Document) {
  return Boolean(
    dom.querySelector(
      [
        "input:not([type='hidden']):not([type='file']):not([type='submit']):not([type='button']):not([type='image']):not([type='reset'])",
        "textarea",
        "select",
        "[role='combobox']",
        "[aria-haspopup='listbox']",
        "[aria-haspopup='menu']",
        "[contenteditable='true']",
      ].join(","),
    ),
  );
}

function shouldUseEmergencyFields(dom: Document, fields: FieldDescriptor[]) {
  if (fields.length === 0) return true;
  return fields.every((field) => field.type === "file") && hasNonFileFormControls(dom);
}

export function extractFields(dom: Document, platform: string, hints: AdapterHint[] = []): FieldDescriptor[] {
  const seenRadioGroups = new Set<string>();
  const seenCustomRadioGroups = new WeakSet<Element>();
  const fields: FieldDescriptor[] = [];
  const elements = Array.from(dom.querySelectorAll<HTMLElement>(FIELD_SELECTOR));

  for (const element of elements) {
    const type = controlType(element);
    if (!isVisible(element) && type !== "file") continue;
    if (isWorkdayExperienceOwnedControl(element)) continue;
    if (isDropdownInternalControl(element)) continue;
    if (element instanceof HTMLInputElement && element.type === "radio" && element.name) {
      if (seenRadioGroups.has(element.name)) continue;
      seenRadioGroups.add(element.name);
    }
    if (element.getAttribute("role") === "radio") {
      const group = customRadioGroup(element);
      if (group && seenCustomRadioGroups.has(group)) continue;
      if (group) seenCustomRadioGroups.add(group);
    }

    const label = labelFor(element);
    const context = fieldContext(element);
    const options = optionsFor(element);
    const signature = signatureFor({ platform, label, context, type, options });
    if (!label && type !== "file") continue;
    fields.push({
      id: `${type}:${signature}:${fields.length}`,
      element,
      label,
      context,
      type,
      required: requiredFor(element, label, context),
      options,
      signature,
    });
  }

  fields.push(...extractGreenhouseChoiceWidgets(dom, platform, fields));
  fields.push(...extractButtonChoiceGroups(dom, platform, fields));
  fields.push(...extractNativeRadioGroups(dom, platform, fields));
  if (shouldUseEmergencyFields(dom, fields)) {
    const emergencyFields = extractEmergencyFields(dom, platform);
    if (emergencyFields.length > fields.length) {
      fields.splice(0, fields.length, ...emergencyFields);
    }
  }
  fields.sort(documentOrder);
  applyHints(dom, fields, hints);
  return fields;
}
