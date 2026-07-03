import type {
  ExtensionAutofillPageField,
  ExtensionAutofillPlan,
  ExtensionAutofillPlanItem,
  MasterProfile,
} from "@jobposted/shared";

type CandidateValue = string | string[] | boolean | null;

const PLACEHOLDER_OPTION = /^(select|choose|please select|select one|choose one|--|n\/a)$/i;
const OTHER_OPTION = /\b(other|not listed|not in list|not available|unlisted|not found|cannot find|unknown|none of the above|prefer not|decline|do not wish|choose not|not applicable|n\/a)\b/i;
const MERCURY_SKIP_CONFIDENCE = 0.9;
// Per-field bar for "the deterministic plan already answered this; don't spend
// Mercury tokens on it". Everything at/above this is a direct profile copy the
// model could not improve on.
const MERCURY_FIELD_CONFIDENCE = 0.85;
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

export const AUTOFILL_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields", "summary"],
  properties: {
    summary: { type: ["string", "null"] },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldId", "action", "value", "optionLabel", "confidence", "note"],
        properties: {
          fieldId: { type: "string" },
          action: { type: "string", enum: ["fill", "select", "check", "uncheck", "attach", "skip"] },
          value: {
            anyOf: [
              { type: "string" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
              { type: "null" },
            ],
          },
          optionLabel: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          note: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/**
 * Profile payload for the Mercury prompt. When `focusFields` is provided (the fields the
 * model actually has to plan), the payload is trimmed to what those fields could use:
 * bullets only when a free-text answer might draw on them, saved answers filtered by
 * token overlap with the field labels (plus the most recent few, which are usually the
 * screening answers), and the skills list shortened unless a skills-like field is present.
 */
export function profileForPrompt(profile: MasterProfile, focusFields?: ExtensionAutofillPageField[]) {
  const focus = focusFields && focusFields.length > 0 ? focusFields : null;
  const focusText = focus
    ? normalize(focus.map((field) => `${field.label} ${field.section ?? ""} ${field.options.slice(0, 12).join(" ")}`).join(" "))
    : "";
  const focusTokens = new Set(tokens(focusText));
  const wantsEssay = !focus || focus.some((field) => field.type === "textarea");
  const wantsSkills = !focus || /\b(skill|technolog|language|tool|stack|framework)\b/.test(focusText);
  const answerMatchesFocus = (answer: MasterProfile["answers"][number]) =>
    tokens(`${answer.key} ${answer.prompt}`).some((token) => focusTokens.has(token));
  const usableAnswers = profile.answers.filter((answer) => clean(answer.value));
  // Recent answers first (they arrive ordered by updated_at desc) so freshly saved
  // screening answers survive even when their prompt shares no token with the label.
  const answers = focus
    ? usableAnswers.filter((answer, index) => index < 12 || answerMatchesFocus(answer)).slice(0, 40)
    : usableAnswers.slice(0, 80);

  return {
    identity: profile.identity,
    location: profile.location,
    links: profile.links,
    workAuth: profile.workAuth,
    compensation: profile.compensation,
    demographics: profile.demographics,
    education: profile.education.slice(0, focus ? 4 : 6),
    experience: profile.experience.slice(0, focus ? 6 : 8).map((item, index) => ({
      title: item.title,
      company: item.company,
      location: item.location,
      startDate: item.startDate,
      endDate: item.endDate,
      current: item.current,
      bullets: wantsEssay ? item.bullets.slice(0, focus ? (index < 3 ? 2 : 0) : 4) : [],
    })),
    skills: profile.skills.slice(0, wantsSkills ? 40 : 12),
    answers: answers.map((answer) => ({
      key: answer.key,
      prompt: answer.prompt,
      value: clean(answer.value).slice(0, 400),
    })),
    documents: {
      resumeName: profile.documents.resumeName,
      coverLetterName: profile.documents.coverLetterName,
      hasResume: Boolean(profile.documents.resumeUrl),
      hasCoverLetter: Boolean(profile.documents.coverLetterUrl),
    },
  };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: unknown) {
  return normalize(value).replace(/\s+/g, "");
}

function tokens(value: unknown) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !["the", "and", "for", "with", "your"].includes(token));
}

function phoneDigits(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D+/g, "");
}

function phoneCallingCode(profile: MasterProfile) {
  const raw = profile.identity.phone?.trim() ?? "";
  const digits = phoneDigits(raw);
  if (raw.startsWith("+")) {
    const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate));
    if (code) return `+${code}`;
    if (digits) return `+${digits.slice(0, Math.min(3, digits.length))}`;
  }
  const country = normalize(profile.location.country ?? profile.workAuth.country);
  return COUNTRY_CALLING_CODES[country] ?? null;
}

