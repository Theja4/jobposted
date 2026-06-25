import type { ProfilePayload, SourceDocument } from "@/lib/profile/resume-version";

export type WorkLocationPreference = "remote" | "onsite_hybrid";
export type JobTypePreference = "fulltime" | "part_time" | "contract" | "internship";
export type MatchPreference = "high" | "higher" | "highest";
export type ApplicationModePreference = "review" | "auto";

export const GENDER_IDENTITY_OPTIONS = ["Male", "Female", "Other"] as const;

export type OnboardingExperience = {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
};

export type OnboardingEducation = {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
};

export type OnboardingConfig = {
  search: {
    workLocations: WorkLocationPreference[];
    remoteScope: string;
    onsiteLocation: string;
    jobTypes: JobTypePreference[];
    titles: string[];
  };
  filters: {
    match: MatchPreference;
    seniority: string[];
    timeZones: string[];
    industries: string[];
    languages: string[];
    includeKeywords: string[];
    excludeKeywords: string[];
    excludeCompanies: string[];
  };
  profile: {
    basics: {
      fullName: string;
      email: string;
      phone: string;
      location: string;
      addressLine1: string;
      postalCode: string;
    };
    links: {
      linkedin: string;
      portfolio: string;
      github: string;
    };
    workAuth: {
      authorizedToWork: boolean | null;
      needsSponsorship: boolean | null;
      relocationOk: boolean | null;
      currentSalaryMin: number | null;
      currentSalaryMax: number | null;
      currentSalaryCurrency: string;
      salaryMin: number | null;
      salaryMax: number | null;
      salaryCurrency: string;
    };
    headline: string;
    summary: string;
    skills: string[];
    experience: OnboardingExperience[];
    education: OnboardingEducation[];
    resumeName: string | null;
    resumeSource: SourceDocument | null;
    screening: {
      hybridPreference: string;
      travelOk: boolean | null;
      relocationOk: boolean | null;
      spokenLanguages: string[];
      knowsCompanyEmployee: boolean | null;
      previouslyEmployedByCompany: boolean | null;
      outsideBusinessActivities: boolean | null;
      nonCompeteAgreement: boolean | null;
      worksForAffiliatedCompany: boolean | null;
      dateOfBirth: string;
      gpa: string;
      over18: boolean | null;
      genderIdentity: string;
      genderIdentityDetail: string;
      disabilityStatus: string;
      veteranStatus: string;
      raceEthnicity: string;
      drivingLicenses: string[];
      securityClearance: string;
    };
  };
  final: {
    applicationMode: ApplicationModePreference;
    tailorResume: boolean;
    writingStyle: {
      sentenceLength: string;
      tone: string;
      vocabulary: string;
    };
  };
};

export type ReusableProfileAnswerInput = {
  key: string;
  prompt: string;
  value: string;
};

type Rec = Record<string, unknown>;

const rec = (value: unknown): Rec =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};

export const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asBool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

const asMoney = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.]/g, "")) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const stringArray = (value: unknown, limit = 20) =>
  Array.isArray(value)
    ? value
        .map(asString)
        .filter(Boolean)
        .slice(0, limit)
    : [];

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const WORK_LOCATIONS = ["remote", "onsite_hybrid"] as const;
const JOB_TYPES = ["fulltime", "part_time", "contract", "internship"] as const;
const MATCH_LEVELS = ["high", "higher", "highest"] as const;
const APPLICATION_MODES = ["review", "auto"] as const;

