import { parseResumeRobustly } from "@/lib/rezoomed-resume-parser/serverResumeParsing";
import { getResumeSkills, resumeDataToPlainText } from "@/lib/rezoomed-resume-parser/resume-data";
import type { ExperienceItem, ResumeData } from "@/lib/rezoomed-resume-parser/types";
import {
  asString,
  sanitizeOnboardingConfig,
  type OnboardingConfig,
  type OnboardingEducation,
  type OnboardingExperience,
  type WorkLocationPreference,
} from "./model";
import { TOP_SPOKEN_LANGUAGES } from "./languages";

export type ParsedResumeProfile = {
  search?: Partial<OnboardingConfig["search"]>;
  filters?: Partial<OnboardingConfig["filters"]>;
  basics?: Partial<OnboardingConfig["profile"]["basics"]>;
  links?: Partial<OnboardingConfig["profile"]["links"]>;
  workAuth?: Partial<OnboardingConfig["profile"]["workAuth"]>;
  headline?: string;
  summary?: string;
  skills?: string[];
  experience?: OnboardingExperience[];
  education?: OnboardingEducation[];
  screening?: Partial<OnboardingConfig["profile"]["screening"]>;
};

const MAX_TEXT_CHARS = 28_000;
const PDF_MIME_TYPE = "application/pdf";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_MIME_TYPE = "text/plain";
const KNOWN_INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "Consumer", "AI", "Developer tools", "E-commerce"];
const SUPPORTED_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "INR",
  "CAD",
  "AUD",
  "SGD",
  "AED",
  "SAR",
  "JPY",
  "CNY",
  "HKD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "ZAR",
  "BRL",
  "MXN",
]);
const COUNTRY_CURRENCY_PATTERNS: Array<{ currency: string; patterns: RegExp[] }> = [
  { currency: "INR", patterns: [/\bindia\b/i, /\bbharat\b/i, /\b(?:bengaluru|bangalore|mumbai|delhi|pune|hyderabad|chennai|kolkata|ahmedabad|gurugram|noida)\b/i] },
  { currency: "USD", patterns: [/\b(?:united states|usa|u\.s\.a\.|u\.s\.|america)\b/i, /\b(?:san francisco|new york|austin|seattle|boston|los angeles|chicago)\b/i] },
  { currency: "CAD", patterns: [/\bcanada\b/i, /\b(?:toronto|vancouver|montreal|ottawa|ontario|british columbia|quebec)\b/i] },
  { currency: "GBP", patterns: [/\b(?:united kingdom|uk|u\.k\.|england|scotland|wales|northern ireland|london)\b/i] },
  { currency: "EUR", patterns: [/\b(?:germany|france|spain|italy|netherlands|ireland|portugal|belgium|austria|finland|greece|european union|eurozone)\b/i, /\b(?:berlin|munich|paris|madrid|barcelona|amsterdam|dublin|lisbon|rome|milan)\b/i] },
  { currency: "AUD", patterns: [/\baustralia\b/i, /\b(?:sydney|melbourne|brisbane|perth)\b/i] },
  { currency: "SGD", patterns: [/\bsingapore\b/i] },
  { currency: "AED", patterns: [/\b(?:united arab emirates|uae|dubai|abu dhabi)\b/i] },
  { currency: "SAR", patterns: [/\b(?:saudi arabia|riyadh|jeddah)\b/i] },
  { currency: "JPY", patterns: [/\b(?:japan|tokyo|osaka)\b/i] },
  { currency: "CNY", patterns: [/\b(?:china|beijing|shanghai|shenzhen)\b/i] },
  { currency: "HKD", patterns: [/\bhong kong\b/i] },
  { currency: "NZD", patterns: [/\b(?:new zealand|auckland|wellington)\b/i] },
  { currency: "CHF", patterns: [/\b(?:switzerland|zurich|geneva)\b/i] },
  { currency: "SEK", patterns: [/\b(?:sweden|stockholm)\b/i] },
  { currency: "NOK", patterns: [/\b(?:norway|oslo)\b/i] },
  { currency: "DKK", patterns: [/\b(?:denmark|copenhagen)\b/i] },
  { currency: "ZAR", patterns: [/\b(?:south africa|cape town|johannesburg)\b/i] },
  { currency: "BRL", patterns: [/\b(?:brazil|sao paulo|rio de janeiro)\b/i] },
  { currency: "MXN", patterns: [/\b(?:mexico|mexico city)\b/i] },
];
const KNOWN_LANGUAGES = [...TOP_SPOKEN_LANGUAGES];

