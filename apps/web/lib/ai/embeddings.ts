import { resumeEmbeddingText, type ResumeContent } from "@jobposted/shared";

const DEFAULT_MODEL = "text-embedding-3-small";
const OPENAI_BASE = "https://api.openai.com/v1";
const DIMENSIONS = 1536;

// Re-exported so existing imports from this module keep working; the builder itself is shared
// with the ingest backfill via @jobposted/shared.
export { resumeEmbeddingText };
export type { ResumeContent };

export function embeddingConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function vectorToSql(value: number[] | null) {
  return value && value.length === DIMENSIONS ? JSON.stringify(value) : null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const input = text.trim();
  if (!apiKey || !input) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("Embedding request timed out after 20000ms."));
  }, 20_000);
  try {
    const res = await fetch(`${OPENAI_BASE}/embeddings`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL || DEFAULT_MODEL,
        input,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = json.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length === DIMENSIONS ? embedding : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function embedResumeContent(resume: Partial<ResumeContent> | Record<string, unknown>) {
  const text = resumeEmbeddingText(resume);
  return embedText(text);
}