export function defaultOnboardingConfig(email = ""): OnboardingConfig {
  return {
    search: {
      workLocations: ["remote"],
      remoteScope: "Worldwide",
      onsiteLocation: "Anywhere in India",
      jobTypes: ["fulltime"],
      titles: [],
    },
    filters: {
      match: "higher",
      seniority: [],
      timeZones: [],
      industries: [],
      languages: [],
      includeKeywords: [],
      excludeKeywords: [],
      excludeCompanies: [],
    },
    profile: {
      basics: {
        fullName: "",
        email,
        phone: "",
        location: "",
        addressLine1: "",
        postalCode: "",
      },
      links: {
        linkedin: "",
        portfolio: "",
        github: "",
      },
      workAuth: {
        authorizedToWork: null,
        needsSponsorship: null,
        relocationOk: null,
        currentSalaryMin: null,
        currentSalaryMax: null,
        currentSalaryCurrency: "USD",
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: "USD",
      },
      headline: "",
      summary: "",
      skills: [],
      experience: [],
      education: [],
      resumeName: null,
      resumeSource: null,
      screening: {
        hybridPreference: "",
        travelOk: null,
        relocationOk: null,
        spokenLanguages: [],
        knowsCompanyEmployee: false,
        previouslyEmployedByCompany: false,
        outsideBusinessActivities: false,
        nonCompeteAgreement: false,
        worksForAffiliatedCompany: false,
        dateOfBirth: "",
        gpa: "",
        over18: null,
        genderIdentity: "",
        genderIdentityDetail: "",
        disabilityStatus: "",
        veteranStatus: "",
        raceEthnicity: "",
        drivingLicenses: [],
        securityClearance: "",
      },
    },
    final: {
      applicationMode: "auto",
      tailorResume: false,
      writingStyle: {
        sentenceLength: "Balanced mix",
        tone: "Neutral-casual",
        vocabulary: "Simple, everyday words",
      },
    },
  };
}

function experienceFrom(value: unknown): OnboardingExperience[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        company: asString(row.company),
        title: asString(row.title),
        location: asString(row.location),
        startDate: asString(row.startDate),
        endDate: asString(row.endDate),
        current: row.current === true,
        bullets: stringArray(row.bullets, 8),
      };
    })
    .filter((item) => item.company || item.title || item.bullets.length > 0)
    .slice(0, 8);
}

function educationFrom(value: unknown): OnboardingEducation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = rec(item);
      return {
        school: asString(row.school),
        degree: asString(row.degree),
        field: asString(row.field),
        startDate: asString(row.startDate),
        endDate: asString(row.endDate),
        gpa: asString(row.gpa),
      };
    })
    .filter((item) => item.school || item.degree)
    .slice(0, 6);
}

function sourceDocumentFrom(value: unknown): SourceDocument | null {
  const row = rec(value);
  const name = asString(row.name);
  const storagePath = asString(row.storagePath);
  if (!name || !storagePath) return null;
  return {
    name,
    storagePath,
    contentType: asString(row.contentType) || "application/octet-stream",
    size: typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0,
    uploadedAt: asString(row.uploadedAt) || new Date().toISOString(),
    contentHash: asString(row.contentHash) || undefined,
  };
}

export function genderIdentityFieldsFrom(value: unknown, detailValue: unknown = "") {
  const raw = asString(value);
  const detail = asString(detailValue);
  const normalized = raw.toLowerCase();
  if (!raw) return { genderIdentity: "", genderIdentityDetail: detail };
  if (normalized === "female" || normalized === "woman" || normalized === "women") {
    return { genderIdentity: "Female", genderIdentityDetail: "" };
  }
  if (normalized === "male" || normalized === "man" || normalized === "men") {
    return { genderIdentity: "Male", genderIdentityDetail: "" };
  }
  if (normalized === "other" || normalized === "others") {
    return { genderIdentity: "Other", genderIdentityDetail: detail };
  }
  return { genderIdentity: "Other", genderIdentityDetail: detail || raw };
}

