import type { CanonicalFieldKey, MasterProfile } from "./extension";

/**
 * Shared field→answer resolver — the single source of truth used by BOTH the browser extension
 * autofill and the server apply runner, so a screening question maps to the same setup answer
 * everywhere. Pure (no DOM, no network).
 */

export function normalizeText(value: string): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const COMPANY_CONNECTION_ANSWER_KEYS = [
  "screening.company_employee_connection",
  "screening.company_contact_connection",
  "screening.company_relative_connection",
  "screening.current_employee_connection",
] as const;

const COMPANY_CONNECTION_PATTERNS = [
  /\b(?:know|knows)\s+(?:anyone|someone|any\s+current\s+employees?|a\s+current\s+employee|an?\s+employee|employees?)\b/,
  /\b(?:related|relative|relatives|family|family member|family members|spouse|partner)\b.*\b(?:work|works|working|employed|employee|employees)\b/,
  /\b(?:work|works|working|employed|employee|employees)\b.*\b(?:related|relative|relatives|family|family member|family members|spouse|partner)\b/,
  /\b(?:referred|referral)\b.*\b(?:employee|employees|someone|anyone|current)\b/,
  /\b(?:relationship|personal relationship)\b.*\b(?:employee|employees|company|organization|organisation)\b/,
] as const;

export function matchCompanyConnectionAnswer(text: string, profile: MasterProfile) {
  const normalized = normalizeText(text);
  if (!includesAny(normalized, COMPANY_CONNECTION_PATTERNS)) return null;
  return (
    profile.answers.find((answer) =>
      COMPANY_CONNECTION_ANSWER_KEYS.includes(answer.key as (typeof COMPANY_CONNECTION_ANSWER_KEYS)[number]),
    ) ?? null
  );
}

export type ResolvableField = {
  label: string;
  context?: string;
  options?: string[];
  type?: string; // text | textarea | select | radio | checkbox | file | ...
  required?: boolean;
};

type Rule = { key: CanonicalFieldKey; confidence: number; patterns: RegExp[]; needsDemographics?: boolean };

const MONEY_WORD = "(?:salary|compensation|pay|base pay|base salary|ctc|package|remuneration)";
const CURRENCY_WORD = "(?:currency|currency code|pay currency|salary currency|compensation currency)";

