/**
 * Per-job match embeddings (design doc §9.4). Optional: with no API key configured, this is a
 * clean no-op — jobs keep `embedding: null` and the rest of the pipeline runs unchanged, so
 * fetch + normalize + dedupe are fully verifiable offline.
 */

import type { Job } from "@jobposted/shared";

const DEFAULT_MODEL = "text-embedding-3-small"; // 1536 dims
const OPENAI_BASE = "https://api.openai.com/v1";

/** Minimal shape needed to build a job's match-embedding text (full Job satisfies it). */
export type EmbeddableJob = {
  title: string | null;
  company: string | null;
  location: string | null;
  remote: string | null;
  descriptionMd: string | null;
};

/** Text used to embed a job: enough signal for match scoring without the full JD. */
export function jobEmbedText(job: EmbeddableJob): string {
  const desc = (job.descriptionMd ?? "").slice(0, 2000);
  return [job.title, job.company, job.location ?? "", job.remote, desc].filter(Boolean).join("\n");
}

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Embed a list of input strings, batched. Returns one entry per input — the embedding vector,
 * or `null` when no API key is set or that batch failed (so callers can skip cleanly).
 */
export async function embedInputs(texts: string[]): Promise<Array<number[] | null>> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
  const out: Array<number[] | null> = new Array(texts.length).fill(null);
  if (!apiKey || texts.length === 0) {
    if (!apiKey) console.info("[embed] no OPENAI_API_KEY — skipping embeddings");
    return out;
  }

  const batchSize = 96;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const res = await fetch(`${OPENAI_BASE}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: batch }),
      });
      if (!res.ok) {
        console.error(`[embed] HTTP ${res.status} — leaving this batch unembedded`);
        continue;
      }
      const json = (await res.json()) as EmbeddingResponse;
      for (const { index, embedding } of json.data) {
        out[i + index] = embedding;
      }
    } catch (err) {
      console.error("[embed] request failed — leaving this batch unembedded", err);
    }
  }
  return out;
}

/**
 * Attach embeddings to jobs in place. Returns the same jobs with `embedding` filled when a key
 * is present; otherwise returns them untouched.
 */
export async function embedJobs(jobs: Job[]): Promise<Job[]> {
  if (jobs.length === 0) return jobs;
  const vectors = await embedInputs(jobs.map(jobEmbedText));
  jobs.forEach((job, i) => {
    const vector = vectors[i];
    if (vector) job.embedding = vector;
  });
  return jobs;
}