export function sanitizeOnboardingConfig(value: unknown, email = ""): OnboardingConfig {
  const base = defaultOnboardingConfig(email);
  const row = rec(value);
  const search = rec(row.search);
  const filters = rec(row.filters);
  const profile = rec(row.profile);
  const basics = rec(profile.basics);
  const links = rec(profile.links);
  const workAuth = rec(profile.workAuth);
  const screening = rec(profile.screening);
  const genderIdentity = genderIdentityFieldsFrom(screening.genderIdentity, screening.genderIdentityDetail);
  const final = rec(row.final);
  const writingStyle = rec(final.writingStyle);
  const needsSponsorship = asBool(workAuth.needsSponsorship);
  const authorizedToWork = asBool(workAuth.authorizedToWork) ?? (needsSponsorship === false ? true : null);

  return {
    search: {
      workLocations: stringArray(search.workLocations, 2).filter((item) =>
        WORK_LOCATIONS.includes(item as WorkLocationPreference),
      ) as WorkLocationPreference[],
      remoteScope: asString(search.remoteScope) || base.search.remoteScope,
      onsiteLocation: asString(search.onsiteLocation) || base.search.onsiteLocation,
      jobTypes:
        (stringArray(search.jobTypes, 4).filter((item) =>
          JOB_TYPES.includes(item as JobTypePreference),
        ) as JobTypePreference[]).length > 0
          ? (stringArray(search.jobTypes, 4).filter((item) =>
              JOB_TYPES.includes(item as JobTypePreference),
            ) as JobTypePreference[])
          : base.search.jobTypes,
      titles: stringArray(search.titles, 5),
    },
    filters: {
      match: pick(filters.match, MATCH_LEVELS, base.filters.match),
      seniority: stringArray(filters.seniority, 8),
      timeZones: stringArray(filters.timeZones, 8),
      industries: stringArray(filters.industries, 12),
      languages: stringArray(filters.languages, 8),
      includeKeywords: stringArray(filters.includeKeywords, 24),
      excludeKeywords: stringArray(filters.excludeKeywords, 24),
      excludeCompanies: stringArray(filters.excludeCompanies, 40),
    },
    profile: {
      basics: {
        fullName: asString(basics.fullName),
        email: asString(basics.email) || email,
        phone: asString(basics.phone),
        location: asString(basics.location),
        addressLine1: asString(basics.addressLine1),
        postalCode: asString(basics.postalCode),
      },
      links: {
        linkedin: asString(links.linkedin),
        portfolio: asString(links.portfolio),
        github: asString(links.github),
      },
      workAuth: {
        authorizedToWork,
        needsSponsorship,
        relocationOk: asBool(workAuth.relocationOk),
        currentSalaryMin: asMoney(workAuth.currentSalaryMin),
        currentSalaryMax: asMoney(workAuth.currentSalaryMax),
        currentSalaryCurrency: asString(workAuth.currentSalaryCurrency) || base.profile.workAuth.currentSalaryCurrency,
        salaryMin: asMoney(workAuth.salaryMin),
        salaryMax: asMoney(workAuth.salaryMax),
        salaryCurrency: asString(workAuth.salaryCurrency) || base.profile.workAuth.salaryCurrency,
      },
      headline: asString(profile.headline),
      summary: asString(profile.summary),
      skills: stringArray(profile.skills, 60),
      experience: experienceFrom(profile.experience),
      education: educationFrom(profile.education),
      resumeName: asString(profile.resumeName) || null,
      resumeSource: sourceDocumentFrom(profile.resumeSource),
      screening: {
        hybridPreference: asString(screening.hybridPreference),
        travelOk: asBool(screening.travelOk),
        relocationOk: asBool(screening.relocationOk),
        spokenLanguages: stringArray(screening.spokenLanguages, 6),
        knowsCompanyEmployee: asBool(screening.knowsCompanyEmployee) ?? false,
        previouslyEmployedByCompany: asBool(screening.previouslyEmployedByCompany) ?? false,
        outsideBusinessActivities: asBool(screening.outsideBusinessActivities) ?? false,
        nonCompeteAgreement: asBool(screening.nonCompeteAgreement) ?? false,
        worksForAffiliatedCompany: asBool(screening.worksForAffiliatedCompany) ?? false,
        dateOfBirth: asString(screening.dateOfBirth),
        gpa: asString(screening.gpa),
        over18: asBool(screening.over18),
        ...genderIdentity,
        disabilityStatus: asString(screening.disabilityStatus),
        veteranStatus: asString(screening.veteranStatus),
        raceEthnicity: asString(screening.raceEthnicity),
        drivingLicenses: stringArray(screening.drivingLicenses, 12),
        securityClearance: asString(screening.securityClearance),
      },
    },
    final: {
      applicationMode: pick(final.applicationMode, APPLICATION_MODES, base.final.applicationMode),
      tailorResume: typeof final.tailorResume === "boolean" ? final.tailorResume : base.final.tailorResume,
      writingStyle: {
        sentenceLength: asString(writingStyle.sentenceLength) || base.final.writingStyle.sentenceLength,
        tone: asString(writingStyle.tone) || base.final.writingStyle.tone,
        vocabulary: asString(writingStyle.vocabulary) || base.final.writingStyle.vocabulary,
      },
    },
  };
}

