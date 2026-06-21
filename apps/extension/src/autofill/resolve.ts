import {
  FIELD_RULES,
  isUsableAnswerValue,
  matchScreeningReusableAnswer,
  valueForKey,
  type ExtensionFieldContext,
  type ExtensionFieldMapping,
  type ExtensionPlatform,
  type MasterProfile,
} from "@jobposted/shared";
import { includesAny, normalizeText, visibleText } from "./text";
import type { FieldDescriptor } from "./types";
import { isWorkdayExperienceOwnedControl } from "./workday-experience";

// The label-to-key rules are shared with the server apply runner (single source of truth).
const RULES = FIELD_RULES;

function fieldText(field: FieldDescriptor) {
  return normalizeText(`${field.label} ${field.context} ${field.options.join(" ")}`);
}

function looksLikePhoneCountryCode(field: FieldDescriptor) {
  const label = normalizeText(field.label);
  const text = fieldText(field);
  const optionText = normalizeText(field.options.join(" "));
  return (
    /\bcountry\b/.test(label) &&
    (/\b(phone|mobile|telephone|dial|calling)\b/.test(text) ||
      /(^|\s)\+\d{1,3}\b/.test(optionText) ||
      hasNearbyPhoneControl(field))
  );
}

function complianceNeutralCheckbox(field: FieldDescriptor): ExtensionFieldMapping | null {
  if (field.type !== "checkbox") return null;
  const label = normalizeText(field.label);
  const text = fieldText(field);
  const isNeutral =
    /\bnone of (?:the above|these apply)\b/.test(label) ||
    /\bnot applicable\b/.test(label);
  if (!isNeutral) return null;

  const isComplianceQuestion =
    /\b(?:sanctions?|export controls?|prior question|none of the above|not applicable|cuba|iran|north korea|syria|crimea|donetsk|luhansk|zaporizhzhia|kherson|russia|belarus|resident|citizen)\b/.test(
      text,
    );
  if (!isComplianceQuestion) return null;
  return {
    canonicalKey: "answers.screening.compliance_none_of_above",
    value: true,
    confidence: 0.88,
    source: "heuristic",
    reason: "Selected the neutral compliance checkbox.",
  };
}

function controlSignal(element: HTMLElement) {
  const attrs = [
    element.getAttribute("type"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("autocomplete"),
    element.getAttribute("aria-label"),
    element.getAttribute("data-source"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-automation-id"),
  ];
  const labelledBy = element
    .getAttribute("aria-labelledby")
    ?.split(/\s+/)
    .map((id) => visibleText(element.ownerDocument.getElementById(id)?.textContent))
    .join(" ");
  return normalizeText([...attrs, labelledBy, visibleText(element.closest("label")?.textContent)].filter(Boolean).join(" "));
}

function hasNearbyPhoneControl(field: FieldDescriptor) {
  const element = field.element;
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    if (node.matches("fieldset, form, section")) return false;
    const controls = Array.from(
      node.querySelectorAll<HTMLElement>(
        "input:not([type='hidden']), textarea, select, [role='combobox'], [aria-haspopup='listbox'], [aria-haspopup='menu']",
      ),
    );
    if (controls.length <= 1) continue;
    if (controls.length > 5) return false;
    if (
      controls.some((control) => {
        if (control === element || control.contains(element) || element.contains(control)) return false;
        return /\b(phone|mobile|telephone|tel)\b/.test(controlSignal(control));
      })
    ) {
      return true;
    }
  }
  return false;
}

export function toFieldContext(
  field: FieldDescriptor,
  platform: ExtensionPlatform,
  url: string,
): ExtensionFieldContext {
  return {
    signature: field.signature,
    platform,
    url,
    label: field.label,
    context: field.context,
    type: field.type,
    required: field.required,
    options: field.options,
  };
}

function answerMapping(field: FieldDescriptor, profile: MasterProfile): ExtensionFieldMapping | null {
  const text = fieldText(field);
  const questionText = normalizeText(`${field.label} ${field.context}`);
  const semanticAnswer = matchScreeningReusableAnswer(text, profile);
  if (semanticAnswer && isUsableAnswerValue(semanticAnswer, questionText)) {
    return {
      canonicalKey: `answers.${semanticAnswer.key}`,
      value: semanticAnswer.value,
      confidence: 0.84,
      source: "answer",
      reason: "Matched a setup screening answer.",
    };
  }
  const answer = profile.answers.find((item) => {
    if (!isUsableAnswerValue(item, questionText)) return false;
    const key = normalizeText(item.key);
    const prompt = normalizeText(item.prompt);
    return (key && text.includes(key)) || (prompt && (text.includes(prompt) || prompt.includes(text)));
  });
  if (!answer) return null;
  return {
    canonicalKey: `answers.${answer.key}`,
    value: answer.value,
    confidence: 0.8,
    source: "answer",
    reason: "Matched a reusable screening answer.",
  };
}

export async function resolveField(args: {
  field: FieldDescriptor;
  profile: MasterProfile;
  platform: ExtensionPlatform;
  url: string;
  demographicsEnabled: boolean;
  llmMap?: (field: FieldDescriptor) => Promise<ExtensionFieldMapping | null>;
}): Promise<ExtensionFieldMapping> {
  const { field, profile } = args;
  if (args.platform === "workday" && isWorkdayExperienceOwnedControl(field.element)) {
    return {
      canonicalKey: "unknown",
      value: null,
      confidence: 0,
      source: "skip",
      reason: "Handled by the Workday My Experience filler.",
    };
  }

  if (field.adapterKey) {
    return {
      canonicalKey: field.adapterKey,
      value: valueForKey(profile, field.adapterKey),
      confidence: field.adapterConfidence ?? 0.95,
      source: "adapter",
      reason: "Matched a platform adapter hint.",
    };
  }

  const text = fieldText(field);
  if (looksLikePhoneCountryCode(field)) {
    return {
      canonicalKey: "identity.phoneCountryCode",
      value: valueForKey(profile, "identity.phoneCountryCode"),
      confidence: 0.93,
      source: "heuristic",
      reason: "Matched a phone country-code field.",
    };
  }
  const compliance = complianceNeutralCheckbox(field);
  if (compliance) return compliance;

  for (const rule of RULES) {
    if (rule.needsDemographics && !args.demographicsEnabled) continue;
    if (!includesAny(text, rule.patterns)) continue;
    return {
      canonicalKey: rule.key,
      value: valueForKey(profile, rule.key),
      confidence: rule.confidence,
      source: "heuristic",
      reason: "Matched a normalized label rule.",
    };
  }

  const answer = answerMapping(field, profile);
  if (answer) return answer;

  const llm = args.llmMap ? await args.llmMap(field) : null;
  if (llm && llm.confidence > 0) return llm;

  return {
    canonicalKey: "unknown",
    value: null,
    confidence: 0,
    source: "skip",
    reason: "No confident mapping.",
  };
}
