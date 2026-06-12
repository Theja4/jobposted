import type {
  CanonicalFieldKey,
  ExtensionFieldContext,
  ExtensionFieldMapping,
  ExtensionPlatform,
  MasterProfile,
} from "@jobposted/shared";
import { valueForKey } from "./profile-value";
import { includesAny, normalizeText } from "./text";
import type { FieldDescriptor } from "./types";

interface Rule {
  key: CanonicalFieldKey;
  confidence: number;
  patterns: RegExp[];
  needsDemographics?: boolean;
}

const RULES: Rule[] = [
  { key: "identity.fullName", confidence: 0.88, patterns: [/\b(full|legal) name\b/, /\bcandidate name\b/] },
  { key: "identity.firstName", confidence: 0.96, patterns: [/\b(first|given) name\b/, /\blegal first\b/] },
  { key: "identity.lastName", confidence: 0.96, patterns: [/\b(last|family|surname) name\b/, /\blegal last\b/] },
  { key: "identity.preferredName", confidence: 0.9, patterns: [/\bpreferred name\b/, /\bchosen name\b/] },
  { key: "identity.email", confidence: 0.98, patterns: [/\bemail\b/, /\be mail\b/] },
  { key: "identity.phone", confidence: 0.96, patterns: [/\bphone\b/, /\bmobile\b/, /\btelephone\b/] },
  { key: "location.street", confidence: 0.9, patterns: [/\bstreet\b/, /\baddress line 1\b/, /\bhome address\b/] },
  { key: "location.city", confidence: 0.88, patterns: [/\bcity\b/] },
  { key: "location.state", confidence: 0.84, patterns: [/\bstate\b/, /\bprovince\b/, /\bregion\b/] },
  { key: "location.postalCode", confidence: 0.9, patterns: [/\bzip\b/, /\bpostal\b/] },
  { key: "location.country", confidence: 0.86, patterns: [/\bcountry\b/] },
  { key: "links.linkedin", confidence: 0.94, patterns: [/\blinkedin\b/] },
  { key: "links.github", confidence: 0.94, patterns: [/\bgithub\b/, /\bgit hub\b/] },
  { key: "links.portfolio", confidence: 0.9, patterns: [/\bportfolio\b/, /\bpersonal website\b/] },
  { key: "workAuth.authorizedToWork", confidence: 0.9, patterns: [/\bauthorized to work\b/, /\blegally work\b/, /\bright to work\b/] },
  { key: "workAuth.requiresSponsorship", confidence: 0.92, patterns: [/\bsponsor/, /\bvisa sponsorship\b/, /\brequire.*sponsorship\b/] },
  { key: "workAuth.country", confidence: 0.78, patterns: [/\bwork authorization country\b/, /\bauthorized.*country\b/] },
  { key: "documents.resume", confidence: 0.96, patterns: [/\bresume\b/, /\bcv\b/] },
  { key: "documents.coverLetter", confidence: 0.92, patterns: [/\bcover letter\b/] },
  { key: "experience", confidence: 0.82, patterns: [/\bwork experience\b/, /\bemployment history\b/, /\bexperience\b/] },
  { key: "education", confidence: 0.82, patterns: [/\beducation\b/, /\bschool\b/, /\buniversity\b/] },
  { key: "skills", confidence: 0.8, patterns: [/\bskills\b/, /\btechnologies\b/] },
  { key: "demographics.gender", confidence: 0.82, needsDemographics: true, patterns: [/\bgender\b/] },
  { key: "demographics.race", confidence: 0.82, needsDemographics: true, patterns: [/\brace\b/, /\bethnicity\b/] },
  { key: "demographics.veteranStatus", confidence: 0.82, needsDemographics: true, patterns: [/\bveteran\b/] },
  { key: "demographics.disabilityStatus", confidence: 0.82, needsDemographics: true, patterns: [/\bdisabil/] },
  { key: "demographics.hispanicLatino", confidence: 0.82, needsDemographics: true, patterns: [/\bhispanic\b/, /\blatino\b/] },
];

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