export function onboardingToProfilePayload(config: OnboardingConfig): ProfilePayload {
  return {
    basics: config.profile.basics,
    links: config.profile.links,
    workAuth: config.profile.workAuth,
    headline: config.profile.headline,
    summary: config.profile.summary,
    skills: config.profile.skills,
    experience: config.profile.experience,
    education: config.profile.education,
  };
}

function yesNo(value: boolean | null) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

export function reusableAnswersFromOnboarding(config: OnboardingConfig): ReusableProfileAnswerInput[] {
  const s = config.profile.screening;
  const w = config.profile.workAuth;
  const answers: ReusableProfileAnswerInput[] = [
    {
      key: "workAuth.authorized_to_work",
      prompt: "Are you legally authorized to work in your resident country?",
      value: yesNo(w.authorizedToWork),
    },
    {
      key: "workAuth.needs_sponsorship",
      prompt: "Will you now or in the future require visa sponsorship?",
      value: yesNo(w.needsSponsorship),
    },
    {
      key: "screening.hybrid_remote_preference",
      prompt: "What is your remote, hybrid, or on-site preference?",
      value: s.hybridPreference,
    },
    {
      key: "screening.travel_comfortable",
      prompt: "Are you comfortable with travelling?",
      value: yesNo(s.travelOk),
    },
    {
      key: "screening.relocation_open",
      prompt: "Are you comfortable relocating?",
      value: yesNo(s.relocationOk),
    },
    {
      key: "screening.company_employee_connection",
      prompt: "Do you know anyone related working in this company?",
      value: yesNo(s.knowsCompanyEmployee),
    },
    {
      key: "screening.company_contact_connection",
      prompt: "Do you know anyone at this company?",
      value: yesNo(s.knowsCompanyEmployee),
    },
    {
      key: "screening.company_relative_connection",
      prompt: "Do you have any relatives working for this company?",
      value: yesNo(s.knowsCompanyEmployee),
    },
    {
      key: "screening.current_employee_connection",
      prompt: "Do you know any current employees at this company?",
      value: yesNo(s.knowsCompanyEmployee),
    },
    {
      key: "screening.previous_company_employment",
      prompt: "Have you been employed by this company in the past?",
      value: yesNo(s.previouslyEmployedByCompany),
    },
    {
      key: "screening.previous_subsidiary_employment",
      prompt: "Have you previously worked for this company or any of its subsidiaries?",
      value: yesNo(s.previouslyEmployedByCompany),
    },
    {
      key: "screening.ex_employee",
      prompt: "Are you an ex-employee of this company?",
      value: yesNo(s.previouslyEmployedByCompany),
    },
    {
      key: "screening.affiliated_company_employment",
      prompt: "Do you work for any of the applying organization's affiliated companies?",
      value: yesNo(s.worksForAffiliatedCompany),
    },
    {
      key: "screening.non_compete_agreement",
      prompt: "Do you have any non-compete agreement?",
      value: yesNo(s.nonCompeteAgreement),
    },
    {
      key: "screening.outside_business_activities",
      prompt: "Do you have any outside business activities you would continue if hired?",
      value: yesNo(s.outsideBusinessActivities),
    },
    {
      key: "screening.side_business_activities",
      prompt: "Do you have advisory, consulting, board, or side business activities?",
      value: yesNo(s.outsideBusinessActivities),
    },
    {
      key: "screening.languages",
      prompt: "Which languages do you speak fluently?",
      value: s.spokenLanguages.join(", "),
    },
    {
      key: "screening.security_clearance",
      prompt: "Enter any Security Clearance information",
      value: s.securityClearance,
    },
  ];

  return answers.filter((answer) => answer.value);
}

export function onboardingCompletion(config: OnboardingConfig) {
  const checks = [
    config.search.workLocations.length > 0,
    config.search.jobTypes.length > 0,
    config.search.titles.length > 0,
    config.profile.basics.fullName,
    config.profile.basics.email,
    config.profile.resumeName || config.profile.summary || config.profile.experience.length > 0,
    config.final.applicationMode,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
