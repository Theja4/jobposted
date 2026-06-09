/**
 * Apify actor runner (design doc §9.1) — the prescribed path for bot-protected boards that
 * block datacenter IPs (Wellfound behind Cloudflare+DataDome, etc.). Runs an actor synchronously
 * and returns its dataset items. No-op (empty) when APIFY_TOKEN is unset.
 */
export async function runApifyActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return [];
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actorId,
  )}/run-sync-get-dataset-items?token=${token}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input ?? {}),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.error(`[apify] actor ${actorId} HTTP ${res.status}`);
      return [];
    }
    return (await res.json()) as T[];
  } catch (err) {
    console.error(`[apify] actor ${actorId} failed:`, (err as Error).message);
    return [];
  }
}

/** Read common job fields from an arbitrary Apify item (actors vary in their output shape). */
export function pick(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
