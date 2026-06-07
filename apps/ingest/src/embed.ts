/**
 * Per-job match embeddings (design doc §9.4). Optional: with no API key configured, this is a
 * clean no-op — jobs keep `embedding: null` and the rest of the pipeline runs unchanged, so
 * fetch + normalize + dedupe are fully verifiable offline.
 */

import type { Job } from "@jobposted/shared";

const DEFAULT_MODEL = "text-embedding-3-small"; // 1536 dims
const OPENAI_BASE = "https://api.openai.com/v1";

/** Text used to embed a job: enough signal for match scoring without the full JD. */
function embedText(job: Job): string {
  const desc = (job.descriptionMd ?? "").slice(0, 2000);
  return [
    job.title,
    job.company,
    job.location ?? "",
    job.remote,
    desc,
  ]
    .filter(Boolean)
    .join("\n");
}

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Attach embeddings to jobs in place-by-copy. Returns the same jobs with `embedding` filled
 * when a key is present; otherwise returns them untouched.
 */
export async function embedJobs(jobs: Job[]): Promise<Job[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
  if (!apiKey || jobs.length === 0) {
    if (!apiKey) console.info("[embed] no OPENAI_API_KEY — skipping embeddings (jobs.embedding=null)");
    return jobs;
  }

  const batchSize = 96;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    try {
      const res = await fetch(`${OPENAI_BASE}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: batch.map(embedText) }),
      });
      if (!res.ok) {
        console.error(`[embed] HTTP ${res.status} — leaving this batch unembedded`);
        continue;
      }
      const json = (await res.json()) as EmbeddingResponse;
      for (const { index, embedding } of json.data) {
        const job = batch[index];
        if (job) job.embedding = embedding;
      }
    } catch (err) {
      console.error("[embed] request failed — leaving this batch unembedded", err);
    }
  }
  return jobs;
}
