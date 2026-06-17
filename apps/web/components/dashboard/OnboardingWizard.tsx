"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  FileText,
  FileSearch,
  FileUp,
  Info,
  Loader2,
  MapPin,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  defaultOnboardingConfig,
  onboardingCompletion,
  sanitizeOnboardingConfig,
  type ApplicationModePreference,
  type JobTypePreference,
  type MatchPreference,
  type OnboardingConfig,
  type OnboardingEducation,
  type OnboardingExperience,
  type WorkLocationPreference,
} from "@/lib/onboarding/model";
import { POPULAR_JOB_TITLE_QUICK_PICKS, POPULAR_JOB_TITLES } from "@/lib/onboarding/job-titles";
import type { SourceDocument } from "@/lib/profile/resume-version";
import { DashboardSelect } from "./DashboardSelect";

type WizardStep = 0 | 1 | 2 | 3;
type SaveIntent = "save";
type ReviewPrompt = {
  step: WizardStep;
  title: string;
  message: string;
};

type ParsedResumeProfile = {
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

const STEPS = [
  { label: "Search", hint: "Location and roles", Icon: SearchCheck },
  { label: "Filters", hint: "Optional narrowing", Icon: Settings2 },
  { label: "Profile", hint: "Resume and answers", Icon: UserRound },
  { label: "Launch", hint: "Mode and voice", Icon: ShieldCheck },
] as const;

const STEP_COPY = [
  {
    title: "Choose the jobs worth finding",
    description: "Tell JobPosted where to search and the titles that should make it into your queue.",
  },
  {
    title: "Narrow only where it helps",
    description: "These filters are optional. Keep them broad unless you know a filter improves quality.",
  },
  {
    title: "Build your application profile",
    description: "Upload a resume to prefill the profile, then answer the screening questions you want JobPosted to reuse.",
  },
  {
    title: "Choose how JobPosted works",
    description: "Review mode is best while your profile is new. You can change it later from the dashboard.",
  },
] as const;

const JOB_TYPES: Array<{ value: JobTypePreference; label: string }> = [
  { value: "fulltime", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contractor / Temp" },
  { value: "internship", label: "Internship" },
];

const SENIORITY = ["Entry Level", "Associate Level", "Mid-to-Senior Level", "Director Level and above"];
const TIME_ZONES = ["US overlap", "Europe overlap", "India", "APAC", "Fully async"];
const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "Consumer", "AI", "Developer tools", "E-commerce"];
const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Japanese"];
const COMMON_LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Tamil"];
const DRIVING_LICENSES = ["I don't have a driving license", "Car", "Motorcycle", "Commercial"];
const CURRENCIES = [
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
];
const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({ value: code, label: code }));
const SPONSORSHIP_OPTIONS = [
  { value: "", label: "Prefer not to say" },
  { value: "no", label: "Authorized, no sponsorship needed" },
  { value: "yes", label: "Needs visa sponsorship" },
];

const EASE = [0.22, 1, 0.36, 1] as const;
const labelCls = "mb-1.5 flex items-center gap-2 text-xs font-bold text-ink/75";
const inputCls =
  "h-11 w-full rounded-xl bg-white/80 px-3.5 text-sm font-semibold text-ink shadow-sm outline-none ring-1 ring-inset ring-zinc-200/80 transition-all placeholder:text-zinc-400 hover:ring-zinc-300 focus:bg-white focus:ring-2 focus:ring-brand-500";
const selectButtonCls =
  "h-11 w-full rounded-xl bg-white px-3.5 text-sm font-semibold text-ink shadow-[0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)] outline-none transition-[background-color,color,box-shadow] hover:bg-brand-50 focus:shadow-[0_0_0_3px_rgba(31,100,224,0.18),0_12px_26px_-22px_rgba(15,23,42,0.48),0_3px_10px_-9px_rgba(15,23,42,0.18)]";

function OptionalBadge() {
  return (
    <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-zinc-500">
      Optional
    </span>
  );
}

const hasText = (value: string | null | undefined) => Boolean(value?.trim());

function isMasterResumeComplete(config: OnboardingConfig) {
  return Boolean(config.profile.resumeName || config.profile.resumeSource);
}

function isProfileInformationComplete(config: OnboardingConfig) {
  const profile = config.profile;
  return Boolean(
    hasText(profile.basics.fullName) &&
      hasText(profile.basics.email) &&
      hasText(profile.headline) &&
      hasText(profile.summary) &&
      profile.skills.length > 0,
  );
}

function isExperienceEducationComplete(config: OnboardingConfig) {
  return (
    config.profile.experience.some((item) => hasText(item.company) && hasText(item.title)) ||
    config.profile.education.some((item) => hasText(item.school) && hasText(item.degree))
  );
}

function isCommonScreeningComplete(config: OnboardingConfig) {
  const screening = config.profile.screening;
  return Boolean(
    hasText(screening.hybridPreference) &&
      screening.travelOk !== null &&
      screening.relocationOk !== null &&
      screening.spokenLanguages.length > 0,
  );
}

function hasLessCommonScreening(config: OnboardingConfig) {
  const screening = config.profile.screening;
  return Boolean(
    hasText(screening.dateOfBirth) ||
      hasText(screening.gpa) ||
      screening.over18 !== null ||
      screening.drivingLicenses.length > 0 ||
      hasText(screening.securityClearance),
  );
}

function hasVoluntaryIdentityAnswers(config: OnboardingConfig) {
  const screening = config.profile.screening;
  return Boolean(
    hasText(screening.genderIdentity) ||
      hasText(screening.disabilityStatus) ||
      hasText(screening.veteranStatus) ||
      hasText(screening.raceEthnicity),
  );
}

