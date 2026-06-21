/**
 * Field → setup-answer resolver for the apply runner.
 *
 * MIRROR of `packages/shared/src/field-resolver.ts` (the extension + web use that copy). The
 * worker compiles under NodeNext and runs as plain `node dist`, while `@jobposted/shared` is a
 * source-only Bundler-resolved package, so it can't be imported here without a build step. Keep
 * the two in sync — the logic is intentionally identical. Pure (no DOM, no network).
 */

export type ReusableAnswer = { key: string; prompt: string; value: string };

export type MasterProfileExperience = {
  title: string;
  company: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean | null;
  bullets: string[];
};

export type MasterProfileEducation = {
  school: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type MasterProfile = {
  identity: { firstName: string; lastName: string; preferredName?: string | null; email: string; phone: string };
  location: { street?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; country?: string | null };
  links: { portfolio?: string | null; linkedin?: string | null; github?: string | null; website: string[] };
  workAuth: { authorizedToWork: boolean | null; requiresSponsorship: boolean | null; country?: string | null };
  compensation?: {
    currentMin?: number | null;
    currentMax?: number | null;
    currentCurrency?: string | null;
    expectedMin?: number | null;
    expectedMax?: number | null;
    currency?: string | null;
  };
  demographics?: { gender?: string | null; race?: string[]; veteranStatus?: string | null; disabilityStatus?: string | null; hispanicLatino?: boolean | null };
  experience: MasterProfileExperience[];
  education: MasterProfileEducation[];
  skills: string[];
  answers: ReusableAnswer[];
  documents: { resumeUrl?: string | null; coverLetterUrl?: string | null };
};

export type ResolvableField = {
  label: string;
  context?: string;
  options?: string[];
  type?: string;
  required?: boolean;
};

function normalizeText(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

const PREVIOUS_COMPANY_EMPLOYMENT_ANSWER_KEYS = [
  "screening.previous_company_employment",
  "screening.previous_subsidiary_employment",
  "screening.ex_employee",
] as const;

const PREVIOUS_COMPANY_EMPLOYMENT_PATTERNS = [
  /\b(?:previously|formerly|ever|in\s+the\s+past)\s+(?:been\s+)?(?:employed|worked|work)\s+(?:by|at|for|with)\b/,
  /\b(?:been\s+)?(?:employed|worked)\s+(?:by|at|for|with).*\b(?:previously|formerly|before|in\s+the\s+past|past)\b/,
  /\b(?:former|ex)[\s-]?employee\b/,
  /\b(?:subsidiar(?:y|ies)|affiliate|affiliates)\b.*\b(?:previously|formerly|employed|worked|past)\b/,
] as const;

const AFFILIATED_COMPANY_ANSWER_KEYS = ["screening.affiliated_company_employment"] as const;

// Present-tense employment at an affiliate/subsidiary/parent. Checked AFTER previous-employment so
// "worked at a subsidiary in the past" stays a previous-employment question.
const AFFILIATED_COMPANY_PATTERNS = [
  /\b(?:work|works|working|employed|employee)\b.*\b(?:affiliate|affiliates|affiliated|subsidiar(?:y|ies)|sister compan(?:y|ies)|parent compan(?:y|ies))\b/,
  /\b(?:affiliate|affiliates|affiliated|subsidiar(?:y|ies)|sister compan(?:y|ies)|parent compan(?:y|ies))\b.*\b(?:work|works|working|employed|employee)\b/,
] as const;

const NON_COMPETE_ANSWER_KEYS = ["screening.non_compete_agreement"] as const;

const NON_COMPETE_PATTERNS = [
  /\bnon[\s-]?compete\b/,
  /\bnoncompete\b/,
  /\bnon[\s-]?competition\b/,
  /\brestrictive covenant\b/,
] as const;

const OUTSIDE_BUSINESS_ACTIVITIES_ANSWER_KEYS = [
  "screening.outside_business_activities",
  "screening.side_business_activities",
] as const;

const OUTSIDE_BUSINESS_ACTIVITIES_PATTERNS = [
  /\boutside\s+business\s+activit(?:y|ies)\b/,
  /\b(?:advisory|consulting|board)\s+roles?\b/,
  /\bside\s+(?:business(?:es)?|job|jobs|gig|gigs|hustle)\b/,
  /\boutside\s+(?:employment|work|consulting)\b/,
  /\bconflict\s+of\s+interest\b.*\b(?:business|employment|activity|activities)\b/,
] as const;

function answerForKeys<T extends readonly string[]>(profile: MasterProfile, keys: T) {
  return profile.answers.find((answer) => keys.includes(answer.key as T[number]) && isUsableAnswerValue(answer)) ?? null;
}

function profileCompanyMatchesQuestion(questionText: string, company: string | null | undefined) {
  const companyText = normalizeText(company ?? "");
  if (!companyText) return false;
  const phrase = new RegExp(`\\b${companyText.replace(/\s+/g, "\\s+")}\\b`);
  if (phrase.test(questionText)) return true;
  const compactQuestion = questionText.replace(/\s+/g, "");
  const compactCompany = companyText.replace(/\s+/g, "");
  return compactCompany.length >= 5 && compactQuestion.includes(compactCompany);
}

function inferredPreviousCompanyEmploymentAnswer(text: string, profile: MasterProfile) {
  const matched = profile.experience.some((item) => profileCompanyMatchesQuestion(text, item.company));
  if (matched) {
    return {
      key: "screening.previous_company_employment",
      prompt: "Previous company employment",
      value: "Yes",
    };
  }
  return (
    answerForKeys(profile, PREVIOUS_COMPANY_EMPLOYMENT_ANSWER_KEYS) ?? {
      key: "screening.previous_company_employment",
      prompt: "Previous company employment",
      value: "No",
    }
  );
}

function isUsableAnswerValue(answer: { prompt: string; value: string }, questionText = "") {
  const value = normalizeText(answer.value);
  if (!value) return false;
  const prompt = normalizeText(answer.prompt);
  const question = normalizeText(questionText);
  const enoughWords = value.split(/\s+/).filter(Boolean).length >= 4;
  if (prompt && (value === prompt || (enoughWords && (value.includes(prompt) || prompt.includes(value))))) return false;
  if (question && (value === question || (enoughWords && (value.includes(question) || question.includes(value))))) return false;
  return true;
}

function matchCompanyConnectionAnswer(text: string, profile: MasterProfile) {
  const normalized = normalizeText(text);
  if (!includesAny(normalized, COMPANY_CONNECTION_PATTERNS)) return null;
  return answerForKeys(profile, COMPANY_CONNECTION_ANSWER_KEYS);
}

function matchPreviousCompanyEmploymentAnswer(text: string, profile: MasterProfile) {
  const normalized = normalizeText(text);
  if (!includesAny(normalized, PREVIOUS_COMPANY_EMPLOYMENT_PATTERNS)) return null;
  return inferredPreviousCompanyEmploymentAnswer(normalized, profile);
}

function matchOutsideBusinessActivitiesAnswer(text: string, profile: MasterProfile) {
  const normalized = normalizeText(text);
  if (!includesAny(normalized, OUTSIDE_BUSINESS_ACTIVITIES_PATTERNS)) return null;
  return answerForKeys(profile, OUTSIDE_BUSINESS_ACTIVITIES_ANSWER_KEYS);
}

function matchAffiliatedCompanyAnswer(text: string, profile: MasterProfile) {
  const normalized = normalizeText(text);
  if (!includesAny(normalized, AFFILIATED_COMPANY_PATTERNS)) return null;
  return answerForKeys(profile, AFFILIATED_COMPANY_ANSWER_KEYS);
}

function matchNonCompeteAnswer(text: string, profile: MasterProfile) {
  const normalized = normalizeText(text);
  if (!includesAny(normalized, NON_COMPETE_PATTERNS)) return null;
  return answerForKeys(profile, NON_COMPETE_ANSWER_KEYS);
}

function matchScreeningReusableAnswer(text: string, profile: MasterProfile) {
  return (
    matchCompanyConnectionAnswer(text, profile) ??
    matchPreviousCompanyEmploymentAnswer(text, profile) ??
    matchAffiliatedCompanyAnswer(text, profile) ??
    matchNonCompeteAnswer(text, profile) ??
    matchOutsideBusinessActivitiesAnswer(text, profile)
  );
}

type Rule = { key: string; confidence: number; patterns: RegExp[]; needsDemographics?: boolean };

const MONEY_WORD = "(?:salary|compensation|pay|base pay|base salary|ctc|package|remuneration)";
const CURRENCY_WORD = "(?:currency|currency code|pay currency|salary currency|compensation currency)";
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
  germany: "+49",
  india: "+91",
  singapore: "+65",
  "united kingdom": "+44",
  uk: "+44",
  "united states": "+1",
  usa: "+1",
};

function phoneDigits(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D+/g, "");
}

