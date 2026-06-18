import { createClient } from "@supabase/supabase-js";

export interface JobRetentionSummary {
  skipped: boolean;
  cutoff: string | null;
  deleted: number;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  });
}

function clampInt(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export async function purgeOldUnreferencedJobs(
  opts: { retentionDays?: number; limit?: number } = {},
): Promise<JobRetentionSummary> {
  const client = serviceClient();
  if (!client) {
    console.info("[job-retention] no Supabase env - skipping DB cleanup");
    return { skipped: true, cutoff: null, deleted: 0 };
  }

  const retentionDays = clampInt(opts.retentionDays ?? 30, 30, 0, 365);
  const limit = clampInt(opts.limit ?? 1000, 1000, 0, 10_000);
  if (limit === 0) return { skipped: false, cutoff: null, deleted: 0 };

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const { data, error } = await client.rpc("purge_old_unreferenced_jobs", {
    p_closed_before: cutoff,
    p_limit: limit,
  });

  if (error) throw new Error(`[job-retention] ${error.message}`);

  const row = Array.isArray(data) ? (data[0] as { deleted_count?: unknown } | undefined) : null;
  const deleted = typeof row?.deleted_count === "number" ? row.deleted_count : 0;
  return { skipped: false, cutoff, deleted };
}