function mergeParsed(config: OnboardingConfig, parsed: ParsedResumeProfile): OnboardingConfig {
  const parsedWorkAuth = parsed.workAuth ?? {};
  const parsedScreening = parsed.screening ?? {};

  return sanitizeOnboardingConfig({
    ...config,
    search: {
      ...config.search,
      workLocations: parsed.search?.workLocations?.length ? parsed.search.workLocations : config.search.workLocations,
      remoteScope: parsed.search?.remoteScope || config.search.remoteScope,
      onsiteLocation: parsed.search?.onsiteLocation || config.search.onsiteLocation,
      jobTypes: parsed.search?.jobTypes?.length ? parsed.search.jobTypes : config.search.jobTypes,
      titles: parsed.search?.titles?.length ? parsed.search.titles : config.search.titles,
    },
    filters: {
      ...config.filters,
      match: parsed.filters?.match || config.filters.match,
      seniority: parsed.filters?.seniority?.length ? parsed.filters.seniority : config.filters.seniority,
      timeZones: parsed.filters?.timeZones?.length ? parsed.filters.timeZones : config.filters.timeZones,
      industries: parsed.filters?.industries?.length ? parsed.filters.industries : config.filters.industries,
      languages: parsed.filters?.languages?.length ? parsed.filters.languages : config.filters.languages,
      includeKeywords: parsed.filters?.includeKeywords?.length
        ? parsed.filters.includeKeywords
        : config.filters.includeKeywords,
      excludeKeywords: parsed.filters?.excludeKeywords?.length
        ? parsed.filters.excludeKeywords
        : config.filters.excludeKeywords,
      excludeCompanies: parsed.filters?.excludeCompanies?.length
        ? parsed.filters.excludeCompanies
        : config.filters.excludeCompanies,
    },
    profile: {
      ...config.profile,
      basics: {
        fullName: parsed.basics?.fullName || config.profile.basics.fullName,
        email: parsed.basics?.email || config.profile.basics.email,
        phone: parsed.basics?.phone || config.profile.basics.phone,
        location: parsed.basics?.location || config.profile.basics.location,
      },
      links: {
        linkedin: parsed.links?.linkedin || config.profile.links.linkedin,
        portfolio: parsed.links?.portfolio || config.profile.links.portfolio,
        github: parsed.links?.github || config.profile.links.github,
      },
      workAuth: {
        ...config.profile.workAuth,
        needsSponsorship:
          typeof parsedWorkAuth.needsSponsorship === "boolean"
            ? parsedWorkAuth.needsSponsorship
            : config.profile.workAuth.needsSponsorship,
        relocationOk:
          typeof parsedWorkAuth.relocationOk === "boolean"
            ? parsedWorkAuth.relocationOk
            : config.profile.workAuth.relocationOk,
        currentSalaryMin: parsedWorkAuth.currentSalaryMin ?? config.profile.workAuth.currentSalaryMin,
        currentSalaryMax: parsedWorkAuth.currentSalaryMax ?? config.profile.workAuth.currentSalaryMax,
        currentSalaryCurrency:
          parsedWorkAuth.currentSalaryCurrency || config.profile.workAuth.currentSalaryCurrency,
        salaryMin: parsedWorkAuth.salaryMin ?? config.profile.workAuth.salaryMin,
        salaryMax: parsedWorkAuth.salaryMax ?? config.profile.workAuth.salaryMax,
        salaryCurrency: parsedWorkAuth.salaryCurrency || config.profile.workAuth.salaryCurrency,
      },
      headline: parsed.headline || config.profile.headline,
      summary: parsed.summary || config.profile.summary,
      skills: parsed.skills?.length ? parsed.skills : config.profile.skills,
      experience: parsed.experience?.length ? parsed.experience : config.profile.experience,
      education: parsed.education?.length ? parsed.education : config.profile.education,
      screening: {
        ...config.profile.screening,
        hybridPreference: parsedScreening.hybridPreference || config.profile.screening.hybridPreference,
        travelOk:
          typeof parsedScreening.travelOk === "boolean"
            ? parsedScreening.travelOk
            : config.profile.screening.travelOk,
        relocationOk:
          typeof parsedScreening.relocationOk === "boolean"
            ? parsedScreening.relocationOk
            : config.profile.screening.relocationOk,
        spokenLanguages: parsedScreening.spokenLanguages?.length
          ? parsedScreening.spokenLanguages
          : config.profile.screening.spokenLanguages,
        dateOfBirth: parsedScreening.dateOfBirth || config.profile.screening.dateOfBirth,
        gpa: parsedScreening.gpa || config.profile.screening.gpa,
        over18:
          typeof parsedScreening.over18 === "boolean" ? parsedScreening.over18 : config.profile.screening.over18,
        genderIdentity: parsedScreening.genderIdentity || config.profile.screening.genderIdentity,
        disabilityStatus: parsedScreening.disabilityStatus || config.profile.screening.disabilityStatus,
        veteranStatus: parsedScreening.veteranStatus || config.profile.screening.veteranStatus,
        raceEthnicity: parsedScreening.raceEthnicity || config.profile.screening.raceEthnicity,
        drivingLicenses: parsedScreening.drivingLicenses?.length
          ? parsedScreening.drivingLicenses
          : config.profile.screening.drivingLicenses,
        securityClearance: parsedScreening.securityClearance || config.profile.screening.securityClearance,
      },
    },
  });
}