function phoneNationalNumber(profile: MasterProfile) {
  let digits = phoneDigits(profile.identity.phone);
  const code = phoneCallingCode(profile)?.replace(/\D+/g, "");
  if (code && digits.startsWith(code) && digits.length > code.length + 6) digits = digits.slice(code.length);
  return digits.replace(/^0+/, "") || profile.identity.phone || "";
}

function optionsLookLikeCallingCodes(options: string[]) {
  return options.some((option) => /(?:^|[^\d])\+?\s*\d{1,4}(?!\d)/.test(option));
}

function titleCaseFromBoolean(value: boolean) {
  return value ? "Yes" : "No";
}

function hasCandidateValue(value: CandidateValue) {
  if (Array.isArray(value)) return value.length > 0 && value.some((item) => clean(item));
  if (typeof value === "boolean") return true;
  return Boolean(clean(value));
}

function optionScore(value: string, option: string) {
  const a = normalize(value);
  const b = normalize(option);
  if (!a || !b || PLACEHOLDER_OPTION.test(b)) return 0;
  if (a === b) return 1;
  if (compact(a) === compact(b)) return 0.99;
  if (b.includes(a) || a.includes(b)) return 0.88;
  const aTokens = tokens(a);
  const bTokens = new Set(tokens(b));
  if (aTokens.length === 0 || bTokens.size === 0) return 0;
  const overlap = aTokens.filter((token) => bTokens.has(token)).length;
  const ratio = overlap / Math.max(aTokens.length, bTokens.size);
  const orderedBonus = aTokens.some((token) => normalize(option).includes(token)) ? 0.08 : 0;
  return Math.min(0.86, ratio + orderedBonus);
}

