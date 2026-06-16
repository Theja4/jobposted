/**
 * Embedding backfill (gaps.md §3 / semantic recall). Fills `embedding` for rows that predate the
 * vector columns — jobs ingested before embeddings, and resume versions uploaded before the
 * resume embedding column existed. Idempotent (only touches rows where embedding IS NULL),
 * batched, and a clean no-op when Supabase/OpenAI env is absent.
 *
 *   pnpm --filter @jobposted/ingest backfill                 # jobs + resumes, 500 each
 *   pnpm --filter @jobposted/ingest backfill -- --jobs --limit 1000
 *   pnpm --filter @jobposted/ingest backfill -- --resumes
 */

import { createClient } from "@supabase/supabase-js";
import { resumeEmbeddingText } from "@jobposted/shared";
import { embedInputs, jobEmbedText } from "./embed";
import { mapLimit } from "./util";

// The jobposted schema isn't the supabase-js default `public`; type structurally so we don't
// need a generated Database type just to call `.from(...)`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = { from: (table: string) => any };

export interface BackfillSummary {
  jobsScanned: number;
  jobsEmbedded: number;
  resumesScanned: number;
  resumesEmbedded: number;
  skipped: boolean;
}

type StepResult = { scanned: number; embedded: number };

function serviceClient(): DbClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  }) as unknown as DbClient;
}

/** pgvector wants the vector as a JSON-array text literal. */
function toVector(value: number[] | null): string | null {
  return value && value.length > 0 ? JSON.stringify(value) : null;
}

type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  remote: string | null;
  description_md: string | null;
};

export async function backfillJobEmbeddings(client: DbClient, limit: number): Promise<StepResult> {
  const { data, error } = await client
    .from("jobs")
    .select("id,title,company,location,remote,description_md")
    .is("embedding", null)
    .limit(limit);
  if (error) throw new Error(`[backfill-jobs] ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as JobRow[];
  if (rows.length === 0) return { scanned: 0, embedded: 0 };

  const vectors = await embedInputs(
    rows.map((row) =>
      jobEmbedText({
        title: row.title,
        company: row.company,
        location: row.location,
        remote: row.remote,
        descriptionMd: row.description_md,
      }),
    ),
  );

  let embedded = 0;
  await mapLimit(rows, 5, async (row, i) => {
    const vector = toVector(vectors[i] ?? null);
    if (!vector) return;
    const { error: updateError } = await client.from("jobs").update({ embedding: vector }).eq("id", row.id);
    if (!updateError) embedded += 1;
  });

  return { scanned: rows.length, embedded };
}

type ResumeRow = { id: string; content: unknown };

export async function backfillResumeEmbeddings(client: DbClient, limit: number): Promise<StepResult> {
  const { data, error } = await client
    .from("resume_base_versions")
    .select("id,content")
    .is("embedding", null)
    .limit(limit);
  if (error) throw new Error(`[backfill-resumes] ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as ResumeRow[];
  if (rows.length === 0) return { scanned: 0, embedded: 0 };

  const vectors = await embedInputs(
    rows.map((row) => resumeEmbeddingText((row.content ?? {}) as Record<string, unknown>)),
  );

  let embedded = 0;
  await mapLimit(rows, 5, async (row, i) => {
    const vector = toVector(vectors[i] ?? null);
    if (!vector) return;
    const { error: updateError } = await client
      .from("resume_base_versions")
      .update({ embedding: vector })
      .eq("id", row.id);
    if (!updateError) embedded += 1;
  });

  return { scanned: rows.length, embedded };
}

export async function runBackfill(
  opts: { jobs?: boolean; resumes?: boolean; limit?: number } = {},
): Promise<BackfillSummary> {
  const client = serviceClient();
  if (!client) {
    console.info("[backfill] no Supabase env — skipping (dry run)");
    return { jobsScanned: 0, jobsEmbedded: 0, resumesScanned: 0, resumesEmbedded: 0, skipped: true };
  }

  const limit = Math.max(1, Math.min(2000, Math.floor(opts.limit ?? 500)));
  const doJobs = opts.jobs ?? true;
  const doResumes = opts.resumes ?? true;

  const jobs = doJobs ? await backfillJobEmbeddings(client, limit) : { scanned: 0, embedded: 0 };
  const resumes = doResumes ? await backfillResumeEmbeddings(client, limit) : { scanned: 0, embedded: 0 };

  return {
    jobsScanned: jobs.scanned,
    jobsEmbedded: jobs.embedded,
    resumesScanned: resumes.scanned,
    resumesEmbedded: resumes.embedded,
    skipped: false,
  };
}
