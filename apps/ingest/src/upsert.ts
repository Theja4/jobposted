/**
 * Upsert normalized jobs into `jobposted.jobs` using the service role key (design doc §9.4).
 * Idempotent: conflicts on the unique (source, source_job_id) are merged, not duplicated.
 * No-op (clean skip) when Supabase env is absent, so the fetch pipeline runs without secrets.
 */

import { createClient } from "@supabase/supabase-js";
import type { Job } from "@jobposted/shared";

export interface UpsertResult {
  skipped: boolean;
  upserted: number;
}

/** Map the camelCase Job to the snake_case jobs row. pgvector wants the vector as text. */
function toRow(job: Job): Record<string, unknown> {
  return {
    source: job.source,
    source_job_id: job.sourceJobId,
    ats_type: job.atsType,
    company: job.company,
    title: job.title,
    location: job.location,
    remote: job.remote,
    description_md: job.descriptionMd,
    apply_url: job.applyUrl,
    form_questions: job.formQuestions,
    salary_min: job.salaryMin,
    salary_max: job.salaryMax,
    salary_currency: job.salaryCurrency,
    visa_sponsorship: job.visaSponsorship,
    posted_at: job.postedAt,
    embedding: job.embedding ? JSON.stringify(job.embedding) : null,
  };
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
  for (let i = 0; i < jobs.length; i += batchSize) {
    const rows = jobs.slice(i, i + batchSize).map(toRow);
    const { error, count } = await supabase
      .from("jobs")
      .upsert(rows, { onConflict: "source,source_job_id", count: "exact" });
    if (error) throw new Error(`[upsert] ${error.message}`);
    upserted += count ?? rows.length;
  }
  return { skipped: false, upserted };
}
