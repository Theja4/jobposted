/**
 * Upsert normalized jobs into `jobposted.jobs` using the service role key (design doc §9.4).
 * Idempotent: conflicts on the unique (source, source_job_id) are merged, not duplicated.
 * No-op (clean skip) when Supabase env is absent, so the fetch pipeline runs without secrets.
 */

import { createClient } from "@supabase/supabase-js";
import { dedupeKey, inferJobType, inferSeniority, type Job } from "@jobposted/shared";

export interface UpsertResult {
  skipped: boolean;
  upserted: number;
}

const OPTIONAL_JOB_COLUMNS = new Set([
  "closed_at",
  "company_domain",
  "company_logo_resolved_at",
  "company_logo_url",
  "dedupe_key",
  "embedding",
  "form_questions",
  "job_type",
  "last_seen_at",
  "salary_currency",
  "salary_max",
  "salary_min",
  "seniority",
  "visa_sponsorship",
]);

function missingColumnFromError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation "[^"]+" does not exist/i,
    /column [^."]*\.?([a-zA-Z_][a-zA-Z0-9_]*) does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function withoutDisabledColumns(row: Record<string, unknown>, disabledColumns: Set<string>) {
  if (disabledColumns.size === 0) return row;
  const next = { ...row };
  for (const column of disabledColumns) delete next[column];
  return next;
}

/** Map the camelCase Job to the snake_case jobs row. pgvector wants the vector as text. */
function toRow(job: Job, disabledColumns: Set<string> = new Set()): Record<string, unknown> {
  const row: Record<string, unknown> = {
    source: job.source,
    source_job_id: job.sourceJobId,
    ats_type: job.atsType,
    company: job.company,
    title: job.title,
    location: job.location,
    remote: job.remote,
    job_type: inferJobType(job.title, job.descriptionMd),
    seniority: inferSeniority(job.title, job.descriptionMd),
    description_md: job.descriptionMd,
    apply_url: job.applyUrl,
    form_questions: job.formQuestions,
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    visa_sponsorship: job.visaSponsorship,
    posted_at: job.postedAt,
    last_seen_at: new Date().toISOString(),
    closed_at: null,
    dedupe_key: dedupeKey(job.company, job.title, job.location),
    embedding: job.embedding ? JSON.stringify(job.embedding) : null,
  };
  if (job.companyDomain) row.company_domain = job.companyDomain;
  if (job.companyLogoResolvedAt) row.company_logo_resolved_at = job.companyLogoResolvedAt;
  if (job.companyLogoUrl) {
    row.company_logo_url = job.companyLogoUrl;
    row.company_logo_resolved_at = job.companyLogoResolvedAt ?? row.company_logo_resolved_at ?? new Date().toISOString();
  }
  return withoutDisabledColumns(row, disabledColumns);
}

export async function upsertJobs(jobs: Job[]): Promise<UpsertResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.info("[upsert] no Supabase env — skipping DB write (dry run)");
    return { skipped: true, upserted: 0 };
  }
  if (jobs.length === 0) return { skipped: false, upserted: 0 };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  });

  let upserted = 0;
  const batchSize = 500;
  const disabledColumns = new Set<string>();
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    for (;;) {
      const rows = batch.map((job) => toRow(job, disabledColumns));
      const { error } = await supabase
        .from("jobs")
        .upsert(rows, { onConflict: "source,source_job_id" });
      if (!error) break;

      const missingColumn = missingColumnFromError(error);
      if (missingColumn && OPTIONAL_JOB_COLUMNS.has(missingColumn) && !disabledColumns.has(missingColumn)) {
        disabledColumns.add(missingColumn);
        console.warn(`[upsert] production schema missing optional jobs.${missingColumn}; retrying without it`);
        continue;
      }

      throw new Error(`[upsert] ${error.message}`);
    }
    upserted += batch.length;
  }

  const closeAfterDays = Number(process.env.INGEST_CLOSE_AFTER_DAYS ?? 30);
  if (Number.isFinite(closeAfterDays) && closeAfterDays > 0) {
    const cutoff = new Date(Date.now() - closeAfterDays * 86_400_000).toISOString();
    const { error } = await supabase
      .from("jobs")
      .update({ closed_at: new Date().toISOString() })
      .is("closed_at", null)
      .lt("last_seen_at", cutoff);
    const missingColumn = error ? missingColumnFromError(error) : null;
    if (error && (!missingColumn || !OPTIONAL_JOB_COLUMNS.has(missingColumn))) {
      throw new Error(`[stale-close] ${error.message}`);
    }
    if (error && missingColumn) {
      console.warn(`[stale-close] production schema missing optional jobs.${missingColumn}; skipping stale close`);
    }
  }
  return { skipped: false, upserted };
}