function phoneCallingCode(phone: string | null | undefined, country: string | null | undefined) {
  const raw = phone?.trim() ?? "";
  const digits = phoneDigits(raw);
  if (raw.startsWith("+")) {
    const code = CALLING_CODES.find((candidate) => digits.startsWith(candidate));
    if (code) return `+${code}`;
    if (digits) return `+${digits.slice(0, Math.min(3, digits.length))}`;
  }
  return COUNTRY_CALLING_CODES[normalizeText(country ?? "")] ?? null;
}

function phoneNationalNumber(phone: string | null | undefined, country: string | null | undefined) {
  let digits = phoneDigits(phone);
  const code = phoneCallingCode(phone, country)?.replace(/\D+/g, "");
  if ((phone ?? "").trim().startsWith("+") && code && digits.startsWith(code)) digits = digits.slice(code.length);
  return digits.replace(/^0+/, "") || null;
}

function dateScore(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return 0;
  if (/^(present|current|now)$/i.test(trimmed)) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  const yearMonth = /^(\d{4})(?:[-/](\d{1,2}))?/.exec(trimmed);
  if (!yearMonth) return 0;
  const year = Number(yearMonth[1]);
  const month = yearMonth[2] ? Number(yearMonth[2]) - 1 : 0;
  return Date.UTC(year, Math.max(0, Math.min(11, month)), 1);
}