function booleanOption(value: boolean, options: string[]) {
  const wanted = value ? /\b(yes|true|authorized|eligible|i am|agree)\b/i : /\b(no|false|not|do not|don't|decline)\b/i;
  return options.find((option) => wanted.test(option) && !PLACEHOLDER_OPTION.test(option.trim()));
}

export function pickOptionLabel(value: CandidateValue, options: string[]) {
  const normalizedOptions = options.map(clean).filter((option) => option && !PLACEHOLDER_OPTION.test(option));
  if (normalizedOptions.length === 0) return null;

  if (typeof value === "boolean") {
    const match = booleanOption(value, normalizedOptions);
    if (match) return match;
  }

  const text = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? titleCaseFromBoolean(value) : clean(value);
  if (!text) return normalizedOptions.find((option) => OTHER_OPTION.test(option)) ?? null;

  let best: { option: string; score: number } | null = null;
  for (const option of normalizedOptions) {
    const score = optionScore(text, option);
    if (!best || score > best.score) best = { option, score };
  }
  if (best && best.score >= 0.48) return best.option;

  return normalizedOptions.find((option) => OTHER_OPTION.test(option)) ?? null;
}

function isSchoolField(field: ExtensionAutofillPageField) {
  const text = normalize(`${field.label} ${field.section ?? ""}`);
  return /\b(school|university|college|institution)\b/.test(text) && !/\bdegree|field of study|major|discipline\b/.test(text);
}

function pickSchoolOptionLabel(value: CandidateValue, options: string[]) {
  const normalizedOptions = options.map(clean).filter((option) => option && !PLACEHOLDER_OPTION.test(option));
  if (normalizedOptions.length === 0) return null;
  const text = Array.isArray(value) ? value.join(", ") : typeof value === "boolean" ? titleCaseFromBoolean(value) : clean(value);
  const normalized = normalize(text);
  const compacted = compact(normalized);
  if (normalized) {
    const exact = normalizedOptions.find((option) => normalize(option) === normalized || compact(normalize(option)) === compacted);
    if (exact) return exact;
  }
  return normalizedOptions.find((option) => OTHER_OPTION.test(option)) ?? null;
}

function pickFieldOptionLabel(value: CandidateValue, field: ExtensionAutofillPageField) {
  return isSchoolField(field) ? pickSchoolOptionLabel(value, field.options) : pickOptionLabel(value, field.options);
}

function firstPresent(values: Array<string | null | undefined>) {
  return values.map(clean).find(Boolean) ?? "";
}

function join(values: Array<string | null | undefined>, separator = " ") {
  return values.map(clean).filter(Boolean).join(separator);
}

function answerFor(label: string, profile: MasterProfile) {
  const labelTokens = new Set(tokens(label));
  let best: { value: string; score: number } | null = null;
  for (const answer of profile.answers) {
    const promptTokens = tokens(`${answer.key} ${answer.prompt}`);
    const overlap = promptTokens.filter((token) => labelTokens.has(token)).length;
    const score = overlap / Math.max(1, Math.max(promptTokens.length, labelTokens.size));
    if (answer.value && (!best || score > best.score)) best = { value: answer.value, score };
  }
  return best && best.score >= 0.28 ? best.value : "";
}

function compensationValue(profile: MasterProfile, expected: boolean) {
  const compensation = profile.compensation;
  if (!compensation) return "";
  const min = expected ? compensation.expectedMin : compensation.currentMin;
  const max = expected ? compensation.expectedMax : compensation.currentMax;
  const currency = expected ? compensation.currency : compensation.currentCurrency ?? compensation.currency;
  if (min && max && min !== max) return join([String(min), String(max), currency], " - ");
  if (min || max) return join([String(min ?? max), currency]);
  return "";
}

function valueForField(field: ExtensionAutofillPageField, profile: MasterProfile): {
  value: CandidateValue;
  confidence: number;
  note: string;
} {
  const text = normalize(`${field.label} ${field.section ?? ""}`);
  const fileText = normalize(`${field.label} ${field.section ?? ""} ${field.fieldId}`);
  const raw = `${field.label} ${field.section ?? ""}`;
  const repeaterIndex = typeof field.repeaterIndex === "number" && Number.isFinite(field.repeaterIndex)
    ? Math.max(0, Math.floor(field.repeaterIndex))
    : 0;
  const firstEducation = profile.education[repeaterIndex] ?? profile.education[0];
  const firstExperience = profile.experience[repeaterIndex] ?? profile.experience[0];
  // A yes/no-style question ("Are you...", "Were you...", "...position?") must NEVER
  // be answered with a free-text profile value. The keyword matchers below would
  // otherwise grab the job title from "...civil service position" or the country
  // from "...authorized to work in the country" — exactly the bad fills we saw.
  const labelText = field.label.trim();
  const isQuestion =
    /\?\s*$/.test(labelText) ||
    /^(are|were|was|do|does|did|have|has|had|will|would|is|can|could|should|may)\b/i.test(labelText) ||
    /\bto your knowledge\b/i.test(text);

  if (
    field.optionDictionary === "phone_country_code" ||
    /\b(phone|mobile|telephone|tel|calling|dial)\b.*\b(country|code)\b|\b(country|code)\b.*\b(phone|mobile|telephone|tel|calling|dial)\b/.test(text) ||
    (/\bcountry\b/.test(text) && optionsLookLikeCallingCodes(field.options))
  ) {
    const code = phoneCallingCode(profile);
    return {
      value: code ?? "",
      confidence: code ? 0.94 : 0,
      note: code ? "Profile phone country code." : "No phone country code could be inferred.",
    };
  }

  if (
    field.type === "multiselect" &&
    /\b(sanction|export control|ofac|embargo|cuba|iran|north korea|syria|crimea|belarus|applies to you|select all that apply|prior question|previous question)\b/.test(text)
  ) {
    const safe = neutralMultiselectOption(field);
    return {
      value: safe ? [safe] : [],
      confidence: 0.55,
      note: "Defaulted to a safe compliance answer — review before submitting.",
    };
  }

  if (/\b(resume|cv|curriculum vitae)\b/.test(fileText) && field.type === "file") {
    return {
      value: profile.documents.resumeName ?? "resume",
      confidence: profile.documents.resumeUrl ? 0.96 : 0.2,
      note: profile.documents.resumeUrl ? "Attach the stored resume." : "No resume is available.",
    };
  }
  if (/\bcover letter\b/.test(fileText) && field.type === "file") {
    return {
      value: profile.documents.coverLetterName ?? "cover letter",
      confidence: profile.documents.coverLetterUrl ? 0.9 : 0.2,
      note: profile.documents.coverLetterUrl ? "Attach the stored cover letter." : "No cover letter is available.",
    };
  }
  if (/\b(first|given)\b.*\bname\b|\bgiven name\b/.test(text) && !/\bpreferred\b/.test(text)) {
    return { value: profile.identity.firstName, confidence: 0.95, note: "Profile first name." };
  }
  if (/\b(last|family|surname)\b.*\bname\b|\bfamily name\b/.test(text)) {
    return { value: profile.identity.lastName, confidence: 0.95, note: "Profile last name." };
  }
  if (/\bfull name\b|\blegal name\b|\bname\b/.test(text) && !/\bcompany|school|employer|preferred\b/.test(text)) {
    return {
      value: join([profile.identity.firstName, profile.identity.lastName]) || profile.identity.preferredName || "",
      confidence: 0.9,
      note: "Profile full name.",
    };
  }
  if (/\bpreferred\b.*\bname\b/.test(text)) {
    return {
      value: profile.identity.preferredName || profile.identity.firstName,
      confidence: profile.identity.preferredName ? 0.88 : 0.72,
      note: profile.identity.preferredName ? "Profile preferred name." : "Defaulted to first name.",
    };
  }
  if (/\bemail|e mail\b/.test(text)) return { value: profile.identity.email, confidence: 0.96, note: "Profile email." };
  if (/\b(phone|mobile|telephone)\b/.test(text)) return { value: phoneNationalNumber(profile), confidence: 0.93, note: "Profile phone national number." };
  if (/\baddress|street\b/.test(text)) return { value: profile.location.street ?? "", confidence: 0.86, note: "Profile street address." };
  if (/\bcity\b/.test(text)) {
    const city = profile.location.city ?? "";
    const value = city && isChoiceField(field) ? join([city, profile.location.state, profile.location.country], ", ") : city;
    return { value, confidence: value ? 0.9 : 0, note: "Profile city." };
  }
  if (/\b(state|province|region)\b/.test(text)) return { value: profile.location.state ?? "", confidence: 0.86, note: "Profile state." };
  if (/\b(zip|postal)\b/.test(text)) return { value: profile.location.postalCode ?? "", confidence: 0.9, note: "Profile postal code." };
  if (/\bcountry\b/.test(text) && !isQuestion) return { value: profile.location.country ?? profile.workAuth.country ?? "", confidence: 0.84, note: "Profile country." };
  if (/\blinkedin\b/.test(text)) return { value: profile.links.linkedin ?? "", confidence: 0.92, note: "Profile LinkedIn URL." };
  if (/\bgithub\b/.test(text)) return { value: profile.links.github ?? "", confidence: 0.9, note: "Profile GitHub URL." };
  if (/\b(portfolio|website|personal site)\b/.test(text)) {
    return { value: firstPresent([profile.links.portfolio, profile.links.website[0]]), confidence: 0.84, note: "Profile website." };
  }
  if (/\b(school|university|college|institution)\b/.test(text) && !isQuestion) {
    return { value: firstEducation?.school ?? "", confidence: firstEducation?.school ? 0.88 : 0, note: "Profile school." };
  }
  if (/\bdegree\b/.test(text) && !isQuestion) {
    return { value: firstEducation?.degree ?? "", confidence: firstEducation?.degree ? 0.84 : 0, note: "Profile degree." };
  }
  if (/\b(field of study|major|discipline)\b/.test(text) && !isQuestion) {
    return { value: firstEducation?.field ?? "", confidence: firstEducation?.field ? 0.84 : 0, note: "Profile field of study." };
  }
  if (/\b(company|employer|organization)\b/.test(text) && !/\bcurrent company employee\b/.test(text) && !isQuestion) {
    return { value: firstExperience?.company ?? "", confidence: firstExperience?.company ? 0.82 : 0, note: "Profile employer." };
  }
  if (/\b(job title|title|position|role)\b/.test(text) && !isQuestion) {
    return { value: firstExperience?.title ?? "", confidence: firstExperience?.title ? 0.82 : 0, note: "Profile role title." };
  }
  if (/\b(start date|from date|start month|start year)\b/.test(text)) {
    return { value: firstExperience?.startDate ?? firstEducation?.startDate ?? "", confidence: 0.72, note: "Profile start date." };
  }
  if (/\b(end date|to date|end month|end year)\b/.test(text)) {
    return { value: firstExperience?.current ? "Present" : firstExperience?.endDate ?? firstEducation?.endDate ?? "", confidence: 0.72, note: "Profile end date." };
  }
  if (/\b(skill|technology|technologies)\b/.test(text)) {
    return { value: profile.skills, confidence: profile.skills.length ? 0.8 : 0, note: "Profile skills." };
  }
  if (/\b(authori[sz]ed|eligible|right to work|work authorization|legally work)\b/.test(text)) {
    return {
      value: profile.workAuth.authorizedToWork ?? true,
      confidence: profile.workAuth.authorizedToWork == null ? 0.62 : 0.9,
      note: profile.workAuth.authorizedToWork == null ? "Defaulted to Yes for work authorization." : "Profile work authorization.",
    };
  }
  if (/\b(sponsor|sponsorship|visa)\b/.test(text)) {
    return {
      value: profile.workAuth.requiresSponsorship ?? false,
      confidence: profile.workAuth.requiresSponsorship == null ? 0.62 : 0.9,
      note: profile.workAuth.requiresSponsorship == null ? "Defaulted to No for sponsorship." : "Profile sponsorship preference.",
    };
  }
  if (/\b(18|eighteen|adult|age)\b/.test(text)) {
    return { value: true, confidence: 0.64, note: "Defaulted to Yes for age eligibility." };
  }
  if (/\bhispanic|latino|latina|latinx\b/.test(text)) {
    return {
      value: profile.demographics?.hispanicLatino ?? false,
      confidence: profile.demographics?.hispanicLatino == null ? 0.62 : 0.86,
      note: profile.demographics?.hispanicLatino == null ? "Defaulted to No for Hispanic/Latino." : "Profile demographic answer.",
    };
  }
  if (/\bgender\b/.test(text)) return { value: profile.demographics?.gender ?? "Prefer not to say", confidence: 0.58, note: "Voluntary demographic answer." };
  if (/\b(race|ethnicity)\b/.test(text)) return { value: profile.demographics?.race ?? "Prefer not to say", confidence: 0.58, note: "Voluntary demographic answer." };
  if (/\bveteran\b/.test(text)) return { value: profile.demographics?.veteranStatus ?? "Prefer not to say", confidence: 0.58, note: "Voluntary demographic answer." };
  if (/\bdisability\b/.test(text)) return { value: profile.demographics?.disabilityStatus ?? "Prefer not to say", confidence: 0.58, note: "Voluntary demographic answer." };
  if (/\bcurrent.*(salary|compensation)|current.*ctc\b/.test(text)) {
    return { value: compensationValue(profile, false), confidence: 0.72, note: "Profile current compensation." };
  }
  if (/\b(expected|desired).*(salary|compensation)|salary expectation\b/.test(text)) {
    return { value: compensationValue(profile, true), confidence: 0.72, note: "Profile expected compensation." };
  }

  const answer = answerFor(raw, profile);
  if (answer) return { value: answer, confidence: 0.72, note: "Matched a saved answer." };

  if (isQuestion) {
    // Most unmatched screening questions ("government official?", "conflict of
    // interest?", "previously employed?") are safely No. Low confidence so the
    // panel flags it for review rather than silently committing.
    return { value: false, confidence: 0.5, note: "Defaulted this screening question to No — review before submitting." };
  }
  return { value: null, confidence: 0, note: "No safe profile value found." };
}

function inferAction(field: ExtensionAutofillPageField, value: CandidateValue): ExtensionAutofillPlanItem["action"] {
  if (field.type === "file") return value ? "attach" : "skip";
  if (field.type === "checkbox" && field.options.length === 0) return value === false ? "uncheck" : value === true ? "check" : "skip";
  if (field.type === "select" || field.type === "radio" || field.type === "combobox" || field.type === "typeahead" || field.type === "multiselect" || field.options.length > 0) {
    return value == null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
      ? "skip"
      : "select";
  }
  return value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0) ? "skip" : "fill";
}

