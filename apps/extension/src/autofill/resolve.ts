import {
  FIELD_RULES,
  valueForKey,
  type ExtensionFieldContext,
  type ExtensionFieldMapping,
  type ExtensionPlatform,
  type MasterProfile,
} from "@jobposted/shared";
import { includesAny, normalizeText } from "./text";
import type { FieldDescriptor } from "./types";

// The label→key rules are shared with the server apply runner (single source of truth).
const RULES = FIELD_RULES;

function fieldText(field: FieldDescriptor) {
  return normalizeText(`${field.label} ${field.context} ${field.options.join(" ")}`);
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
  const answer = profile.answers.find((item) => {
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