function currentCompany(profile: MasterProfile) {
  const experiences = profile.experience.filter((item) => item.company?.trim());
  const current =
    experiences.find((item) => item.current === true) ??
    experiences.find((item) => !item.endDate?.trim() || /^(present|current|now)$/i.test(item.endDate.trim()));
  if (current) return current.company.trim();

  const latest = [...experiences].sort((a, b) => {
    const aScore = Math.max(dateScore(a.endDate), dateScore(a.startDate));
    const bScore = Math.max(dateScore(b.endDate), dateScore(b.startDate));
    return bScore - aScore;
  })[0];
  return latest?.company.trim() || null;
}

const FIELD_RULES: Rule[] = [
  { key: "identity.fullName", confidence: 0.88, patterns: [/\b(full|legal) name\b/, /\bcandidate name\b/] },
  { key: "identity.preferredName", confidence: 0.9, patterns: [/\bpreferred(?: first)? name\b/, /\bchosen(?: first)? name\b/] },
  { key: "identity.firstName", confidence: 0.96, patterns: [/\b(first|given) name\b/, /\blegal first\b/] },
  { key: "identity.lastName", confidence: 0.96, patterns: [/\b(last|family|surname) name\b/, /\blegal last\b/] },
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
  {
    key: "experience.currentCompany",
    confidence: 0.9,
    patterns: [
      /\bcurrent\s+(?:firm|company|employer|organization|organisation)\b/,
      /\b(?:firm|company|employer|organization|organisation)\s+(?:you\s+re|you\s+are|you)?\s*(?:currently\s+)?(?:part\s+of|work(?:ing)?\s+(?:for|at)|employed\s+(?:by|with))\b/,
      /\b(?:name\s+of\s+)?(?:your\s+)?current\s+employer\b/,
    ],
  },
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

export function valueForKey(profile: MasterProfile, key: string): string | string[] | boolean | null {
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
    case "identity.phoneCountryCode":
      return phoneCallingCode(profile.identity.phone, profile.location.country);
    case "identity.phoneNational":
      return phoneNationalNumber(profile.identity.phone, profile.location.country);
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
    case "experience.currentCompany":
      return currentCompany(profile);
    case "experience":
      return profile.experience.map((i) => `${i.title} at ${i.company}\n${i.bullets.join("\n")}`).join("\n\n");
    case "education":
      return profile.education.map((i) => join([i.degree ?? undefined, i.field ?? undefined, i.school])).join("\n");
    case "skills":
      return profile.skills.join(", ");
    default:
      if (key.startsWith("answers.")) {
        const answerKey = key.slice("answers.".length);
        return profile.answers.find((a) => a.key === answerKey)?.value ?? null;
      }
      return null;
  }
}

