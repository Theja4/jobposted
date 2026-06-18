/** Small shared helpers for the ingestion fetchers. */

const USER_AGENT = "JobPostedBot/0.1 (+https://jobposted.example)";

/** Title-case a board/company slug for display, e.g. "acme-robotics" → "Acme Robotics". */
export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface CompanyHints {
  companyName?: string | null;
  companyDomain?: string | null;
}

/** Prefer curated registry metadata, falling back to the ATS slug when none is provided. */
export function companyNameFromSlug(slug: string, hints: CompanyHints = {}): string {
  return hints.companyName?.trim() || humanizeSlug(slug);
}

export function companyDomainFromHints(hints: CompanyHints = {}): string | null {
  return hints.companyDomain?.trim() || null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON with exponential backoff (design doc §9.4 — retry with backoff, don't hammer the
 * source). Retries on network errors and 429/5xx; gives up on other 4xx.
 */
export async function fetchJson<T>(
  url: string,
  { retries = 3, timeoutMs = 15000 }: { retries?: number; timeoutMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Timed out fetching ${url} after ${timeoutMs}ms`));
    }, timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
      if (res.ok) return (await res.json()) as T;
      // Retry transient statuses; fail fast on other client errors.
      if (res.status !== 429 && res.status < 500) throw new HttpError(res.status, url);
      lastErr = new HttpError(res.status, url);
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(2 ** attempt * 500 + Math.random() * 250);
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to fetch ${url}`);
}

/** Run async tasks with a bounded concurrency (so we don't hammer an ATS). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}
