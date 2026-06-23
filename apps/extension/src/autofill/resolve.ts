import {
  FIELD_RULES,
  isUsableAnswerValue,
  matchDefaultScreeningAnswer,
  matchScreeningReusableAnswer,
  resolvePronounFieldValue,
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

function skipMapping(reason: string): ExtensionFieldMapping {
  return {
    canonicalKey: "unknown",
    value: null,
    confidence: 0,
    source: "skip",
    reason,
  };
}

function directMapping(
  key: ExtensionFieldMapping["canonicalKey"],
  profile: MasterProfile,
  confidence: number,
  reason: string,
): ExtensionFieldMapping {
  return {
    canonicalKey: key,
    value: valueForKey(profile, key),
    confidence,
    source: "heuristic",
    reason,
  };
}

function workdayLabelMapping(field: FieldDescriptor, profile: MasterProfile): ExtensionFieldMapping | null {
  const label = normalizeText(field.label);
  const text = fieldText(field);

  if (/\blocal\b.*\b(?:given|first|family|last|surname)\b|\b(?:given|first|family|last|surname)\b.*\blocal\b/.test(label)) {
    return skipMapping("Skipped Workday local-name field.");
  }
  if (/\bphone\b.*\bextension\b|\bextension\b.*\bphone\b/.test(label) || (/\bextension\b/.test(label) && /\bphone\b/.test(text))) {
    return skipMapping("Skipped phone extension field.");
  }
  if (/\bphone\b.*\bdevice\b.*\btype\b|\bdevice\b.*\btype\b.*\bphone\b/.test(label)) {
    return {
      canonicalKey: "answers.workday_phone_device_type",
      value: "Mobile",
      confidence: 0.96,
      source: "heuristic",
      reason: "Matched Workday phone device type label.",
    };
  }
  if (/\bphone\b.*\b(?:country|code)\b|\bcountry\b.*\bphone\b/.test(label)) {
    return directMapping("identity.phoneCountryCode", profile, 0.94, "Matched Workday phone country-code label.");
  }
  if (/\bphone number\b|\bmobile number\b|\bprimary phone\b/.test(label)) {
    return directMapping("identity.phone", profile, 0.96, "Matched Workday phone-number label.");
  }
  if (/\bfamily name\b|\blast name\b|\bsurname\b/.test(label)) {
    return directMapping("identity.lastName", profile, 0.98, "Matched Workday family-name label.");
  }
  if (/\bgiven name(?:s)?\b|\bfirst name\b/.test(label)) {
    return directMapping("identity.firstName", profile, 0.98, "Matched Workday given-name label.");
  }
  if (/\baddress line 1\b|\bstreet address\b|\baddress 1\b/.test(label)) {
    return directMapping("location.street", profile, 0.94, "Matched Workday address-line label.");
  }
  if (/\baddress line [23]\b|\baddress [23]\b/.test(label)) {
    return skipMapping("No saved secondary address line.");
  }
  if (/^city\b|\bcity$/.test(label)) {
    return directMapping("location.city", profile, 0.92, "Matched Workday city label.");
  }
  if (/\b(?:state|province|region)\b/.test(label)) {
    return directMapping("location.state", profile, 0.9, "Matched Workday state/region label.");
  }
  if (/\b(?:postal|zip)\b/.test(label)) {
    return directMapping("location.postalCode", profile, 0.94, "Matched Workday postal-code label.");
  }
  if (/^country\b|\bcountry$/.test(label)) {
    return directMapping("location.country", profile, 0.92, "Matched Workday country label.");
  }
  return null;
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

function referralSourceMapping(field: FieldDescriptor): ExtensionFieldMapping | null {
  const question = normalizeText(`${field.label} ${field.context}`);
  const text = fieldText(field);
  const looksLikeSourceQuestion =
    /\bhow did (?:you )?(?:hear|find|learn)(?: about| of| about this)?\b.*\b(?:job|role|position|opening|opportunity|company|us)\b/.test(
      question,
    ) ||
    /\bwhere did (?:you )?(?:hear|find|learn)\b.*\b(?:job|role|position|opening|opportunity|company|us)\b/.test(question) ||
    /\bhow did (?:you )?(?:come across|discover)\b.*\b(?:job|role|position|opening|opportunity|company|us)\b/.test(question) ||
    /\b(?:referral|application|candidate|job)\s+source\b/.test(question) ||
    /\bsource\b.*\b(?:referral|application|candidate|job)\b/.test(question) ||
    (/\bsource\b/.test(question) && /\b(?:linkedin|job board|job site|indeed|glassdoor|referral|company website)\b/.test(text));
  if (!looksLikeSourceQuestion) return null;

  return {
    canonicalKey: "answers.referral_source",
    value: "LinkedIn",
    confidence: 0.78,
    source: "heuristic",
    reason: "Answered a referral/source question with the preferred source fallback.",
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

function isConditionalDetailField(text: string) {
  return (
    /\bif\s+(?:you|yes|applicable|selected|referred|related)\b/.test(text) &&
    /\b(?:list|name|names|explain|describe|provide|share|specify|details?|dates?|functional area)\b/.test(text)
  );
}

function answerMapping(field: FieldDescriptor, profile: MasterProfile): ExtensionFieldMapping | null {
  const text = fieldText(field);
  const questionText = normalizeText(`${field.label} ${field.context}`);
  const semanticAnswer = isConditionalDetailField(questionText) ? null : matchScreeningReusableAnswer(text, profile);
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
  if (answer) return {
    canonicalKey: `answers.${answer.key}`,
    value: answer.value,
    confidence: 0.8,
    source: "answer",
    reason: "Matched a reusable screening answer.",
  };
  const defaultAnswer = matchDefaultScreeningAnswer(field);
  if (!defaultAnswer) return null;
  return {
    canonicalKey: `answers.${defaultAnswer.key}`,
    value: defaultAnswer.value,
    confidence: 0.78,
    source: "heuristic",
    reason: "Matched a safe default screening answer.",
  };
}

function hasUsableRuleValue(value: ExtensionFieldMapping["value"]) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function yesNoBoolean(value: string) {
  const text = normalizeText(value);
  if (/^(yes|y|true|1)$/.test(text) || /\byes\b/.test(text)) return true;
  if (/^(no|n|false|0)$/.test(text) || /\bno\b/.test(text)) return false;
  return value;
}

function workAuthAnswerMatches(
  canonicalKey: ExtensionFieldMapping["canonicalKey"],
  answer: MasterProfile["answers"][number],
) {
  const text = normalizeText(`${answer.key} ${answer.prompt}`);
  if (canonicalKey === "workAuth.authorizedToWork") {
    return (
      /\b(?:authorized|authorised|eligible|right to work|work authorization|work authorisation|allowed to work|able to work)\b/.test(text) &&
      !/\b(?:sponsor|sponsorship|visa)\b/.test(text)
    );
  }
  if (canonicalKey === "workAuth.requiresSponsorship") {
    return /\b(?:sponsor|sponsorship|visa)\b/.test(text);
  }
  return false;
}

function inferredWorkAuthMapping(
  canonicalKey: ExtensionFieldMapping["canonicalKey"],
  profile: MasterProfile,
  confidence: number,
): ExtensionFieldMapping | null {
  const sponsorshipAnswer = profile.answers.find((item) => isUsableAnswerValue(item) && workAuthAnswerMatches("workAuth.requiresSponsorship", item));
  const sponsorshipValue = sponsorshipAnswer ? yesNoBoolean(sponsorshipAnswer.value) : null;
  if (
    canonicalKey === "workAuth.authorizedToWork" &&
    (profile.workAuth.requiresSponsorship === false || sponsorshipValue === false)
  ) {
    return {
      canonicalKey,
      value: true,
      confidence: Math.min(confidence, 0.86),
      source: "heuristic",
      reason: "Inferred work authorization from the setup sponsorship answer.",
    };
  }
  return null;
}

function workAuthAnswerMapping(
  canonicalKey: ExtensionFieldMapping["canonicalKey"],
  profile: MasterProfile,
  confidence: number,
): ExtensionFieldMapping | null {
  const answerKeys =
    canonicalKey === "workAuth.authorizedToWork"
      ? ["workauth authorized to work", "work authorization authorized to work"]
      : canonicalKey === "workAuth.requiresSponsorship"
        ? ["workauth needs sponsorship", "workauth requires sponsorship"]
        : [];
  if (answerKeys.length === 0) return null;
  const answer = profile.answers.find((item) => {
    if (!isUsableAnswerValue(item)) return false;
    return answerKeys.includes(normalizeText(item.key));
  }) ?? profile.answers.find((item) => {
    if (!isUsableAnswerValue(item)) return false;
    return workAuthAnswerMatches(canonicalKey, item);
  });
  if (!answer) return inferredWorkAuthMapping(canonicalKey, profile, confidence);
  return {
    canonicalKey,
    value: yesNoBoolean(answer.value),
    confidence: Math.min(confidence, 0.88),
    source: "answer",
    reason: "Matched a setup work-authorization answer.",
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
    return skipMapping("Handled by the Workday My Experience filler.");
  }

  if (args.platform === "workday") {
    const workdayMapping = workdayLabelMapping(field, profile);
    if (workdayMapping) return workdayMapping;
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
  const referralSource = referralSourceMapping(field);
  if (referralSource) return referralSource;

  if (matchDefaultScreeningAnswer(field)) {
    const answer = answerMapping(field, profile);
    if (answer) return answer;
  }
  const pronoun = resolvePronounFieldValue(field, profile);
  if (pronoun) {
    return {
      ...pronoun,
      reason: "Selected pronouns from setup gender.",
    };
  }

  for (const rule of RULES) {
    if (rule.needsDemographics && !args.demographicsEnabled) continue;
    if (!includesAny(text, rule.patterns)) continue;
    const value = valueForKey(profile, rule.key);
    if (!hasUsableRuleValue(value)) {
      const setupAnswer = workAuthAnswerMapping(rule.key, profile, rule.confidence);
      if (setupAnswer) return setupAnswer;
    }
    return {
      canonicalKey: rule.key,
      value,
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