function neutralMultiselectOption(field: ExtensionAutofillPageField) {
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

function isComplianceMultiselect(field: ExtensionAutofillPageField) {
  const text = normalize(`${field.label} ${field.section ?? ""} ${field.options.join(" ")}`);
  return (
    field.type === "multiselect" &&
    /\b(sanction|export control|ofac|embargo|cuba|iran|north korea|syria|crimea|belarus|applies to you|select all that apply|prior question|previous question|none of the above|none of these|not applicable)\b/.test(
      text,
    )
  );
}

function normalizePlanItem(
  item: Partial<ExtensionAutofillPlanItem>,
  field: ExtensionAutofillPageField,
  fallback?: ExtensionAutofillPlanItem,
): ExtensionAutofillPlanItem {
  if (isSchoolField(field) && fallback?.action === "select" && clean(fallback.optionLabel)) {
    return { ...fallback, fieldId: field.fieldId };
  }

  const hasModelItem = Object.keys(item).length > 0;
  const value = item.value !== undefined ? item.value : fallback?.value ?? null;
  let action = item.action ?? fallback?.action ?? inferAction(field, value);
  let optionLabel = clean(item.optionLabel) || (!hasModelItem ? clean(fallback?.optionLabel) : null) || null;
  const requiresExactOption = !field.optionMode || field.optionMode === "full";
  const choiceField = isChoiceField(field);

  if (field.type === "multiselect") {
    // Keep the array of chosen options; never collapse a "select all that apply"
    // answer down to a single optionLabel.
    if (
      isComplianceMultiselect(field) &&
      fallback?.action === "select" &&
      (action === "skip" || !hasCandidateValue(value))
    ) {
      action = fallback.action;
      optionLabel = clean(fallback.optionLabel) || optionLabel;
      return {
        fieldId: field.fieldId,
        action,
        value: fallback.value,
        optionLabel,
        confidence: fallback.confidence,
        note: fallback.note ?? "Selected the neutral compliance option.",
      };
    }
    if (action !== "skip" && action !== "attach") action = "select";
  } else if (choiceField && action !== "skip" && action !== "attach") {
    action = "select";
    const matchedOption = field.options.length > 0 ? pickFieldOptionLabel(optionLabel || value, field) : null;
    optionLabel = matchedOption ?? optionLabel;
    const hasSelectionTarget = hasCandidateValue(optionLabel ?? value);
    action =
      matchedOption || (!requiresExactOption && hasSelectionTarget) || (field.options.length === 0 && hasSelectionTarget)
        ? "select"
        : "skip";
  }

  const confidence = Math.max(
    0,
    Math.min(1, typeof item.confidence === "number" ? item.confidence : fallback?.confidence ?? 0),
  );
  const note = clean(item.note) || clean(fallback?.note) || (action === "skip" ? "No safe fill value." : "Planned by Mercury.");

  return {
    fieldId: field.fieldId,
    action,
    value,
    optionLabel,
    confidence,
    note,
  };
}

export function buildFallbackAutofillPlan(args: {
  fields: ExtensionAutofillPageField[];
  profile: MasterProfile;
  stepName?: string | null;
}): ExtensionAutofillPlan {
  const fields = args.fields.map((field) => {
    const resolved = valueForField(field, args.profile);
    const action = inferAction(field, resolved.value);
    const item: ExtensionAutofillPlanItem = {
      fieldId: field.fieldId,
      action,
      value: resolved.value,
      optionLabel: action === "select" ? pickFieldOptionLabel(resolved.value, field) : null,
      confidence: action === "skip" ? 0 : resolved.confidence,
      note: resolved.note,
    };
    return normalizePlanItem(item, field);
  });

  return {
    stepName: args.stepName || "Current page",
    summary: "Generated a server-side fallback plan.",
    fields,
  };
}

export function normalizeAutofillPlan(args: {
  raw: unknown;
  fields: ExtensionAutofillPageField[];
  fallback: ExtensionAutofillPlan;
  stepName?: string | null;
}): ExtensionAutofillPlan {
  const rawRecord = args.raw && typeof args.raw === "object" ? (args.raw as Record<string, unknown>) : {};
  const rawFields = Array.isArray(rawRecord.fields) ? rawRecord.fields : [];
  const byId = new Map<string, Partial<ExtensionAutofillPlanItem>>();
  for (const item of rawFields) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<ExtensionAutofillPlanItem>;
    if (typeof record.fieldId === "string") byId.set(record.fieldId, record);
  }
  const fallbackById = new Map(args.fallback.fields.map((item) => [item.fieldId, item]));

  return {
    stepName: args.stepName || args.fallback.stepName || "Current page",
    summary: clean(rawRecord.summary) || args.fallback.summary || null,
    fields: args.fields.map((field) => normalizePlanItem(byId.get(field.fieldId) ?? {}, field, fallbackById.get(field.fieldId))),
  };
}

