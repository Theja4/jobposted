import type {
  MasterProfile,
  MasterProfileEducation,
  MasterProfileExperience,
  ReusableAnswer,
} from "@jobposted/shared";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function moneyOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function splitName(fullName: string | null | undefined, email: string | null | undefined) {
  const fallback = email?.split("@")[0]?.replace(/[._-]+/g, " ") ?? "";
  const usable = (fullName || fallback).trim();
  const parts = usable.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function splitLocation(location: string | null | undefined) {
  const parts = (location ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return {
      city: parts[0] ?? null,
      state: parts[1] ?? null,
      country: parts.slice(2).join(", "),
    };
  }
  if (parts.length === 2) {
    return { city: parts[0] ?? null, state: null, country: parts[1] ?? null };
  }
  return { city: parts[0] ?? null, state: null, country: null };
}

function normalizeExperience(value: unknown): MasterProfileExperience[] {
  if (!Array.isArray(value)) return [];
  const normalized: MasterProfileExperience[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const title = asString(record.title ?? record.role ?? record.position);
    const company = asString(record.company ?? record.employer);
    if (!title && !company) continue;
    normalized.push({
      title,
      company,
      location: asString(record.location) || null,
      startDate: asString(record.startDate ?? record.start_date ?? record.from) || null,
      endDate: asString(record.endDate ?? record.end_date ?? record.to) || null,
      current: typeof record.current === "boolean" ? record.current : null,
      bullets: asStringArray(record.bullets ?? record.highlights ?? record.achievements),
    });
  }
  return normalized;
}

function normalizeEducation(value: unknown): MasterProfileEducation[] {
  if (!Array.isArray(value)) return [];
  const normalized: MasterProfileEducation[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const school = asString(record.school ?? record.institution ?? record.name);
    if (!school) continue;
    normalized.push({
      school,
      degree: asString(record.degree) || null,
      field: asString(record.field ?? record.major) || null,
      startDate: asString(record.startDate ?? record.start_date) || null,
      endDate: asString(record.endDate ?? record.end_date) || null,
      gpa: asString(record.gpa) || null,
    });
  }
  return normalized;
}

function profileCompleteness(profile: MasterProfile): number {
  const checks = [
    profile.identity.firstName,
    profile.identity.lastName,
    profile.identity.email,
    profile.identity.phone,
    profile.location.city || profile.location.country,
    profile.links.linkedin || profile.links.portfolio || profile.links.github,
    profile.workAuth.authorizedToWork !== null,
    profile.workAuth.requiresSponsorship !== null,
    profile.experience.length > 0,
    profile.education.length > 0,
    profile.skills.length > 0,
    profile.documents.resumeUrl,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function buildMasterProfile(args: {
  authEmail?: string | null;
  profileRow?: UnknownRecord | null;
  resumeContent?: unknown;
  answers?: ReusableAnswer[];
  resumeUrl?: string | null;
  coverLetterUrl?: string | null;
}): MasterProfile {
  const row = args.profileRow ?? {};
  const content = asRecord(args.resumeContent);
  const email = asString(row.email) || args.authEmail || "";
  const name = splitName(asString(row.full_name), email);
  const location = splitLocation(asString(row.location));
  const workAuthorization = asString(row.work_authorization);
  const needsSponsorship =
    typeof row.needs_sponsorship === "boolean" ? row.needs_sponsorship : null;
  const authorizedToWork =
    workAuthorization || needsSponsorship !== null ? needsSponsorship === false : null;

  const links = asRecord(content.links);
  const profile: MasterProfile = {
    identity: {
      firstName: name.firstName,
      lastName: name.lastName,
      preferredName: asString(content.preferredName) || null,
      email,
      phone: asString(row.phone),
    },
    location: {
      street: asString(content.street ?? content.address) || null,
      city: asString(content.city) || location.city,
      state: asString(content.state) || location.state,
      postalCode: asString(content.postalCode ?? content.zip) || null,
      country: asString(content.country) || location.country,
    },
    links: {
      portfolio: asString(row.portfolio_url) || asString(links.portfolio) || null,
      linkedin: asString(row.linkedin_url) || asString(links.linkedin) || null,
      github: asString(links.github) || null,
      website: asStringArray(links.website),
    },
    workAuth: {
      authorizedToWork,
      requiresSponsorship: needsSponsorship,
      country: asString(content.workAuthCountry) || location.country,
    },
    compensation: {
      currentMin: moneyOf(row.current_salary_min),
      currentMax: moneyOf(row.current_salary_max),
      currentCurrency: asString(row.current_salary_currency) || null,
      expectedMin: moneyOf(row.salary_expectation_min),
      expectedMax: moneyOf(row.salary_expectation_max),
      currency: asString(row.salary_currency) || null,
    },
    demographics: {},
    experience: normalizeExperience(content.experience ?? content.workExperience),
    education: normalizeEducation(content.education),
    skills: asStringArray(content.skills),
    answers: args.answers ?? [],
    documents: {
      resumeUrl: args.resumeUrl ?? null,
      coverLetterUrl: args.coverLetterUrl ?? null,
    },
    source: "jobposted",
  };
  profile.completeness = profileCompleteness(profile);
  return profile;
}

export function toReusableAnswer(value: unknown): ReusableAnswer | null {
  const record = asRecord(value);
  const key = asString(record.key);
  const prompt = asString(record.prompt);
  const answer = asString(record.value);
  if (!key || !prompt || !answer) return null;
  return { key, prompt, value: answer };
}