function completionForStep(config: OnboardingConfig, step: WizardStep) {
  if (step === 0) {
    const checks = [
      config.search.workLocations.length > 0,
      config.search.jobTypes.length > 0,
      config.search.titles.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }
  if (step === 1) return config.filters.match === "high" ? 35 : config.filters.match === "higher" ? 65 : 100;
  if (step === 2) {
    const checks = [
      isMasterResumeComplete(config),
      isProfileInformationComplete(config),
      isExperienceEducationComplete(config),
      isCommonScreeningComplete(config),
      hasLessCommonScreening(config),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }
  return config.final.applicationMode ? 100 : 0;
}

function reviewPromptForStep(config: OnboardingConfig, step: WizardStep): ReviewPrompt | null {
  if (step === 1) {
    const hasExpandedFilters = [
      config.filters.seniority,
      config.filters.timeZones,
      config.filters.industries,
      config.filters.languages,
      config.filters.includeKeywords,
      config.filters.excludeKeywords,
      config.filters.excludeCompanies,
    ].some((items) => items.length > 0);

    if (!hasExpandedFilters) {
      return {
        step,
        title: "Review the extra filters before moving on",
        message:
          "I opened seniority, time zone, and advanced filters. Add anything that is a real requirement, then click Next again.",
      };
    }
  }

  if (step === 2) {
    const profileReady = isProfileInformationComplete(config);
    const commonScreeningReady = isCommonScreeningComplete(config);
    const hasExperienceOrEducation = isExperienceEducationComplete(config);
    const hasReusableAnswers = hasLessCommonScreening(config);

    if (!profileReady || !commonScreeningReady || !hasExperienceOrEducation || !hasReusableAnswers) {
      return {
        step,
        title: "Check the hidden profile sections",
        message:
          "I opened the incomplete profile sections. Fill the required fields, add anything reusable, then click Next again.",
      };
    }
  }

  return null;
}

function emptyExperience(): OnboardingExperience {
  return { company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [] };
}

function emptyEducation(): OnboardingEducation {
  return { school: "", degree: "", field: "", startDate: "", endDate: "" };
}

export function OnboardingWizard({
  initialConfig,
  completedAt,
}: {
  initialConfig?: OnboardingConfig;
  completedAt?: string | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(0);
  const [config, setConfig] = useState(() =>
    sanitizeOnboardingConfig(initialConfig ?? defaultOnboardingConfig()),
  );
  const [saving, setSaving] = useState<SaveIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<"idle" | "uploading" | "parsed" | "error">("idle");
  const [parseMessage, setParseMessage] = useState("");
  const [reviewPrompt, setReviewPrompt] = useState<ReviewPrompt | null>(null);
  const [promptedSteps, setPromptedSteps] = useState<WizardStep[]>([]);

  const overall = onboardingCompletion(config);
  const canContinue = true;

  function patchSearch(patch: Partial<OnboardingConfig["search"]>) {
    setConfig((current) => ({ ...current, search: { ...current.search, ...patch } }));
  }

  function patchFilters(patch: Partial<OnboardingConfig["filters"]>) {
    setConfig((current) => ({ ...current, filters: { ...current.filters, ...patch } }));
  }

  function patchProfile(patch: Partial<OnboardingConfig["profile"]>) {
    setConfig((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  }

  function patchBasics(patch: Partial<OnboardingConfig["profile"]["basics"]>) {
    setConfig((current) => ({
      ...current,
      profile: { ...current.profile, basics: { ...current.profile.basics, ...patch } },
    }));
  }

  function patchLinks(patch: Partial<OnboardingConfig["profile"]["links"]>) {
    setConfig((current) => ({
      ...current,
      profile: { ...current.profile, links: { ...current.profile.links, ...patch } },
    }));
  }

  function patchWorkAuth(patch: Partial<OnboardingConfig["profile"]["workAuth"]>) {
    setConfig((current) => ({
      ...current,
      profile: { ...current.profile, workAuth: { ...current.profile.workAuth, ...patch } },
    }));
  }

  function patchScreening(patch: Partial<OnboardingConfig["profile"]["screening"]>) {
    setConfig((current) => ({
      ...current,
      profile: { ...current.profile, screening: { ...current.profile.screening, ...patch } },
    }));
  }

  function patchFinal(patch: Partial<OnboardingConfig["final"]>) {
    setConfig((current) => ({ ...current, final: { ...current.final, ...patch } }));
  }

  function toggleArray<T extends string>(values: T[], value: T, max = 99) {
    return values.includes(value) ? values.filter((item) => item !== value) : [...values, value].slice(0, max);
  }

  async function uploadResume(file: File) {
    setParseStatus("uploading");
    setParseMessage("Reading your resume and filling the profile fields we can trust.");
    setError(null);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/onboarding/resume/parse", { method: "POST", body: data });
      const json = (await res.json()) as {
        ok: boolean;
        name?: string;
        sourceDocument?: SourceDocument;
        parsed?: ParsedResumeProfile;
        diagnostics?: {
          source?: string;
          confidence?: { score?: number; level?: string; issues?: string[] };
          repairAttempted?: boolean;
          repairUsed?: boolean;
        };
        message?: string;
      };
      if (!res.ok || !json.ok || !json.parsed) throw new Error(json.message || "Could not parse resume.");
      setConfig((current) => {
        const merged = mergeParsed(current, json.parsed ?? {});
        return {
          ...merged,
          profile: {
            ...merged.profile,
            resumeName: json.name ?? file.name,
            resumeSource: json.sourceDocument ?? merged.profile.resumeSource,
          },
        };
      });
      setParseStatus("parsed");
      const confidenceLevel = json.diagnostics?.confidence?.level;
      const score = json.diagnostics?.confidence?.score;
      const repairNote = json.diagnostics?.repairUsed ? " AI repair improved the parse." : "";
      setParseMessage(
        confidenceLevel
          ? `Resume parsed with ${confidenceLevel} confidence${typeof score === "number" ? ` (${score}/100)` : ""}.${repairNote} Review the filled fields before saving.`
          : "Resume parsed. Review the filled fields before saving.",
      );
    } catch (err) {
      setParseStatus("error");
      setParseMessage(err instanceof Error ? err.message : "Could not parse resume.");
    }
  }

  async function save(intent: SaveIntent) {
    if (saving) return;
    setSaving(intent);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save onboarding.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save onboarding.");
    } finally {
      setSaving(null);
    }
  }

  function next() {
    if (step >= 3) return;

    const prompt = reviewPromptForStep(config, step);
    if (prompt && !promptedSteps.includes(step)) {
      setReviewPrompt(prompt);
      setPromptedSteps((steps) => [...steps, step]);
      return;
    }

    setReviewPrompt(null);
    setStep((value) => (value + 1) as WizardStep);
  }

  function back() {
    setReviewPrompt(null);
    if (step > 0) setStep((value) => (value - 1) as WizardStep);
  }

  const currentCopy = STEP_COPY[step];
  const currentQuality = completionForStep(config, step);
  const savedLabel = completedAt ? new Date(completedAt).toLocaleDateString() : null;

  return (
    <div className="w-full">
      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)] xl:items-start">
        <aside className="rounded-2xl bg-[linear-gradient(180deg,#0b1220_0%,#123f91_62%,#1f64e0_100%)] p-4 text-white shadow-[0_18px_48px_rgba(16,47,102,0.18)] xl:sticky xl:top-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black text-white/65">Setup</p>
              <h1 className="mt-1 text-xl font-extrabold tracking-[-0.02em]">
                Make JobPosted yours
              </h1>
            </div>
            <span className="rounded-full bg-white/14 px-2 py-1 text-xs font-black ring-1 ring-inset ring-white/18">
              {overall}%
            </span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/16">
            <motion.div
              initial={false}
              animate={{ width: `${overall}%` }}
              transition={reduce ? { duration: 0 } : { duration: 0.25, ease: EASE }}
              className="h-full rounded-full bg-white"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setReviewPrompt(null);
              setStep(2);
            }}
            className="mt-4 flex w-full min-w-0 items-center gap-3 rounded-xl bg-white/12 p-3 text-left ring-1 ring-inset ring-white/16 transition-colors hover:bg-white/18"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/14 text-white">
              <FileUp className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-white/68">Master resume</span>
              <span className="block truncate text-sm font-extrabold">
                {config.profile.resumeName || "Add resume"}
              </span>
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-brand-700">
              {config.profile.resumeName ? "Ready" : "Open"}
            </span>
          </button>

          <nav className="mt-4 grid gap-1.5">
            {STEPS.map((item, index) => {
              const Icon = item.Icon;
              const active = step === index;
              const done = completionForStep(config, index as WizardStep) >= 80;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setReviewPrompt(null);
                    setStep(index as WizardStep);
                  }}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors",
                    active
                      ? "bg-white text-brand-800 shadow-sm"
                      : "text-white/78 hover:bg-white/12 hover:text-white",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : done
                          ? "bg-emerald-300/18 text-emerald-100"
                          : "bg-white/12 text-white",
                    )}
                  >
                    {done && !active ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{item.label}</span>
                    <span className={cn("block truncate text-[11px] font-semibold", active ? "text-brand-700" : "text-white/56")}>
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-4 rounded-xl bg-white/12 p-3 ring-1 ring-inset ring-white/16">
            <div className="flex items-center justify-between text-xs font-black text-white/68">
              <span>Step quality</span>
              <span className="text-white">{currentQuality}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/16">
              <motion.div
                initial={false}
                animate={{ width: `${currentQuality}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.25, ease: EASE }}
                className="h-full rounded-full bg-white"
              />
            </div>
            {savedLabel && (
              <p className="mt-2 text-xs font-semibold text-white/62">Saved {savedLabel}</p>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-700">
              {error}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={back}
              disabled={step === 0 || Boolean(saving)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/12 px-3 text-sm font-black text-white ring-1 ring-inset ring-white/16 transition-colors hover:bg-white/18 disabled:pointer-events-none disabled:opacity-45"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => void save("save")}
              disabled={Boolean(saving)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-black text-brand-800 transition-colors hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-55"
            >
              {saving === "save" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canContinue || Boolean(saving)}
                className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-brand-800 transition-colors hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-55"
              >
                Next <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void save("save")}
                disabled={Boolean(saving)}
                className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-brand-800 transition-colors hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-55"
              >
                {saving === "save" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Save setup
              </button>
            )}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-zinc-200/75 shadow-sm shadow-brand-900/5">
          <div className="border-b border-zinc-100 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-700 ring-1 ring-inset ring-brand-100">
                    Step {step + 1} of 4
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-100">
                    Most fields optional
                  </span>
                </div>
                <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink">
                  {currentCopy.title}
                </h2>
                <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-muted">
                  {currentCopy.description}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save("save")}
                  disabled={Boolean(saving)}
                  className="hidden h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-black text-ink ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-55 sm:inline-flex"
                >
                  {saving === "save" ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Save
                </button>
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={next}
                    disabled={!canContinue || Boolean(saving)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-55"
                  >
                    Next <ArrowRight className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void save("save")}
                    disabled={Boolean(saving)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-55"
                  >
                    {saving === "save" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Save setup
                  </button>
                )}
              </div>
            </div>
          </div>

          {reviewPrompt?.step === step && (
            <div className="mx-4 mt-4 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-inset ring-brand-200 sm:mx-5">
              <div className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-brand-100">
                  <Info className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-brand-900">{reviewPrompt.title}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-brand-800">
                    {reviewPrompt.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="px-4 py-4 sm:px-5"
            >
              {step === 0 && (
                <StepSearch
                  config={config}
                  patchSearch={patchSearch}
                  toggleArray={toggleArray}
                />
              )}
              {step === 1 && (
                <StepFilters
                  config={config}
                  patchFilters={patchFilters}
                  toggleArray={toggleArray}
                  reviewPromptActive={reviewPrompt?.step === 1}
                />
              )}
              {step === 2 && (
                <StepProfile
                  config={config}
                  fileRef={fileRef}
                  parseStatus={parseStatus}
                  parseMessage={parseMessage}
                  patchBasics={patchBasics}
                  patchLinks={patchLinks}
                  patchProfile={patchProfile}
                  patchScreening={patchScreening}
                  patchWorkAuth={patchWorkAuth}
                  setConfig={setConfig}
                  toggleArray={toggleArray}
                  uploadResume={uploadResume}
                  reviewPromptActive={reviewPrompt?.step === 2}
                />
              )}
              {step === 3 && (
                <StepFinal config={config} patchFinal={patchFinal} setConfig={setConfig} />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

function StepSearch({
  config,
  patchSearch,
  toggleArray,
}: {
  config: OnboardingConfig;
  patchSearch: (patch: Partial<OnboardingConfig["search"]>) => void;
  toggleArray: <T extends string>(values: T[], value: T, max?: number) => T[];
}) {
  return (
    <div className="grid gap-3">
      <Panel title="Work location" hint="Choose remote, on-site / hybrid, or both.">
        <div className="grid gap-3 md:grid-cols-2">
          <OptionCard
            active={config.search.workLocations.includes("remote")}
            icon={<MapPin className="size-4" />}
            title="Remote Jobs"
            hint={config.search.remoteScope || "Worldwide"}
            onClick={() =>
              patchSearch({
                workLocations: toggleArray<WorkLocationPreference>(
                  config.search.workLocations,
                  "remote",
                  2,
                ),
              })
            }
          />
          <OptionCard
            active={config.search.workLocations.includes("onsite_hybrid")}
            icon={<BriefcaseBusiness className="size-4" />}
            title="On-site Jobs / Hybrid"
            hint={config.search.onsiteLocation || "Anywhere in India"}
            onClick={() =>
              patchSearch({
                workLocations: toggleArray<WorkLocationPreference>(
                  config.search.workLocations,
                  "onsite_hybrid",
                  2,
                ),
              })
            }
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Remote scope"
            value={config.search.remoteScope}
            onChange={(value) => patchSearch({ remoteScope: value })}
          />
          <Field
            label="On-site / hybrid location"
            value={config.search.onsiteLocation}
            onChange={(value) => patchSearch({ onsiteLocation: value })}
          />
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Job types" optional hint="Full-time is selected by default.">
          <div className="flex flex-wrap gap-2">
            {JOB_TYPES.map((type) => (
              <Chip
                key={type.value}
                selected={config.search.jobTypes.includes(type.value)}
                onClick={() =>
                  patchSearch({ jobTypes: toggleArray<JobTypePreference>(config.search.jobTypes, type.value, 4) })
                }
              >
                {type.label}
              </Chip>
            ))}
          </div>
        </Panel>

        <Panel title="Job title keywords" optional hint="Helps a lot. Add up to 5.">
          <TagInput
            value={config.search.titles}
            max={5}
            placeholder="Product Manager"
            suggestions={[...POPULAR_JOB_TITLE_QUICK_PICKS]}
            autocompleteSuggestions={POPULAR_JOB_TITLES}
            onChange={(titles) => patchSearch({ titles })}
          />
        </Panel>
      </div>
    </div>
  );
}

function StepFilters({
  config,
  patchFilters,
  reviewPromptActive,
  toggleArray,
}: {
  config: OnboardingConfig;
  patchFilters: (patch: Partial<OnboardingConfig["filters"]>) => void;
  reviewPromptActive: boolean;
  toggleArray: <T extends string>(values: T[], value: T, max?: number) => T[];
}) {
  return (
    <div className="grid gap-3">
      <Panel
        title="Job match"
        hint="Controls how close a role must be to your background."
      >
        <Segmented
          value={config.filters.match}
          options={[
            { value: "highest", label: "Narrow", hint: "Direct matches only" },
            { value: "higher", label: "Default", hint: "Related roles" },
            { value: "high", label: "Broad", hint: "Adjacent fields OK" },
          ]}
          onChange={(value) => patchFilters({ match: value as MatchPreference })}
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold leading-5 text-muted">
          <Info className="size-3.5 shrink-0 text-brand-600" />
          Narrow means direct matches. Broad allows adjacent roles when the queue is light.
        </p>
      </Panel>

      <Expandable
        title="Seniority and time zones"
        hint="Worth checking before Next; keeps the queue closer to your target roles."
        forceOpen={reviewPromptActive}
        status={config.filters.seniority.length + config.filters.timeZones.length > 0 ? "Filled" : "Review"}
        attention={reviewPromptActive}
      >
        <SectionLabel>Seniority</SectionLabel>
        <div className="mb-4 flex flex-wrap gap-2">
          {SENIORITY.map((item) => (
            <Chip
              key={item}
              selected={config.filters.seniority.includes(item)}
              onClick={() => patchFilters({ seniority: toggleArray(config.filters.seniority, item) })}
            >
              {item}
            </Chip>
          ))}
        </div>
        <SectionLabel>Remote time zones</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {TIME_ZONES.map((item) => (
            <Chip
              key={item}
              selected={config.filters.timeZones.includes(item)}
              onClick={() => patchFilters({ timeZones: toggleArray(config.filters.timeZones, item) })}
            >
              {item}
            </Chip>
          ))}
        </div>
      </Expandable>

      <Expandable
        title="Advanced filters"
        hint="Add hard requirements and exclusions so weak roles stay out."
        forceOpen={reviewPromptActive}
        status={
          config.filters.industries.length +
            config.filters.languages.length +
            config.filters.includeKeywords.length +
            config.filters.excludeKeywords.length +
            config.filters.excludeCompanies.length >
          0
            ? "Filled"
            : "Review"
        }
        attention={reviewPromptActive}
      >
        <div className="grid gap-4">
          <div>
            <SectionLabel>Industry</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((item) => (
                <Chip
                  key={item}
                  selected={config.filters.industries.includes(item)}
                  onClick={() => patchFilters({ industries: toggleArray(config.filters.industries, item) })}
                >
                  {item}
                </Chip>
              ))}
            </div>
          </div>
          <TagInput
            label="Job description language"
            value={config.filters.languages}
            placeholder="English"
            suggestions={LANGUAGES}
            onChange={(languages) => patchFilters({ languages })}
          />
          <TagInput
            label="Include keywords"
            value={config.filters.includeKeywords}
            placeholder="B2B, AI, platform"
            onChange={(includeKeywords) => patchFilters({ includeKeywords })}
          />
          <TagInput
            label="Exclude keywords"
            value={config.filters.excludeKeywords}
            placeholder="commission only, unpaid"
            onChange={(excludeKeywords) => patchFilters({ excludeKeywords })}
          />
          <TagInput
            label="Exclude companies"
            value={config.filters.excludeCompanies}
            placeholder="Company name"
            onChange={(excludeCompanies) => patchFilters({ excludeCompanies })}
          />
        </div>
      </Expandable>
    </div>
  );
}

function StepProfile({
  config,
  fileRef,
  parseStatus,
  parseMessage,
  patchBasics,
  patchLinks,
  patchProfile,
  patchScreening,
  patchWorkAuth,
  setConfig,
  toggleArray,
  uploadResume,
  reviewPromptActive,
}: {
  config: OnboardingConfig;
  fileRef: React.RefObject<HTMLInputElement | null>;
  parseStatus: "idle" | "uploading" | "parsed" | "error";
  parseMessage: string;
  patchBasics: (patch: Partial<OnboardingConfig["profile"]["basics"]>) => void;
  patchLinks: (patch: Partial<OnboardingConfig["profile"]["links"]>) => void;
  patchProfile: (patch: Partial<OnboardingConfig["profile"]>) => void;
  patchScreening: (patch: Partial<OnboardingConfig["profile"]["screening"]>) => void;
  patchWorkAuth: (patch: Partial<OnboardingConfig["profile"]["workAuth"]>) => void;
  setConfig: React.Dispatch<React.SetStateAction<OnboardingConfig>>;
  toggleArray: <T extends string>(values: T[], value: T, max?: number) => T[];
  uploadResume: (file: File) => Promise<void>;
  reviewPromptActive: boolean;
}) {
  const masterResumeComplete = isMasterResumeComplete(config);
  const profileInformationComplete = isProfileInformationComplete(config);
  const experienceEducationComplete = isExperienceEducationComplete(config);
  const commonScreeningComplete = isCommonScreeningComplete(config);
  const lessCommonScreeningComplete = hasLessCommonScreening(config);
  const voluntaryIdentityComplete = hasVoluntaryIdentityAnswers(config);

  return (
    <div className="grid gap-3">
      <Expandable
        title="Master resume"
        hint="Upload the base resume JobPosted and Rezoomed should tailor for each role."
        forceOpen={reviewPromptActive && !masterResumeComplete}
        status={masterResumeComplete ? "Done" : "Required"}
        done={masterResumeComplete}
        attention={reviewPromptActive && !masterResumeComplete}
      >
        <div className="flex flex-col gap-3 rounded-xl bg-brand-50/70 p-3 ring-1 ring-inset ring-brand-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 ring-1 ring-inset ring-brand-100">
              {parseStatus === "uploading" ? <Loader2 className="size-5 animate-spin" /> : <FileSearch className="size-5" />}
            </span>
            <div>
              <p className="text-sm font-black text-ink">
                {config.profile.resumeName || "No resume uploaded yet"}
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-muted">
                {parseMessage || "PDF, DOCX, or text, up to 6 MB. Review all filled fields before launch."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parseStatus === "uploading"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-black text-white transition-colors hover:bg-brand-700 disabled:pointer-events-none disabled:opacity-60"
          >
            <UploadCloud className="size-4" />
            {config.profile.resumeName ? "Replace resume" : "Upload resume"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadResume(file);
            }}
          />
        </div>
      </Expandable>

      <Expandable
        title="Profile information"
        hint="Most of this can be filled from your resume."
        forceOpen={reviewPromptActive && !profileInformationComplete}
        status={profileInformationComplete ? "Done" : "Required"}
        done={profileInformationComplete}
        attention={reviewPromptActive && !profileInformationComplete}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Full name" value={config.profile.basics.fullName} onChange={(fullName) => patchBasics({ fullName })} />
          <Field label="Email" type="email" value={config.profile.basics.email} onChange={(email) => patchBasics({ email })} />
          <Field label="Phone" optional value={config.profile.basics.phone} onChange={(phone) => patchBasics({ phone })} />
          <Field label="Location" optional value={config.profile.basics.location} onChange={(location) => patchBasics({ location })} />
          <Field label="LinkedIn" optional value={config.profile.links.linkedin} onChange={(linkedin) => patchLinks({ linkedin })} />
          <Field label="Portfolio / website" optional value={config.profile.links.portfolio} onChange={(portfolio) => patchLinks({ portfolio })} />
          <Field label="GitHub" optional value={config.profile.links.github} onChange={(github) => patchLinks({ github })} />
          <div>
            <span className={labelCls}>
              Sponsorship
              <OptionalBadge />
            </span>
            <DashboardSelect
              value={
                config.profile.workAuth.needsSponsorship === true
                  ? "yes"
                  : config.profile.workAuth.needsSponsorship === false
                    ? "no"
                    : ""
              }
              options={SPONSORSHIP_OPTIONS}
              onChange={(value) =>
                patchWorkAuth({
                  needsSponsorship:
                    value === "yes" ? true : value === "no" ? false : null,
                })
              }
              ariaLabel="Sponsorship"
              buttonClassName={selectButtonCls}
            />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 max-w-3xl">
            <p className="text-sm font-black text-ink">Compensation autofill</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-muted">
              Optional. Use annual gross/base compensation in your local currency. If a form asks a
              generic salary question, JobPosted will wait for review instead of guessing.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <span className={labelCls}>
                Current salary / CTC
                <OptionalBadge />
              </span>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Amount"
                  value={config.profile.workAuth.currentSalaryMin ?? ""}
                  onChange={(event) =>
                    patchWorkAuth({ currentSalaryMin: event.target.value === "" ? null : Number(event.target.value) })
                  }
                  className={inputCls}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Upper range"
                  value={config.profile.workAuth.currentSalaryMax ?? ""}
                  onChange={(event) =>
                    patchWorkAuth({ currentSalaryMax: event.target.value === "" ? null : Number(event.target.value) })
                  }
                  className={inputCls}
                />
                <DashboardSelect
                  value={config.profile.workAuth.currentSalaryCurrency}
                  options={CURRENCY_OPTIONS}
                  onChange={(currentSalaryCurrency) => patchWorkAuth({ currentSalaryCurrency })}
                  ariaLabel="Current salary currency"
                  buttonClassName={selectButtonCls}
                  align="right"
                />
              </div>
            </div>
            <div>
              <span className={labelCls}>
                Expected salary / CTC
                <OptionalBadge />
              </span>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Minimum"
                  value={config.profile.workAuth.salaryMin ?? ""}
                  onChange={(event) =>
                    patchWorkAuth({ salaryMin: event.target.value === "" ? null : Number(event.target.value) })
                  }
                  className={inputCls}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="Maximum"
                  value={config.profile.workAuth.salaryMax ?? ""}
                  onChange={(event) =>
                    patchWorkAuth({ salaryMax: event.target.value === "" ? null : Number(event.target.value) })
                  }
                  className={inputCls}
                />
                <DashboardSelect
                  value={config.profile.workAuth.salaryCurrency}
                  options={CURRENCY_OPTIONS}
                  onChange={(salaryCurrency) => patchWorkAuth({ salaryCurrency })}
                  ariaLabel="Expected salary currency"
                  buttonClassName={selectButtonCls}
                  align="right"
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs font-semibold text-muted">
            Current salary fills only current-compensation questions. Expected salary fills only
            expected or desired compensation questions.
          </p>
        </div>
        <div className="mt-4">
          <Field label="Headline" value={config.profile.headline} onChange={(headline) => patchProfile({ headline })} />
        </div>
        <label className="mt-4 block">
          <span className={labelCls}>Summary</span>
          <textarea
            value={config.profile.summary}
            onChange={(event) => patchProfile({ summary: event.target.value })}
            rows={3}
            className={cn(inputCls, "h-auto py-3 leading-6")}
            placeholder="A short professional summary."
          />
        </label>
        <div className="mt-4">
          <TagInput
            label="Skills"
            value={config.profile.skills}
            placeholder="Product strategy, SQL, GTM"
            onChange={(skills) => patchProfile({ skills })}
          />
        </div>
      </Expandable>

      <Expandable
        title="Experience and education"
        hint="Review parsed resume details; JobPosted uses these to answer forms."
        forceOpen={reviewPromptActive && !experienceEducationComplete}
        status={experienceEducationComplete ? "Done" : "Review"}
        done={experienceEducationComplete}
        attention={reviewPromptActive && !experienceEducationComplete}
      >
        <RepeatingExperience config={config} setConfig={setConfig} />
        <div className="mt-5">
          <RepeatingEducation config={config} setConfig={setConfig} />
        </div>
      </Expandable>

      <Expandable
        title="Common screening questions"
        hint="Answer once — JobPosted reuses these across applications."
        forceOpen={reviewPromptActive && !commonScreeningComplete}
        status={commonScreeningComplete ? "Done" : "Required"}
        done={commonScreeningComplete}
        attention={reviewPromptActive && !commonScreeningComplete}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceGroup
            label="Remote preference"
            value={config.profile.screening.hybridPreference}
            options={["Open to hybrid", "I only want full remote"]}
            onChange={(hybridPreference) => patchScreening({ hybridPreference })}
          />
          <BooleanChoice
            label="Comfortable travelling?"
            value={config.profile.screening.travelOk}
            onChange={(travelOk) => patchScreening({ travelOk })}
          />
          <BooleanChoice
            label="Open to relocation?"
            value={config.profile.screening.relocationOk}
            onChange={(relocationOk) => {
              patchScreening({ relocationOk });
              patchWorkAuth({ relocationOk });
            }}
          />
          <TagInput
            label="Fluent languages"
            max={6}
            value={config.profile.screening.spokenLanguages}
            suggestions={COMMON_LANGUAGES}
            placeholder="English"
            onChange={(spokenLanguages) => patchScreening({ spokenLanguages })}
          />
        </div>
      </Expandable>

      <Expandable
        title="Less common application questions"
        hint="Useful for forms that ask GPA, DOB, licenses, or clearance."
        forceOpen={reviewPromptActive && !lessCommonScreeningComplete}
        status={lessCommonScreeningComplete ? "Done" : "Review"}
        done={lessCommonScreeningComplete}
        attention={reviewPromptActive && !lessCommonScreeningComplete}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Date of birth"
            type="date"
            value={config.profile.screening.dateOfBirth}
            onChange={(dateOfBirth) => patchScreening({ dateOfBirth })}
          />
          <Field label="Latest GPA score" value={config.profile.screening.gpa} onChange={(gpa) => patchScreening({ gpa })} />
          <BooleanChoice label="At least 18 years of age?" value={config.profile.screening.over18} onChange={(over18) => patchScreening({ over18 })} />
          <TagInput
            label="Driving licenses"
            value={config.profile.screening.drivingLicenses}
            suggestions={DRIVING_LICENSES}
            placeholder="Car"
            onChange={(drivingLicenses) => patchScreening({ drivingLicenses })}
          />
          <label className="sm:col-span-2">
            <span className={labelCls}>Security clearance</span>
            <textarea
              value={config.profile.screening.securityClearance}
              onChange={(event) => patchScreening({ securityClearance: event.target.value })}
              rows={3}
              className={cn(inputCls, "h-auto py-3 leading-6")}
              placeholder="I don't have any Security Clearance"
            />
          </label>
        </div>
      </Expandable>

      <Expandable
        title="Voluntary identity questions"
        hint="Optional. These are never used for job matching or filtering."
        status={voluntaryIdentityComplete ? "Filled" : "Sensitive"}
        done={voluntaryIdentityComplete}
      >
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800 ring-1 ring-inset ring-amber-100">
          These answers are sensitive. JobPosted only stores them when encryption is configured on the server.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gender identity" value={config.profile.screening.genderIdentity} onChange={(genderIdentity) => patchScreening({ genderIdentity })} />
          <ChoiceGroup
            label="Disability status"
            value={config.profile.screening.disabilityStatus}
            options={["Yes", "No", "Prefer not to say"]}
            onChange={(disabilityStatus) => patchScreening({ disabilityStatus })}
          />
          <ChoiceGroup
            label="Military service"
            value={config.profile.screening.veteranStatus}
            options={["Yes", "No", "Prefer not to say"]}
            onChange={(veteranStatus) => patchScreening({ veteranStatus })}
          />
          <Field label="Racial / ethnic background" value={config.profile.screening.raceEthnicity} onChange={(raceEthnicity) => patchScreening({ raceEthnicity })} />
        </div>
      </Expandable>
    </div>
  );
}

function StepFinal({
  config,
  patchFinal,
  setConfig,
}: {
  config: OnboardingConfig;
  patchFinal: (patch: Partial<OnboardingConfig["final"]>) => void;
  setConfig: React.Dispatch<React.SetStateAction<OnboardingConfig>>;
}) {
  return (
    <div className="grid gap-3">
      <Panel title="The Process" hint="Choose the workflow you want to start with.">
        <div className="grid gap-3 md:grid-cols-2">
          <OptionCard
            active={config.final.applicationMode === "review"}
            icon={<ShieldCheck className="size-4" />}
            title="Auto-Save & Manual Review"
            hint="Auto-fills forms, then waits for you to review and submit."
            badge="Recommended"
            onClick={() => patchFinal({ applicationMode: "review" })}
          />
          <OptionCard
            active={config.final.applicationMode === "auto"}
            icon={<BriefcaseBusiness className="size-4" />}
            title="Full Auto-Apply"
            hint="Fills and submits matched applications automatically."
            onClick={() => patchFinal({ applicationMode: "auto" })}
          />
        </div>
      </Panel>

      <Panel title="Resume tailoring" hint="Choose how JobPosted prepares the resume attached to each application.">
        <div className="grid gap-3 md:grid-cols-2">
          <OptionCard
            active={config.final.tailorResume}
            icon={<Sparkles className="size-4" />}
            title="Tailor each resume"
            hint="Rewrite supported bullets and skills for the specific role."
            badge="Recommended"
            onClick={() => patchFinal({ tailorResume: true })}
          />
          <OptionCard
            active={!config.final.tailorResume}
            icon={<FileText className="size-4" />}
            title="Use my master resume"
            hint="Attach the active resume without per-job rewriting."
            onClick={() => patchFinal({ tailorResume: false })}
          />
        </div>
      </Panel>

      <Panel title="Writing style" optional hint="Personalize how JobPosted answers application questions.">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            label="Sentence length"
            value={config.final.writingStyle.sentenceLength}
            options={["Short and direct", "Balanced mix", "Detailed when useful"]}
            onChange={(sentenceLength) =>
              setConfig((current) => ({
                ...current,
                final: {
                  ...current.final,
                  writingStyle: { ...current.final.writingStyle, sentenceLength },
                },
              }))
            }
          />
          <SelectField
            label="Tone"
            value={config.final.writingStyle.tone}
            options={["Formal", "Neutral-casual", "Warm and confident"]}
            onChange={(tone) =>
              setConfig((current) => ({
                ...current,
                final: { ...current.final, writingStyle: { ...current.final.writingStyle, tone } },
              }))
            }
          />
          <SelectField
            label="Vocabulary"
            value={config.final.writingStyle.vocabulary}
            options={["Simple, everyday words", "Balanced professional", "More technical"]}
            onChange={(vocabulary) =>
              setConfig((current) => ({
                ...current,
                final: { ...current.final, writingStyle: { ...current.final.writingStyle, vocabulary } },
              }))
            }
          />
        </div>
        <div className="mt-3 rounded-xl bg-brand-50 p-3 ring-1 ring-inset ring-brand-100">
          <p className="text-xs font-black text-brand-700">Preview</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-brand-950">
            I&apos;m comfortable working cross-functionally, clarifying ambiguous requirements, and moving
            quickly while keeping stakeholders aligned.
          </p>
        </div>
      </Panel>

    </div>
  );
}

function Panel({
  title,
  hint,
  optional = false,
  children,
}: {
  title: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white/60 p-4 ring-1 ring-inset ring-zinc-200/70 sm:p-5">
      <div className="mb-3.5">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          {title}
          {optional && <OptionalBadge />}
        </h3>
        {hint && <p className="mt-0.5 text-xs font-semibold leading-5 text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Expandable({
  title,
  hint,
  status = "Review",
  done = false,
  attention = false,
  forceOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  status?: string;
  done?: boolean;
  attention?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const completeCollapsed = done && !open;
  const statusComplete = done || status === "Done" || status === "Filled";

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <motion.section
      layout={!reduce}
      initial={false}
      className={cn(
        "relative overflow-hidden rounded-xl transition-[background-color,box-shadow,transform] duration-200 ease-out before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/95",
        completeCollapsed
          ? "bg-emerald-50 shadow-[0_22px_54px_-30px_rgba(5,150,105,0.8),0_12px_28px_-20px_rgba(6,95,70,0.42),0_0_0_1px_rgba(16,185,129,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-[0_28px_66px_-34px_rgba(5,150,105,0.88),0_16px_32px_-22px_rgba(6,95,70,0.48),0_0_0_1px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.98)]"
          : attention
            ? "bg-[#f4f9ff] shadow-[0_22px_56px_-32px_rgba(31,100,224,0.82),0_12px_28px_-22px_rgba(23,79,184,0.42),0_0_0_2px_rgba(147,197,253,0.68),inset_0_1px_0_rgba(255,255,255,0.95)]"
            : open
              ? "bg-[#fbfdff] shadow-[0_26px_66px_-36px_rgba(15,23,42,0.68),0_14px_30px_-22px_rgba(31,100,224,0.46),0_0_0_1px_rgba(219,234,254,0.82),inset_0_1px_0_rgba(255,255,255,0.96)]"
              : "bg-[#fbfdff] shadow-[0_20px_50px_-34px_rgba(15,23,42,0.66),0_10px_24px_-18px_rgba(31,100,224,0.38),0_0_0_1px_rgba(219,234,254,0.72),inset_0_1px_0_rgba(255,255,255,0.95)] hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_28px_68px_-36px_rgba(15,23,42,0.72),0_16px_34px_-22px_rgba(31,100,224,0.44),0_0_0_1px_rgba(191,219,254,0.78),inset_0_1px_0_rgba(255,255,255,0.98)]",
      )}
      transition={{ duration: 0.24, ease: EASE }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 rounded-xl p-4 text-left outline-none transition-[padding] duration-200 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="block text-sm font-extrabold text-ink">{title}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-black",
                statusComplete
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100"
                  : status === "Sensitive"
                    ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100"
                    : status === "Required"
                      ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100"
                    : "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100",
              )}
            >
              {status}
            </span>
          </span>
          {hint && <span className="mt-0.5 block text-xs font-bold leading-5 text-slate-600">{hint}</span>}
        </span>
        <motion.span
          className={cn(
            "grid size-9 shrink-0 place-items-center transition-colors",
            completeCollapsed
              ? "rounded-full bg-emerald-600 text-white shadow-[0_10px_20px_-12px_rgba(5,150,105,0.9)]"
              : open || attention
                ? "rounded-lg bg-brand-600 text-white shadow-[0_10px_20px_-12px_rgba(31,100,224,0.9)]"
                : "rounded-lg bg-brand-50 text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_-16px_rgba(31,100,224,0.6)]",
          )}
          animate={reduce ? undefined : { scale: open ? 1.04 : 1, rotate: completeCollapsed ? 0 : open ? 180 : 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          aria-hidden
        >
          {completeCollapsed ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0, y: -8, filter: "blur(4px)" }}
            animate={{ opacity: 1, height: "auto", y: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, height: 0, y: -6, filter: "blur(3px)" }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pt-1 pb-4">
              <div className="h-px bg-gradient-to-r from-transparent via-brand-100 to-transparent" />
              <div className="pt-3">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function OptionCard({
  active,
  icon,
  title,
  hint,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative min-h-20 rounded-xl p-3 text-left ring-1 ring-inset transition-colors",
        active
          ? "bg-brand-600 text-white ring-brand-600"
          : "bg-white text-ink ring-zinc-200 hover:bg-brand-50",
      )}
    >
      <span className={cn("grid size-8 place-items-center rounded-lg", active ? "bg-white/15" : "bg-brand-50 text-brand-700")}>
        {icon}
      </span>
      <span className="mt-2 block text-sm font-black">{title}</span>
      <span className={cn("mt-0.5 block text-xs font-semibold leading-5", active ? "text-white/75" : "text-muted")}>
        {hint}
      </span>
      {badge && (
        <span className={cn("absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-black", active ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700")}>
          {badge}
        </span>
      )}
    </button>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold ring-1 ring-inset transition-all",
        selected
          ? "bg-brand-600 text-white ring-brand-600 shadow-[0_8px_18px_-12px_rgba(31,100,224,0.8)]"
          : "bg-white text-ink ring-zinc-200 hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200",
      )}
    >
      {selected && <CheckCircle2 className="size-3.5" />}
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  optional = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label}
        {optional && <OptionalBadge />}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputCls}
      />
      {hint && <span className="mt-1 block text-[11px] font-medium text-muted">{hint}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label}
        {optional && <OptionalBadge />}
      </span>
      <DashboardSelect
        value={value}
        options={options.map((option) => ({ value: option, label: option }))}
        onChange={onChange}
        ariaLabel={label}
        buttonClassName={selectButtonCls}
      />
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-black text-muted">{children}</p>;
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; hint: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-xl bg-brand-50 p-1.5 sm:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-lg px-3 py-2 text-left transition-colors",
            value === option.value ? "bg-brand-600 text-white" : "bg-white/72 text-ink hover:bg-white",
          )}
        >
          <span className="block text-sm font-black">{option.label}</span>
          <span className={cn("mt-0.5 block text-xs font-semibold", value === option.value ? "text-white/75" : "text-muted")}>
            {option.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function normalizeTitleQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleMatchScore(title: string, query: string) {
  const normalizedTitle = normalizeTitleQuery(title);
  if (!normalizedTitle || !query) return -1;
  if (normalizedTitle === query) return 0;
  if (normalizedTitle.startsWith(query)) return 1;
  const titleWords = normalizedTitle.split(" ");
  if (titleWords.some((word) => word.startsWith(query))) return 2;
  if (normalizedTitle.includes(query)) return 3;
  const queryWords = query.split(" ").filter(Boolean);
  if (queryWords.every((queryWord) => titleWords.some((titleWord) => titleWord.startsWith(queryWord)))) {
    return 4;
  }
  if (queryWords.every((queryWord) => normalizedTitle.includes(queryWord))) return 5;
  return -1;
}

function TagInput({
  label,
  value,
  suggestions,
  autocompleteSuggestions,
  placeholder,
  max = 20,
  onChange,
}: {
  label?: string;
  value: string[];
  suggestions?: string[];
  autocompleteSuggestions?: string[];
  placeholder: string;
  max?: number;
  onChange: (value: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const remaining = Math.max(0, max - value.length);
  const suggestionList = useMemo(
    () => (suggestions ?? []).filter((item) => !value.includes(item)).slice(0, remaining || 0),
    [remaining, suggestions, value],
  );
  const dropdownSuggestions = useMemo(() => {
    if (!autocompleteSuggestions || value.length >= max) return [];
    const query = normalizeTitleQuery(input);
    if (!query) return [];
    const selected = new Set(value.map((item) => item.toLowerCase()));
    return autocompleteSuggestions
      .map((title) => ({ title, score: titleMatchScore(title, query) }))
      .filter(({ title, score }) => score >= 0 && !selected.has(title.toLowerCase()))
      .sort((a, b) => a.score - b.score || a.title.length - b.title.length || a.title.localeCompare(b.title))
      .slice(0, Math.min(16, remaining || 16))
      .map(({ title }) => title);
  }, [autocompleteSuggestions, input, max, remaining, value]);
  const showDropdown = focused && dropdownSuggestions.length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [input]);

  useEffect(() => {
    if (activeIndex >= dropdownSuggestions.length) setActiveIndex(0);
  }, [activeIndex, dropdownSuggestions.length]);

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) {
      if (next.length >= max) break;
      if (!next.some((item) => item.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    onChange(next);
    setInput("");
  }

  return (
    <div>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className="relative rounded-xl bg-white p-2 ring-1 ring-inset ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-500">
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 text-xs font-black text-brand-700 ring-1 ring-inset ring-brand-100"
            >
              {item}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== item))} aria-label={`Remove ${item}`}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          <input
            value={input}
            disabled={value.length >= max}
            onFocus={() => setFocused(true)}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (showDropdown && event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % dropdownSuggestions.length);
                return;
              }
              if (showDropdown && event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => (index - 1 + dropdownSuggestions.length) % dropdownSuggestions.length);
                return;
              }
              if (showDropdown && event.key === "Enter") {
                event.preventDefault();
                add(dropdownSuggestions[activeIndex] ?? input);
                return;
              }
              if (showDropdown && event.key === "Escape") {
                event.preventDefault();
                setFocused(false);
                return;
              }
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                add(input);
              }
            }}
            onBlur={() => {
              setFocused(false);
              add(input);
            }}
            placeholder={value.length >= max ? "Limit reached" : placeholder}
            aria-autocomplete={autocompleteSuggestions ? "list" : undefined}
            aria-expanded={autocompleteSuggestions ? showDropdown : undefined}
            className="h-8 min-w-[12rem] flex-1 bg-transparent px-1 text-sm font-semibold text-ink outline-none placeholder:text-zinc-500"
          />
        </div>
        {showDropdown && (
          <div
            role="listbox"
            className="absolute right-2 left-2 top-[calc(100%+0.5rem)] z-30 max-h-72 overflow-auto rounded-xl bg-white p-1.5 shadow-[0_16px_34px_rgba(15,23,42,0.16)] ring-1 ring-inset ring-zinc-200"
          >
            {dropdownSuggestions.map((item, index) => (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(item);
                }}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors",
                  index === activeIndex ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-zinc-50",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
      {suggestionList.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestionList.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => add(item)}
              className="rounded-full bg-white/75 px-3 py-1.5 text-xs font-black text-muted ring-1 ring-inset ring-zinc-200 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BooleanChoice({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  optional?: boolean;
}) {
  const options = [
    { label: "Yes", value: true },
    { label: "No", value: false },
  ];
  return (
    <div>
      <span className={labelCls}>
        {label}
        {optional && <OptionalBadge />}
      </span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold ring-1 ring-inset transition-all",
                active
                  ? "bg-brand-600 text-white ring-brand-600 shadow-[0_10px_22px_-12px_rgba(31,100,224,0.75)]"
                  : "bg-white text-ink ring-zinc-200 hover:bg-brand-50 hover:ring-brand-200",
              )}
            >
              {active && <CheckCircle2 className="size-4" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceGroup({
  label,
  value,
  options,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <div>
      <span className={labelCls}>
        {label}
        {optional && <OptionalBadge />}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip key={option} selected={value === option} onClick={() => onChange(option)}>
            {option}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function RepeatingExperience({
  config,
  setConfig,
}: {
  config: OnboardingConfig;
  setConfig: React.Dispatch<React.SetStateAction<OnboardingConfig>>;
}) {
  const experience = config.profile.experience.length > 0 ? config.profile.experience : [emptyExperience()];

  function update(index: number, patch: Partial<OnboardingExperience>) {
    setConfig((current) => {
      const list = (current.profile.experience.length > 0 ? current.profile.experience : [emptyExperience()]).map(
        (item, i) => (i === index ? { ...item, ...patch } : item),
      );
      return { ...current, profile: { ...current.profile, experience: list } };
    });
  }

  return (
    <div>
      <h4 className="text-sm font-black text-ink">Experience</h4>
      <div className="mt-3 space-y-3">
        {experience.map((item, index) => (
          <div key={index} className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-zinc-200">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" value={item.title} onChange={(title) => update(index, { title })} />
              <Field label="Company" value={item.company} onChange={(company) => update(index, { company })} />
              <Field label="Start" value={item.startDate} onChange={(startDate) => update(index, { startDate })} />
              <Field label="End" value={item.endDate} onChange={(endDate) => update(index, { endDate })} />
            </div>
            <label className="mt-3 block">
              <span className={labelCls}>Achievements, one per line</span>
              <textarea
                value={item.bullets.join("\n")}
                onChange={(event) =>
                  update(index, {
                    bullets: event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                rows={3}
                className={cn(inputCls, "h-auto py-3 leading-6")}
              />
            </label>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setConfig((current) => ({
            ...current,
            profile: { ...current.profile, experience: [...current.profile.experience, emptyExperience()] },
          }))
        }
        className="mt-3 inline-flex h-10 items-center rounded-xl bg-brand-50 px-3 text-sm font-black text-brand-700 ring-1 ring-inset ring-brand-100 hover:bg-brand-100"
      >
        Add experience
      </button>
    </div>
  );
}

function RepeatingEducation({
  config,
  setConfig,
}: {
  config: OnboardingConfig;
  setConfig: React.Dispatch<React.SetStateAction<OnboardingConfig>>;
}) {
  const education = config.profile.education.length > 0 ? config.profile.education : [emptyEducation()];

  function update(index: number, patch: Partial<OnboardingEducation>) {
    setConfig((current) => {
      const list = (current.profile.education.length > 0 ? current.profile.education : [emptyEducation()]).map(
        (item, i) => (i === index ? { ...item, ...patch } : item),
      );
      return { ...current, profile: { ...current.profile, education: list } };
    });
  }

  return (
    <div>
      <h4 className="text-sm font-black text-ink">Education</h4>
      <div className="mt-3 space-y-3">
        {education.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-inset ring-zinc-200 sm:grid-cols-2">
            <Field label="School" value={item.school} onChange={(school) => update(index, { school })} />
            <Field label="Degree" value={item.degree} onChange={(degree) => update(index, { degree })} />
            <Field label="Field" value={item.field} onChange={(field) => update(index, { field })} />
            <Field label="End" value={item.endDate} onChange={(endDate) => update(index, { endDate })} />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          setConfig((current) => ({
            ...current,
            profile: { ...current.profile, education: [...current.profile.education, emptyEducation()] },
          }))
        }
        className="mt-3 inline-flex h-10 items-center rounded-xl bg-brand-50 px-3 text-sm font-black text-brand-700 ring-1 ring-inset ring-brand-100 hover:bg-brand-100"
      >
        Add education
      </button>
    </div>
  );
}