function isChoiceField(field: ExtensionAutofillPageField) {
  return (
    field.type === "select" ||
    field.type === "radio" ||
    field.type === "combobox" ||
    field.type === "typeahead" ||
    field.type === "multiselect" ||
    field.options.length > 0
  );
}

// ---------------------------------------------------------------------------
// Cross-application answer cache. The same screening questions ("Are you legally
// authorized…", "Will you require sponsorship…", pronouns, notice period, hear-about-us)
// repeat across nearly every application. Once Mercury answers one, the answer is stored
// per user and replayed locally on the next application — zero model tokens.
// ---------------------------------------------------------------------------

/** Marker platform for plan-answer rows in extension_field_mappings (cross-ATS reuse). */
export const PLAN_ANSWER_PLATFORM = "*";
export const PLAN_ANSWER_KEY = "plan_answer";
const PLAN_ANSWER_MIN_CONFIDENCE = 0.72;
// Answers replayed from cache stay below the auto-confidence bar so the panel still
// presents them as reviewable rather than silently authoritative.
const PLAN_ANSWER_MAX_REPLAY_CONFIDENCE = 0.88;

/** Questions whose answers are inherently job-, company-, or time-specific. */
const NON_REUSABLE_QUESTION =
  /\b(why|describe|tell us|explain|motivat|cover letter|essay|anything else|additional information|comments?|questions? for|note to|message|date|when can you|availab|signature|initials|referr?ed by|referral|who told you|salary history)\b/i;
