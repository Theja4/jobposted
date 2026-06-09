import "server-only";

import {
  EMPTY_PREFERENCES,
  scoreJob,
  type AtsType,
  type Job,
  type JobPreferences,
  type Profile,
  type RemoteType,
} from "@jobposted/shared";
import type { FeedJob } from "./feed-types";
import { createSupabaseServerClient } from "./supabase/server";

const JOB_COLUMNS =
  "id,company,title,location,remote,description_md,apply_url,ats_type,salary_min,salary_max,salary_currency,visa_sponsorship,posted_at,ingested_at";

interface JobRow {
  id: string;
  company: string | null;
  title: string | null;
  location: string | null;
  remote: string | null;
  description_md: string | null;
  apply_url: string | null;
  ats_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  visa_sponsorship: boolean | null;
  posted_at: string | null;
  ingested_at: string | null;
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    source: "manual",
    sourceJobId: r.id,
    atsType: (r.ats_type ?? "other") as AtsType,
    company: r.company ?? "",
    title: r.title ?? "",
    location: r.location,
    remote: (r.remote ?? "unknown") as RemoteType,
    descriptionMd: r.description_md,
    applyUrl: r.apply_url ?? "",
    formQuestions: [],
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    salaryCurrency: r.salary_currency,
    visaSponsorship: r.visa_sponsorship,
    postedAt: r.posted_at,
    ingestedAt: r.ingested_at ?? undefined,
  };
}

/** Sanitize a term for a PostgREST `ilike` filter (drops chars that break the or() grammar). */
function likeTerm(s: string): string {
  return s.replace(/[%,()*\\]/g, " ").trim();
}

export interface FeedArgs {
  prefs: JobPreferences;
  profile: Profile | null;
  queuedJobIds: Set<string>;
  limit?: number;
}

/**
 * Build the matched feed (design doc §10.3): SQL hard-filters narrow a candidate set, then the
 * shared `scoreJob` ranks it in JS. Returns the top N eligible jobs.
 */
export async function getFeed({
  prefs,
  profile,
  queuedJobIds,
  limit = 48,
}: FeedArgs): Promise<FeedJob[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .order("ingested_at", { ascending: false })
    .limit(400);

  const titleOr = prefs.titles
    .map(likeTerm)
    .filter(Boolean)
    .map((t) => `title.ilike.%${t}%`)
    .join(",");
  if (titleOr) query = query.or(titleOr);
  if (prefs.remoteOnly) query = query.neq("remote", "on-site");

  const { data, error } = await query.returns<JobRow[]>();
  if (error || !data) return [];

  return data
    .map((r) => {
      const job = rowToJob(r);
      const match = scoreJob(job, prefs, profile);
      return { job, match };
    })
    .filter((x) => x.match.eligible)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit)
    .map(({ job, match }) => ({
      id: job.id as string,
      company: job.company,
      title: job.title,
      location: job.location,
      remote: job.remote,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      atsType: job.atsType,
      applyUrl: job.applyUrl,
      score: match.score,
      reasons: match.reasons,
      queued: queuedJobIds.has(job.id as string),
    }));
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  work_authorization: string | null;
  needs_sponsorship: boolean | null;
  relocation_ok: boolean | null;
  relocation_notes: string | null;
  salary_expectation_min: number | null;
  salary_expectation_max: number | null;
  salary_currency: string | null;
  notice_period_days: number | null;
  preferences: JobPreferences | null;
  onboarded_at: string | null;
}

export function rowToProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    location: r.location,
    linkedinUrl: r.linkedin_url,
    portfolioUrl: r.portfolio_url,
    workAuthorization: (r.work_authorization as Profile["workAuthorization"]) ?? null,
    needsSponsorship: r.needs_sponsorship,
    relocationOk: r.relocation_ok,
    relocationNotes: r.relocation_notes,
    salaryExpectationMin: r.salary_expectation_min,
    salaryExpectationMax: r.salary_expectation_max,
    salaryCurrency: r.salary_currency,
    noticePeriodDays: r.notice_period_days,
    preferences: r.preferences,
    onboardedAt: r.onboarded_at,
  };
}

export function prefsOf(profile: Profile | null): JobPreferences {
  return profile?.preferences ?? { ...EMPTY_PREFERENCES };
}

export const PROFILE_COLUMNS =
  "id,full_name,email,phone,location,linkedin_url,portfolio_url,work_authorization,needs_sponsorship,relocation_ok,relocation_notes,salary_expectation_min,salary_expectation_max,salary_currency,notice_period_days,preferences,onboarded_at";