export type ResolvedField = { canonicalKey: string; value: string | string[] | boolean | null; confidence: number; source: "heuristic" | "answer" | "skip" };

function matchReusableAnswer(field: ResolvableField, profile: MasterProfile): ResolvedField | null {
  const text = normalizeText(`${field.label} ${field.context ?? ""} ${(field.options ?? []).join(" ")}`);
  const questionText = normalizeText(`${field.label} ${field.context ?? ""}`);
  const semanticAnswer = matchScreeningReusableAnswer(text, profile);
  if (semanticAnswer && isUsableAnswerValue(semanticAnswer, questionText)) {
    return {
      canonicalKey: `answers.${semanticAnswer.key}`,
      value: semanticAnswer.value,
      confidence: 0.84,
      source: "answer",
    };
  }
  const answer = profile.answers.find((item) => {
    if (!isUsableAnswerValue(item, questionText)) return false;
    const key = normalizeText(item.key);
    const prompt = normalizeText(item.prompt);
    return (key && text.includes(key)) || (prompt && (text.includes(prompt) || prompt.includes(text)));
  });
  if (!answer) return null;
  return { canonicalKey: `answers.${answer.key}`, value: answer.value, confidence: 0.8, source: "answer" };
}

export function resolveFieldValue(field: ResolvableField, profile: MasterProfile, opts: { demographicsEnabled: boolean }): ResolvedField {
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

export function answerToString(value: string | string[] | boolean | null): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/** Conservative answer→option matcher for radio/checkbox/select (exact or Yes/No; else null). */
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
  fills: Array<{ field: ResolvableField & { ref?: string }; canonicalKey: string; value: string }>;
  unansweredRequired: string[];
};

const MIN_FILL_CONFIDENCE = 0.6;

const DEMOGRAPHIC_PATTERNS = FIELD_RULES.filter((r) => r.needsDemographics).flatMap((r) => r.patterns);

/** A demographic/EEO question is optional (decline acceptable). Detected by label, since demographics resolve to `unknown` when disabled. */
function looksLikeDemographic(field: ResolvableField): boolean {
  const text = normalizeText(`${field.label} ${field.context ?? ""} ${(field.options ?? []).join(" ")}`);
  return includesAny(text, DEMOGRAPHIC_PATTERNS);
}

export function planFormFill(
  fields: Array<ResolvableField & { ref?: string }>,
  profile: MasterProfile,
  opts: { demographicsEnabled: boolean },
): FormFillPlan {
  const fills: FormFillPlan["fills"] = [];
  const unansweredRequired: string[] = [];
  for (const field of fields) {
    if ((field.type ?? "").toLowerCase() === "file") continue;
    const resolved = resolveFieldValue(field, profile, opts);
    const answered = isAnswerable(resolved.value);
    if (answered && resolved.confidence >= MIN_FILL_CONFIDENCE) {
      fills.push({ field, canonicalKey: resolved.canonicalKey, value: answerToString(resolved.value) });
    }
    if (field.required && !answered) {
      if (looksLikeDemographic(field)) continue; // decline-to-answer is acceptable
      unansweredRequired.push(field.label || resolved.canonicalKey);
    }
  }
  return { fills, unansweredRequired };
}