const NON_REUSABLE_DICTIONARIES = new Set(["phone_country_code", "country", "region", "school"]);

export interface CachedPlanAnswer {
  value: string | string[] | boolean;
  optionLabel: string | null;
  confidence: number;
}

export function planAnswerSignature(field: Pick<ExtensionAutofillPageField, "label">) {
  const label = normalize(field.label).slice(0, 160);
  // Very short labels ("name", "city") are too ambiguous to reuse across sites — and the
  // deterministic layer answers those anyway.
  return label.length >= 8 ? `plan:v1:${label}` : null;
}

/** Returns the cacheable payload for a model-planned item, or null when it must not be reused. */
export function cacheablePlanAnswer(
  field: ExtensionAutofillPageField,
  item: ExtensionAutofillPlanItem,
): { signature: string; answer: CachedPlanAnswer } | null {
  if (field.type === "file" || field.type === "date" || field.repeater) return null;
  if (item.action !== "fill" && item.action !== "select" && item.action !== "check" && item.action !== "uncheck") return null;
  if (item.confidence < PLAN_ANSWER_MIN_CONFIDENCE) return null;
  if (field.optionDictionary && NON_REUSABLE_DICTIONARIES.has(field.optionDictionary)) return null;
  if (NON_REUSABLE_QUESTION.test(`${field.label} ${field.section ?? ""}`)) return null;
  const signature = planAnswerSignature(field);
  if (!signature) return null;

  const value =
    item.action === "check" ? true : item.action === "uncheck" ? false : item.value ?? (clean(item.optionLabel) || null);
  if (value == null) return null;
  if (typeof value === "string" && (!value.trim() || value.length > 200)) return null;
  if (Array.isArray(value) && (value.length === 0 || value.join(", ").length > 300)) return null;
  return {
    signature,
    answer: {
      value,
      optionLabel: clean(item.optionLabel) || null,
      confidence: Math.max(0, Math.min(1, item.confidence)),
    },
  };
}