function cleanText(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function detectFileType(file: File) {
  return detectFileTypeFromName(file.name, file.type);
}

function detectFileTypeFromName(fileName: string, contentType = "") {
  const name = fileName.toLowerCase();
  const type = contentType.toLowerCase();
  if (type === PDF_MIME_TYPE || name.endsWith(".pdf")) return PDF_MIME_TYPE;
  if (type === DOCX_MIME_TYPE || name.endsWith(".docx")) return DOCX_MIME_TYPE;
  if (type === TEXT_MIME_TYPE || name.endsWith(".txt")) return TEXT_MIME_TYPE;
  return TEXT_MIME_TYPE;
}

export class ResumeParseError extends Error {
  constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "ResumeParseError";
  }
}

function isCurrentRole(endDate: string) {
  return /^(present|current|now|ongoing)$/i.test(endDate.trim());
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 20) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = compactText(asString(value));
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }

  return result;
}

function sanitizeUrl(value: string) {
  const trimmed = compactText(value).replace(/[),.;]+$/g, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function extractUrls(text: string) {
  const matches = text.match(/(?:https?:\/\/|www\.)[^\s<>"')]+|(?:github|linkedin)\.com\/[^\s<>"')]+/gi) ?? [];
  return uniqueStrings(matches.map(sanitizeUrl), 20);
}

function firstMatchingUrl(urls: string[], pattern: RegExp) {
  return urls.find((url) => pattern.test(url)) ?? "";
}

function allResumeText(data: ResumeData, sourceText = "") {
  return [resumeDataToPlainText(data), sourceText].filter(Boolean).join("\n");
}

function normalizedResumeSkills(data: ResumeData) {
  const projectSkills = (data.projects ?? []).flatMap((project) => project.technologies ?? []);
  const certificationNames = (data.certifications ?? []).map((certification) => certification.name);
  const skillSections = getResumeSkills({ skills: data.skills ?? [], skillSections: data.skillSections });
  return uniqueStrings([...skillSections, ...projectSkills, ...certificationNames], 60);
}

function extractSearchTitles(data: ResumeData) {
  return uniqueStrings(
    [
      data.currentRole,
      ...(data.experience ?? []).map((item) => item.title),
      ...(data.volunteer ?? []).map((item) => item.title),
    ],
    5,
  );
}

function inferSeniority(titles: string[]) {
  const joined = titles.join(" ");
  const values: string[] = [];
  if (/\b(?:intern|trainee|graduate|junior|entry[-\s]?level)\b/i.test(joined)) values.push("Entry Level");
  if (/\b(?:associate|analyst|coordinator)\b/i.test(joined)) values.push("Associate Level");
  if (/\b(?:senior|sr\.?|lead|staff|principal|manager|architect|consultant)\b/i.test(joined)) {
    values.push("Mid-to-Senior Level");
  }
  if (/\b(?:director|head|vp|vice president|chief|cxo|cto|ceo|coo|founder)\b/i.test(joined)) {
    values.push("Director Level and above");
  }
  return uniqueStrings(values, 4);
}

function inferIndustries(text: string) {
  const haystack = text.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ["SaaS", /\bsaas\b|software as a service/],
    ["Fintech", /\bfintech\b|payments?|banking|lending|insurance|financial services/],
    ["Healthcare", /healthcare|health care|clinical|medical|hospital|pharma/],
    ["Consumer", /\bconsumer\b|b2c|retail|marketplace/],
    ["AI", /\bai\b|artificial intelligence|machine learning|\bml\b|llm|generative ai/],
    ["Developer tools", /developer tools?|devtools|api platform|sdk|infrastructure|cloud platform/],
    ["E-commerce", /e-?commerce|shopify|commerce|online store/],
  ];
  return checks
    .filter(([label, pattern]) => KNOWN_INDUSTRIES.includes(label) && pattern.test(haystack))
    .map(([label]) => label)
    .slice(0, 6);
}

function normalizeLanguages(values: string[], text: string) {
  const explicit = values.flatMap((value) =>
    value
      .split(/[,/|;]+/)
      .map((part) => part.replace(/\b(?:native|fluent|professional|working|limited|proficient)\b/gi, "").trim()),
  );
  const discovered = KNOWN_LANGUAGES.filter((language) => new RegExp(`\\b${language}\\b`, "i").test(text));
  return uniqueStrings([...explicit, ...discovered], 8);
}

function mapExperience(item: ExperienceItem): OnboardingExperience {
  const summary = asString(item.summary);
  const bullets = uniqueStrings([...(item.bullets ?? []), summary], 8);
  return {
    company: asString(item.company),
    title: asString(item.title),
    location: asString(item.location),
    startDate: asString(item.startDate),
    endDate: asString(item.endDate),
    current: isCurrentRole(asString(item.endDate)),
    bullets,
  };
}

function extractGpa(data: ResumeData, text: string) {
  const fromEducation = uniqueStrings((data.education ?? []).map((item) => item.gpa), 1)[0];
  if (fromEducation) return fromEducation;
  return text.match(/\b(?:CGPA|GPA)\b\s*[:\-]?\s*([0-9]+(?:\.\d+)?(?:\s*\/\s*[0-9]+(?:\.\d+)?)?)/i)?.[1] ?? "";
}

function extractDateOfBirth(text: string) {
  return (
    text.match(
      /\b(?:date of birth|dob|birth date)\b\s*[:\-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4})/i,
    )?.[1] ?? ""
  );
}

function explicitBoolean(text: string, positive: RegExp, negative: RegExp): boolean | null {
  if (negative.test(text)) return false;
  if (positive.test(text)) return true;
  return null;
}

function extractOver18(text: string): boolean | null {
  if (/\b(?:over|above|at least)\s+18\b/i.test(text)) return true;
  if (/\bunder\s+18\b/i.test(text)) return false;
  return null;
}

function extractHybridPreference(text: string, workLocations: WorkLocationPreference[]) {
  if (/\b(?:5|five)\s*(?:day|days)\s*(?:wfo|work\s+from\s+office)\b|\bwfo\b|\bwork\s+from\s+office\b/i.test(text)) {
    return "5 day WFO";
  }
  if (/\bremote\s+only\b|\bfully\s+remote\b/i.test(text)) return "Full remote";
  if (/\bopen to hybrid\b/i.test(text)) return "Full remote, Hybrid";
  if (/\bhybrid preferred\b|\bhybrid\b/i.test(text)) return "Hybrid";
  if (/\bon[-\s]?site\b|\bin[-\s]?office\b/i.test(text)) return "Hybrid";
  if (workLocations.includes("remote") && workLocations.includes("onsite_hybrid")) return "Full remote, Hybrid";
  if (workLocations.includes("remote")) return "Full remote";
  if (workLocations.includes("onsite_hybrid")) return "Hybrid";
  return "";
}

function extractDrivingLicenses(text: string) {
  const values: string[] = [];
  if (/\b(?:no|do not|don't)\s+(?:have\s+)?(?:a\s+)?driv(?:ing|er'?s?)\s+licen[cs]e/i.test(text)) {
    values.push("I don't have a driving license");
  } else {
    if (/\b(?:car|class\s+[a-d])\s+(?:driv(?:ing|er'?s?)\s+)?licen[cs]e\b/i.test(text)) values.push("Car");
    if (/\bmotorcycle\s+(?:driv(?:ing|er'?s?)\s+)?licen[cs]e\b/i.test(text)) values.push("Motorcycle");
    if (/\b(?:commercial|cdl|hgv|lgv)\s+(?:driv(?:ing|er'?s?)\s+)?licen[cs]e\b/i.test(text)) values.push("Commercial");
  }
  return uniqueStrings(values, 4);
}

function extractSecurityClearance(text: string) {
  const line = text
    .split(/\n+/)
    .map(compactText)
    .find((part) => /\b(?:security\s+clearance|secret clearance|top secret|ts\/sci)\b/i.test(part));
  return line ?? "";
}

function currencyFromSymbol(symbol: string) {
  if (symbol === "₹") return "INR";
  if (symbol === "€") return "EUR";
  if (symbol === "£") return "GBP";
  if (symbol === "$") return "USD";
  return null;
}

function inferCurrencyFromLocale(location: string, text: string) {
  const haystack = `${location}\n${text.slice(0, 6000)}`;
  for (const { currency, patterns } of COUNTRY_CURRENCY_PATTERNS) {
    if (!SUPPORTED_CURRENCIES.has(currency)) continue;
    if (patterns.some((pattern) => pattern.test(haystack))) return currency;
  }
  return null;
}

function extractSalary(text: string, kind: "current" | "expected") {
  const label =
    kind === "current"
      ? "(?:current\\s+(?:salary|ctc|compensation)|ctc)"
      : "(?:expected\\s+(?:salary|ctc|compensation)|salary\\s+expectation)";
  const match = text.match(
    new RegExp(`${label}[^\\n\\d$₹€£]{0,24}([$₹€£])?\\s*([0-9][0-9,]*(?:\\.\\d+)?)\\s*(?:-|to|–)?\\s*([$₹€£])?\\s*([0-9][0-9,]*(?:\\.\\d+)?)?`, "i"),
  );
  if (!match) return null;
  const currency = currencyFromSymbol(match[1] || match[3] || "");
  const first = Number(match[2]?.replace(/,/g, ""));
  const second = Number(match[4]?.replace(/,/g, ""));
  if (!Number.isFinite(first)) return null;
  return {
    min: Math.round(first),
    max: Number.isFinite(second) ? Math.round(second) : null,
    currency,
  };
}

function profileFromResumeData(data: ResumeData, sourceText = ""): ParsedResumeProfile {
  const text = allResumeText(data, sourceText);
  const urls = uniqueStrings([data.linkedin, data.website, ...extractUrls(text)].map(sanitizeUrl), 20);
  const linkedin = firstMatchingUrl(urls, /linkedin\.com/i) || asString(data.linkedin);
  const github = firstMatchingUrl(urls, /github\.com/i);
  const portfolio = urls.find((url) => !/linkedin\.com|github\.com/i.test(url)) ?? "";
  const titles = extractSearchTitles(data);
  const skills = normalizedResumeSkills(data);
  const languages = normalizeLanguages(data.languages ?? [], text);
  const rawLocation = asString(data.location);
  const onsiteLocation = rawLocation && !/\b(?:remote|worldwide|global)\b/i.test(rawLocation) ? rawLocation : "";
  const workLocationSet = new Set<WorkLocationPreference>();
  if (/\bremote\b/i.test(text)) workLocationSet.add("remote");
  if (onsiteLocation) workLocationSet.add("onsite_hybrid");
  const workLocations = [...workLocationSet];
  const relocationOk = explicitBoolean(
    text,
    /\b(?:open|willing|available)\s+to\s+relocat(?:e|ion)\b|\brelocation\s*:\s*(?:yes|open)\b/i,
    /\b(?:not|unwilling|unable)\s+to\s+relocat(?:e|ion)\b|\brelocation\s*:\s*no\b/i,
  );
  const travelOk = explicitBoolean(
    text,
    /\b(?:open|willing|available)\s+to\s+travel\b|\btravel\s*:\s*(?:yes|open)\b/i,
    /\b(?:not|unwilling|unable)\s+to\s+travel\b|\btravel\s*:\s*no\b/i,
  );
  const needsSponsorship = explicitBoolean(
    text,
    /\b(?:require|need|seeking)\s+(?:visa\s+)?sponsorship\b|\bsponsorship\s*:\s*yes\b/i,
    /\b(?:do\s+not|don't|does\s+not|no)\s+(?:require|need)\s+(?:visa\s+)?sponsorship\b|\bno\s+(?:visa\s+)?sponsorship\s+(?:required|needed)\b|\bwithout\s+(?:visa\s+)?sponsorship\b|\bsponsorship\s*:\s*no\b/i,
  );
  const authorizedToWork = explicitBoolean(
    text,
    /\b(?:legally\s+)?authorized\s+to\s+work\b|\bright\s+to\s+work\b|\beligible\s+to\s+work\b|\bwork authorization\s*:\s*(?:yes|authorized)\b/i,
    /\bnot\s+(?:legally\s+)?authorized\s+to\s+work\b|\bnot\s+eligible\s+to\s+work\b|\bno\s+work authorization\b|\bwork authorization\s*:\s*no\b/i,
  );
  const currentSalary = extractSalary(text, "current");
  const expectedSalary = extractSalary(text, "expected");
  const inferredCurrency = inferCurrencyFromLocale(rawLocation, text);

  return {
    search: {
      ...(workLocations.length ? { workLocations } : {}),
      ...(onsiteLocation ? { onsiteLocation } : {}),
      ...(titles.length ? { titles } : {}),
    },
    filters: {
      seniority: inferSeniority(titles),
      industries: inferIndustries(text),
      languages,
      includeKeywords: skills.slice(0, 16),
    },
    basics: {
      fullName: asString(data.name),
      email: asString(data.email),
      phone: asString(data.phone),
      location: rawLocation,
    },
    links: {
      linkedin,
      portfolio,
      github,
    },
    workAuth: {
      authorizedToWork,
      needsSponsorship,
      relocationOk,
      ...(inferredCurrency
        ? {
            currentSalaryCurrency: inferredCurrency,
            salaryCurrency: inferredCurrency,
          }
        : {}),
      ...(currentSalary
        ? {
            currentSalaryMin: currentSalary.min,
            currentSalaryMax: currentSalary.max,
            currentSalaryCurrency: currentSalary.currency ?? inferredCurrency ?? undefined,
          }
        : {}),
      ...(expectedSalary
        ? {
            salaryMin: expectedSalary.min,
            salaryMax: expectedSalary.max,
            salaryCurrency: expectedSalary.currency ?? inferredCurrency ?? undefined,
          }
        : {}),
    },
    headline: asString(data.currentRole) || titles[0],
    summary: asString(data.summary),
    skills,
    experience: [...(data.experience ?? []), ...(data.volunteer ?? [])]
      .map(mapExperience)
      .filter((item) => item.company || item.title || item.bullets.length > 0)
      .slice(0, 8),
    education: data.education
      .map((item) => ({
        school: asString(item.institution),
        degree: asString(item.degree),
        field: asString(item.field),
        startDate: asString(item.startDate),
        endDate: asString(item.endDate || item.graduationDate),
        gpa: asString(item.gpa),
      }))
      .filter((item) => item.school || item.degree)
      .slice(0, 6),
    screening: {
      hybridPreference: extractHybridPreference(text, workLocations),
      travelOk,
      relocationOk,
      spokenLanguages: languages,
      dateOfBirth: extractDateOfBirth(text),
      gpa: extractGpa(data, text),
      over18: extractOver18(text),
      drivingLicenses: extractDrivingLicenses(text),
      securityClearance: extractSecurityClearance(text),
    },
  };
}

export async function parseResumeProfileFromBuffer({
  buffer,
  fileName,
  contentType = "",
}: {
  buffer: Buffer;
  fileName: string;
  contentType?: string;
}) {
  const fileType = detectFileTypeFromName(fileName, contentType);
  const result = await parseResumeRobustly({ buffer, fileType });
  const candidate = result.selectedCandidate;

  if (!candidate) {
    if (result.failureReason === "password_protected_pdf") {
      throw new ResumeParseError("password_protected_pdf", "password_protected_pdf");
    }

    if (result.failureReason === "scanned_pdf") {
      throw new ResumeParseError("scanned_pdf", "scanned_pdf");
    }

    throw new ResumeParseError("resume_parse_failed", "resume_parse_failed");
  }

  const sourceText = fileType === TEXT_MIME_TYPE ? buffer.toString("utf8") : "";

  return {
    text: cleanText(resumeDataToPlainText(candidate.data) || sourceText),
    parsed: profileFromResumeData(candidate.data, sourceText),
    diagnostics: {
      source: candidate.source,
      confidence: candidate.confidence,
      sourceTextLength: result.sourceTextLength,
      repairAttempted: result.repairAttempted,
      repairUsed: candidate.source === "repair",
    },
  };
}

export async function parseResumeProfile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return parseResumeProfileFromBuffer({
    buffer,
    fileName: file.name,
    contentType: file.type,
  });
}

export function mergeParsedIntoOnboarding(
  current: OnboardingConfig,
  parsed: ParsedResumeProfile,
): OnboardingConfig {
  const next = sanitizeOnboardingConfig(current);
  const parsedWorkAuth = parsed.workAuth ?? {};
  const parsedScreening = parsed.screening ?? {};
  return sanitizeOnboardingConfig({
    ...next,
    search: {
      ...next.search,
      workLocations: parsed.search?.workLocations?.length ? parsed.search.workLocations : next.search.workLocations,
      remoteScope: parsed.search?.remoteScope || next.search.remoteScope,
      onsiteLocation: parsed.search?.onsiteLocation || next.search.onsiteLocation,
      jobTypes: parsed.search?.jobTypes?.length ? parsed.search.jobTypes : next.search.jobTypes,
      titles: parsed.search?.titles?.length ? parsed.search.titles : next.search.titles,
    },
    filters: {
      ...next.filters,
      match: parsed.filters?.match || next.filters.match,
      seniority: parsed.filters?.seniority?.length ? parsed.filters.seniority : next.filters.seniority,
      timeZones: parsed.filters?.timeZones?.length ? parsed.filters.timeZones : next.filters.timeZones,
      industries: parsed.filters?.industries?.length ? parsed.filters.industries : next.filters.industries,
      languages: parsed.filters?.languages?.length ? parsed.filters.languages : next.filters.languages,
      includeKeywords: parsed.filters?.includeKeywords?.length
        ? parsed.filters.includeKeywords
        : next.filters.includeKeywords,
      excludeKeywords: parsed.filters?.excludeKeywords?.length
        ? parsed.filters.excludeKeywords
        : next.filters.excludeKeywords,
      excludeCompanies: parsed.filters?.excludeCompanies?.length
        ? parsed.filters.excludeCompanies
        : next.filters.excludeCompanies,
    },
    profile: {
      ...next.profile,
      basics: {
        fullName: parsed.basics?.fullName || next.profile.basics.fullName,
        email: parsed.basics?.email || next.profile.basics.email,
        phone: parsed.basics?.phone || next.profile.basics.phone,
        location: parsed.basics?.location || next.profile.basics.location,
      },
      links: {
        linkedin: parsed.links?.linkedin || next.profile.links.linkedin,
        portfolio: parsed.links?.portfolio || next.profile.links.portfolio,
        github: parsed.links?.github || next.profile.links.github,
      },
      workAuth: {
        ...next.profile.workAuth,
        authorizedToWork:
          typeof parsedWorkAuth.authorizedToWork === "boolean"
            ? parsedWorkAuth.authorizedToWork
            : next.profile.workAuth.authorizedToWork,
        needsSponsorship:
          typeof parsedWorkAuth.needsSponsorship === "boolean"
            ? parsedWorkAuth.needsSponsorship
            : next.profile.workAuth.needsSponsorship,
        relocationOk:
          typeof parsedWorkAuth.relocationOk === "boolean"
            ? parsedWorkAuth.relocationOk
            : next.profile.workAuth.relocationOk,
        currentSalaryMin: parsedWorkAuth.currentSalaryMin ?? next.profile.workAuth.currentSalaryMin,
        currentSalaryMax: parsedWorkAuth.currentSalaryMax ?? next.profile.workAuth.currentSalaryMax,
        currentSalaryCurrency:
          parsedWorkAuth.currentSalaryCurrency || next.profile.workAuth.currentSalaryCurrency,
        salaryMin: parsedWorkAuth.salaryMin ?? next.profile.workAuth.salaryMin,
        salaryMax: parsedWorkAuth.salaryMax ?? next.profile.workAuth.salaryMax,
        salaryCurrency: parsedWorkAuth.salaryCurrency || next.profile.workAuth.salaryCurrency,
      },
      headline: parsed.headline || next.profile.headline,
      summary: parsed.summary || next.profile.summary,
      skills: parsed.skills?.length ? parsed.skills : next.profile.skills,
      experience: parsed.experience?.length ? parsed.experience : next.profile.experience,
      education: parsed.education?.length ? parsed.education : next.profile.education,
      screening: {
        ...next.profile.screening,
        hybridPreference: parsedScreening.hybridPreference || next.profile.screening.hybridPreference,
        travelOk:
          typeof parsedScreening.travelOk === "boolean"
            ? parsedScreening.travelOk
            : next.profile.screening.travelOk,
        relocationOk:
          typeof parsedScreening.relocationOk === "boolean"
            ? parsedScreening.relocationOk
            : next.profile.screening.relocationOk,
        spokenLanguages: parsedScreening.spokenLanguages?.length
          ? parsedScreening.spokenLanguages
          : next.profile.screening.spokenLanguages,
        knowsCompanyEmployee:
          typeof parsedScreening.knowsCompanyEmployee === "boolean"
            ? parsedScreening.knowsCompanyEmployee
            : next.profile.screening.knowsCompanyEmployee,
        previouslyEmployedByCompany:
          typeof parsedScreening.previouslyEmployedByCompany === "boolean"
            ? parsedScreening.previouslyEmployedByCompany
            : next.profile.screening.previouslyEmployedByCompany,
        outsideBusinessActivities:
          typeof parsedScreening.outsideBusinessActivities === "boolean"
            ? parsedScreening.outsideBusinessActivities
            : next.profile.screening.outsideBusinessActivities,
        dateOfBirth: parsedScreening.dateOfBirth || next.profile.screening.dateOfBirth,
        gpa: parsedScreening.gpa || next.profile.screening.gpa,
        over18:
          typeof parsedScreening.over18 === "boolean" ? parsedScreening.over18 : next.profile.screening.over18,
        genderIdentity: parsedScreening.genderIdentity || next.profile.screening.genderIdentity,
        disabilityStatus: parsedScreening.disabilityStatus || next.profile.screening.disabilityStatus,
        veteranStatus: parsedScreening.veteranStatus || next.profile.screening.veteranStatus,
        raceEthnicity: parsedScreening.raceEthnicity || next.profile.screening.raceEthnicity,
        drivingLicenses: parsedScreening.drivingLicenses?.length
          ? parsedScreening.drivingLicenses
          : next.profile.screening.drivingLicenses,
        securityClearance: parsedScreening.securityClearance || next.profile.screening.securityClearance,
      },
    },
  });
}

export const mapResumeDataToParsedProfile = profileFromResumeData;