/** Label/heuristic rules. Kept in sync with the extension's prior inline rules. */
export const FIELD_RULES: Rule[] = [
  { key: "identity.fullName", confidence: 0.88, patterns: [/\b(full|legal) name\b/, /\bcandidate name\b/] },
  { key: "identity.firstName", confidence: 0.96, patterns: [/\b(first|given) name\b/, /\blegal first\b/] },
  { key: "identity.lastName", confidence: 0.96, patterns: [/\b(last|family|surname) name\b/, /\blegal last\b/] },
  { key: "identity.preferredName", confidence: 0.9, patterns: [/\bpreferred name\b/, /\bchosen name\b/] },
  { key: "identity.email", confidence: 0.98, patterns: [/\bemail\b/, /\be mail\b/] },
  { key: "identity.phone", confidence: 0.96, patterns: [/\bphone\b/, /\bmobile\b/, /\btelephone\b/] },
  // Work-auth before location so "authorized to work in the country" isn't read as a country field.
  { key: "workAuth.authorizedToWork", confidence: 0.9, patterns: [/\bauthorized to work\b/, /\blegally (allowed to|authorized to|able to) work\b/, /\bright to work\b/, /\bwork authorization\b/] },
  { key: "workAuth.requiresSponsorship", confidence: 0.92, patterns: [/\bsponsor/, /\bvisa sponsorship\b/, /\brequire.*sponsorship\b/, /\bvisa\b/] },
  { key: "workAuth.country", confidence: 0.78, patterns: [/\bwork authorization country\b/, /\bauthorized.*country\b/] },
  {
    key: "compensation.currentCurrency",
    confidence: 0.9,
    patterns: [
      new RegExp(`\\b(?:current|present|existing)\\s+(?:${MONEY_WORD}\\s+)?${CURRENCY_WORD}\\b`),
      new RegExp(`\\b${CURRENCY_WORD}\\s+(?:for\\s+)?(?:current|present|existing)\\s+${MONEY_WORD}\\b`),
      /\bcurrent\s+(?:annual\s+)?ctc\s+currency\b/,
    ],
  },
  {
    key: "compensation.expectedCurrency",
    confidence: 0.88,
    patterns: [
      new RegExp(`\\b(?:expected|desired|target|minimum|preferred)\\s+(?:${MONEY_WORD}\\s+)?${CURRENCY_WORD}\\b`),
      new RegExp(`\\b${CURRENCY_WORD}\\s+(?:for\\s+)?(?:expected|desired|target|minimum|preferred)\\s+${MONEY_WORD}\\b`),
      /\b(?:salary|compensation|pay|ctc)\s+currency\b/,
      /\bcurrency\b/,
    ],
  },
  {
    key: "compensation.current",
    confidence: 0.88,
    patterns: [
      new RegExp(`\\b(?:current|present|existing)\\s+${MONEY_WORD}\\b`),
      new RegExp(`\\b${MONEY_WORD}\\s+(?:current|present|existing)\\b`),
      /\bcurrent\s+(?:annual\s+)?ctc\b/,
      /\bpresent\s+(?:annual\s+)?ctc\b/,
    ],
  },
  {
    key: "compensation.expected",
    confidence: 0.88,
    patterns: [
      new RegExp(`\\b(?:expected|desired|target|minimum|preferred)\\s+${MONEY_WORD}\\b`),
      new RegExp(`\\b${MONEY_WORD}\\s+(?:expectation|expectations|expected|desired|target|minimum|preferred)\\b`),
      /\bcomp expectation\b/,
      /\bexpected\s+(?:annual\s+)?ctc\b/,
      /\bdesired\s+(?:annual\s+)?ctc\b/,
    ],
  },
  { key: "location.street", confidence: 0.9, patterns: [/\bstreet\b/, /\baddress line 1\b/, /\bhome address\b/] },
  { key: "location.city", confidence: 0.88, patterns: [/\bcity\b/] },
  { key: "location.state", confidence: 0.84, patterns: [/\bstate\b/, /\bprovince\b/, /\bregion\b/] },
  { key: "location.postalCode", confidence: 0.9, patterns: [/\bzip\b/, /\bpostal\b/] },
  { key: "location.country", confidence: 0.86, patterns: [/\bcountry\b/] },
  { key: "links.linkedin", confidence: 0.94, patterns: [/\blinkedin\b/] },
  { key: "links.github", confidence: 0.94, patterns: [/\bgithub\b/, /\bgit hub\b/] },
  { key: "links.portfolio", confidence: 0.9, patterns: [/\bportfolio\b/, /\bpersonal website\b/] },
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

function join(values: Array<string | null | undefined>) {
  return values.map((v) => v?.trim()).filter(Boolean).join(" ");
}

/** Resolve a canonical key to a concrete value from the profile (mirrors the extension's valueForKey). */
export function valueForKey(profile: MasterProfile, key: CanonicalFieldKey): string | string[] | boolean | null {
  switch (key) {
    case "identity.fullName":
      return join([profile.identity.firstName, profile.identity.lastName]);
    case "identity.firstName":
      return profile.identity.firstName;
    case "identity.lastName":
      return profile.identity.lastName;
    case "identity.preferredName":
      return profile.identity.preferredName ?? profile.identity.firstName;
    case "identity.email":
      return profile.identity.email;
    case "identity.phone":
      return profile.identity.phone;
    case "location.street":
      return profile.location.street ?? null;
    case "location.city":
      return profile.location.city ?? null;
    case "location.state":
      return profile.location.state ?? null;
    case "location.postalCode":
      return profile.location.postalCode ?? null;
    case "location.country":
      return profile.location.country ?? null;
    case "links.portfolio":
      return profile.links.portfolio ?? null;
    case "links.linkedin":
      return profile.links.linkedin ?? null;
    case "links.github":
      return profile.links.github ?? null;
    case "links.website":
      return profile.links.website[0] ?? null;
    case "workAuth.authorizedToWork":
      return profile.workAuth.authorizedToWork;
    case "workAuth.requiresSponsorship":
      return profile.workAuth.requiresSponsorship;
    case "workAuth.country":
      return profile.workAuth.country ?? profile.location.country ?? null;
    case "compensation.current": {
      const comp = profile.compensation;
      const amount = comp?.currentMin ?? comp?.currentMax ?? null;
      return amount != null && Number.isFinite(amount) ? String(Math.round(amount)) : null;
    }
    case "compensation.currentCurrency":
      return profile.compensation?.currentCurrency ?? profile.compensation?.currency ?? null;
    case "compensation.expected": {
      const comp = profile.compensation;
      const amount = comp?.expectedMin ?? comp?.expectedMax ?? null;
      return amount != null && Number.isFinite(amount) ? String(Math.round(amount)) : null;
    }
    case "compensation.expectedCurrency":
      return profile.compensation?.currency ?? profile.compensation?.currentCurrency ?? null;
    case "demographics.gender":
      return profile.demographics?.gender ?? null;
    case "demographics.race":
      return profile.demographics?.race ?? [];
    case "demographics.veteranStatus":
      return profile.demographics?.veteranStatus ?? null;
    case "demographics.disabilityStatus":
      return profile.demographics?.disabilityStatus ?? null;
    case "demographics.hispanicLatino":
      return profile.demographics?.hispanicLatino ?? null;
    case "documents.resume":
      return profile.documents.resumeUrl ?? null;
    case "documents.coverLetter":
      return profile.documents.coverLetterUrl ?? null;
    case "experience":
      return profile.experience.map((i) => `${i.title} at ${i.company}\n${i.bullets.join("\n")}`).join("\n\n");
    case "education":
      return profile.education.map((i) => join([i.degree ?? undefined, i.field ?? undefined, i.school])).join("\n");
    case "skills":
      return profile.skills.join(", ");
    case "unknown":
      return null;
    default:
      if (key.startsWith("answers.")) {
        const answerKey = key.slice("answers.".length);
        return profile.answers.find((a) => a.key === answerKey)?.value ?? null;
      }
      return null;
  }
}

export type ResolvedField = {
  canonicalKey: CanonicalFieldKey;
  value: string | string[] | boolean | null;
  confidence: number;
  source: "heuristic" | "answer" | "skip";
};

function matchReusableAnswer(field: ResolvableField, profile: MasterProfile): ResolvedField | null {
  const text = normalizeText(`${field.label} ${field.context ?? ""} ${(field.options ?? []).join(" ")}`);
  const companyConnectionAnswer = matchCompanyConnectionAnswer(text, profile);
  if (companyConnectionAnswer) {
    return {
      canonicalKey: `answers.${companyConnectionAnswer.key}`,
      value: companyConnectionAnswer.value,
      confidence: 0.84,
      source: "answer",
    };
  }
  const answer = profile.answers.find((item) => {
    const key = normalizeText(item.key);
    const prompt = normalizeText(item.prompt);
    return (key && text.includes(key)) || (prompt && (text.includes(prompt) || prompt.includes(text)));
  });
  if (!answer) return null;
  return { canonicalKey: `answers.${answer.key}`, value: answer.value, confidence: 0.8, source: "answer" };
}

/** Resolve a single field to a value using the shared rules + reusable answers. */
export function resolveFieldValue(
  field: ResolvableField,
  profile: MasterProfile,
  opts: { demographicsEnabled: boolean },
): ResolvedField {
  const text = normalizeText(`${field.label} ${field.context ?? ""} ${(field.options ?? []).join(" ")}`);
  for (const rule of FIELD_RULES) {
    if (rule.needsDemographics && !opts.demographicsEnabled) continue;
    if (!includesAny(text, rule.patterns)) continue;
    return { canonicalKey: rule.key, value: valueForKey(profile, rule.key), confidence: rule.confidence, source: "heuristic" };
  }
  const answer = matchReusableAnswer(field, profile);
  if (answer) return answer;
  return { canonicalKey: "unknown", value: null, confidence: 0, source: "skip" };
}

function isAnswerable(value: string | string[] | boolean | null): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim().length > 0;
}