function parseCachedAnswer(raw: unknown): CachedPlanAnswer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const value = record.value;
  const isValidValue =
    typeof value === "string" || typeof value === "boolean" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
  if (!isValidValue) return null;
  return {
    value: value as CachedPlanAnswer["value"],
    optionLabel: typeof record.optionLabel === "string" && record.optionLabel.trim() ? record.optionLabel : null,
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
  };
}

/**
 * Materialize a cached answer against the live field. Options differ site-to-site, so the
 * stored value is re-matched against the current option list; when an exact option is
 * required and none matches, the field falls through to Mercury instead.
 */
export function planItemFromCachedAnswer(field: ExtensionAutofillPageField, raw: unknown): ExtensionAutofillPlanItem | null {
  const cached = parseCachedAnswer(raw);
  if (!cached) return null;
  const confidence = Math.min(Math.max(0, cached.confidence), PLAN_ANSWER_MAX_REPLAY_CONFIDENCE);
  if (confidence < PLAN_ANSWER_MIN_CONFIDENCE) return null;
  if (field.type === "file") return null;
  const note = "Reused your saved answer to this question.";
  const requiresExactOption = !field.optionMode || field.optionMode === "full";

  if (field.type === "checkbox" && field.options.length === 0) {
    if (typeof cached.value !== "boolean") return null;
    return { fieldId: field.fieldId, action: cached.value ? "check" : "uncheck", value: cached.value, optionLabel: null, confidence, note };
  }

  if (field.type === "multiselect") {
    const values = Array.isArray(cached.value) ? cached.value.map(clean).filter(Boolean) : [clean(cached.value)].filter(Boolean);
    if (values.length === 0) return null;
    if (requiresExactOption && field.options.length > 0) {
      const matched = values.map((value) => pickOptionLabel(value, field.options));
      if (matched.some((value) => !value)) return null;
      return { fieldId: field.fieldId, action: "select", value: matched as string[], optionLabel: null, confidence, note };
    }
    return { fieldId: field.fieldId, action: "select", value: values, optionLabel: null, confidence, note };
  }

  if (isChoiceField(field)) {
    const wanted = cached.optionLabel ?? cached.value;
    const matched = field.options.length > 0 ? pickFieldOptionLabel(wanted, field) : null;
    if (requiresExactOption && field.options.length > 0 && !matched) return null;
    return {
      fieldId: field.fieldId,
      action: "select",
      value: cached.value,
      optionLabel: matched ?? cached.optionLabel,
      confidence,
      note,
    };
  }

  if (!hasCandidateValue(cached.value)) return null;
  return { fieldId: field.fieldId, action: "fill", value: cached.value, optionLabel: null, confidence, note };
}