const DEMOGRAPHIC_PATTERNS = FIELD_RULES.filter((r) => r.needsDemographics).flatMap((r) => r.patterns);

/**
 * A demographic/EEO question is optional — declining to self-identify is acceptable. Detected by
 * label pattern (not the resolved key), since demographics resolve to `unknown` when disabled.
 */
function looksLikeDemographic(field: ResolvableField): boolean {
  const text = normalizeText(`${field.label} ${field.context ?? ""} ${(field.options ?? []).join(" ")}`);
  return includesAny(text, DEMOGRAPHIC_PATTERNS);
}

/** Boolean/array → the string a form control expects (Yes/No, comma list). */
export function answerToString(value: string | string[] | boolean | null): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/**
 * Match a resolved answer to one of a control's option labels (radio/checkbox/select). Conservative:
 * exact (normalized) match, or Yes/No equivalence. Returns null when there's no confident match, so
 * the caller leaves the control alone and the required-field gate routes it to review.
 */
export function pickOption(value: string, options: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nv = norm(value);
  if (!nv) return null;
  const exact = options.find((o) => norm(o) === nv);
  if (exact) return exact;
  const valueTokens = nv.split(/\s+/).filter(Boolean);
  const tokenMatch = options.find((option) => {
    const optionTokens = new Set(norm(option).split(/\s+/).filter(Boolean));
    return valueTokens.length > 0 && valueTokens.every((token) => optionTokens.has(token));
  });
  if (tokenMatch) return tokenMatch;
  const YES = new Set(["yes", "y", "true"]);
  const NO = new Set(["no", "n", "false"]);
  if (YES.has(nv)) {
    const m = options.find((o) => YES.has(norm(o)));
    if (m) return m;
  }
  if (NO.has(nv)) {
    const m = options.find((o) => NO.has(norm(o)));
    if (m) return m;
  }
  return null;
}

export type FormFillPlan = {
  fills: Array<{ field: ResolvableField; canonicalKey: CanonicalFieldKey; value: string }>;
  /** Required questions we could NOT answer — the runner must route these to review, never submit blank. */
  unansweredRequired: string[];
};

const MIN_FILL_CONFIDENCE = 0.6;

/**
 * Decide, for a page's detected fields, which to fill from setup and whether any REQUIRED question
 * is unanswerable. File inputs (resume/cover letter) are handled separately and skipped here.
 * Required demographic/EEO questions are treated as optional (decline-to-answer is acceptable).
 */
export function planFormFill(
  fields: ResolvableField[],
  profile: MasterProfile,
  opts: { demographicsEnabled: boolean },
): FormFillPlan {
  const fills: FormFillPlan["fills"] = [];
  const unansweredRequired: string[] = [];

  for (const field of fields) {
    if ((field.type ?? "").toLowerCase() === "file") continue; // resume/cover letter handled elsewhere
    const resolved = resolveFieldValue(field, profile, opts);
    const answered = isAnswerable(resolved.value);

    if (answered && resolved.confidence >= MIN_FILL_CONFIDENCE) {
      fills.push({ field, canonicalKey: resolved.canonicalKey, value: answerToString(resolved.value) });
    }

    if (field.required && !answered) {
      if (looksLikeDemographic(field)) continue;
      unansweredRequired.push(field.label || resolved.canonicalKey);
    }
  }

  return { fills, unansweredRequired };
}