function hasConcreteValue(item: ExtensionAutofillPlanItem) {
  if (Array.isArray(item.value)) return item.value.length > 0 && item.value.every((value) => clean(value));
  if (typeof item.value === "boolean") return true;
  return Boolean(clean(item.value));
}

/**
 * True when the plan item is a decision the deterministic layer fully stands behind:
 * confident, with a concrete value, and (for choice fields) an exact option to select.
 */
export function isConfidentPlanItem(
  field: ExtensionAutofillPageField,
  item: ExtensionAutofillPlanItem,
  threshold = MERCURY_SKIP_CONFIDENCE,
) {
  if (item.action === "skip") return !field.required;
  if (item.confidence < threshold) return false;
  if ((item.action === "fill" || item.action === "attach") && !hasConcreteValue(item)) return false;

  if (isChoiceField(field)) {
    const requiresExactOption = !field.optionMode || field.optionMode === "full";
    if (field.type === "multiselect") {
      const values = Array.isArray(item.value) ? item.value : clean(item.optionLabel) ? [clean(item.optionLabel)] : [];
      if (values.length === 0) return false;
      if (requiresExactOption && field.options.length > 0 && values.some((value) => !pickOptionLabel(value, field.options))) return false;
    } else if (requiresExactOption && field.options.length > 0 && !clean(item.optionLabel)) {
      return false;
    }
  }
  return true;
}

export function canSkipMercuryForPlan(args: {
  fields: ExtensionAutofillPageField[];
  plan: ExtensionAutofillPlan;
}) {
  const fieldsById = new Map(args.fields.map((field) => [field.fieldId, field]));
  let actionable = 0;

  for (const item of args.plan.fields) {
    const field = fieldsById.get(item.fieldId);
    if (!field) return false;
    if (!isConfidentPlanItem(field, item)) return false;
    if (item.action !== "skip") actionable += 1;
  }

  return actionable > 0;
}

/**
 * Split the page between fields the local plan already answers and fields that still
 * need Mercury. File fields never go to the model (it cannot attach documents, and the
 * prompt forbids fabricating document names), and `lockedIds` lets the caller pin fields
 * resolved from the answer cache. A confident "skip" is NOT locked: an unanswered
 * optional question is exactly what the model should get a chance to answer.
 */
export function partitionPlanFields(args: {
  fields: ExtensionAutofillPageField[];
  plan: ExtensionAutofillPlan;
  lockedIds?: ReadonlySet<string>;
}) {
  const itemById = new Map(args.plan.fields.map((item) => [item.fieldId, item]));
  const unresolved: ExtensionAutofillPageField[] = [];
  for (const field of args.fields) {
    if (args.lockedIds?.has(field.fieldId)) continue;
    if (field.type === "file") continue;
    const item = itemById.get(field.fieldId);
    if (item && item.action !== "skip" && isConfidentPlanItem(field, item, MERCURY_FIELD_CONFIDENCE)) continue;
    unresolved.push(field);
  }
  return { unresolved };
}

/**
 * Long slugged fieldIds ("jp-are-you-legally-authorized-...-radio-14") are paid twice —
 * in the prompt and again in the response. Swap them for "f0","f1",… before calling the
 * model and restore afterwards.
 */
export function withShortFieldIds(fields: ExtensionAutofillPageField[]) {
  const toOriginal = new Map<string, string>();
  const shortFields = fields.map((field, index) => {
    const shortId = `f${index}`;
    toOriginal.set(shortId, field.fieldId);
    return { ...field, fieldId: shortId };
  });
  return { shortFields, toOriginal };
}

export function restorePlanFieldIds(raw: unknown, toOriginal: ReadonlyMap<string, string>): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.fields)) return raw;
  return {
    ...record,
    fields: record.fields.map((item) => {
      if (!item || typeof item !== "object") return item;
      const planItem = item as Record<string, unknown>;
      const fieldId = typeof planItem.fieldId === "string" ? planItem.fieldId : "";
      return { ...planItem, fieldId: toOriginal.get(fieldId) ?? fieldId };
    }),
  };
}
