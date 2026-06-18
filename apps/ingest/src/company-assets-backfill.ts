import { createClient } from "@supabase/supabase-js";
import { resolveCompanyAssetsFromJobUrl } from "@jobposted/shared";
import { mapLimit } from "./util";

type JobLogoBackfillRow = {
  id: string;
  source: string | null;
  company: string | null;
  apply_url: string | null;
  company_domain: string | null;
  company_logo_url: string | null;
};

export interface CompanyAssetBackfillSummary {
  skipped: boolean;
  scanned: number;
  updated: number;
}

function concurrency() {
  const parsed = Number(process.env.INGEST_LOGO_CONCURRENCY ?? 4);
  if (!Number.isFinite(parsed) || parsed < 1) return 4;
  return Math.min(12, Math.trunc(parsed));
}

function logoDevConfigured() {
  return Boolean(
    process.env.LOGO_DEV_PUBLISHABLE_KEY ||
      process.env.LOGO_DEV_TOKEN ||
      process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY,
  );
}

export async function runCompanyAssetBackfill(
  opts: { limit?: number } = {},
): Promise<CompanyAssetBackfillSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.info("[logo-backfill] no Supabase env - skipping DB write");
    return { skipped: true, scanned: 0, updated: 0 };
  }

  const limit = Math.max(0, Math.min(1000, Math.trunc(opts.limit ?? 100)));
  if (limit === 0) return { skipped: false, scanned: 0, updated: 0 };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "jobposted" },
  });

  let query = supabase
    .from("jobs")
    .select("id,source,company,apply_url,company_domain,company_logo_url")
    .not("apply_url", "is", null)
    .neq("source", "manual")
    .is("company_logo_url", null);

  if (!logoDevConfigured()) query = query.is("company_logo_resolved_at", null);

  const { data, error } = await query.limit(limit);

  if (error) throw new Error(`[logo-backfill] ${error.message}`);

  const rows = Array.isArray(data) ? (data as JobLogoBackfillRow[]) : [];
  let updated = 0;
  const timeoutMs = Number(process.env.INGEST_LOGO_TIMEOUT_MS ?? 3500);

  await mapLimit(rows, concurrency(), async (row) => {
    if (row.source === "manual") return;
    const assets = await resolveCompanyAssetsFromJobUrl(
      {
        applyUrl: row.apply_url,
        companyName: row.source === "extension" ? null : row.company,
      },
      { timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 3500 },
    );
    const patch: Record<string, unknown> = {
      company_logo_resolved_at: assets.companyLogoResolvedAt ?? new Date().toISOString(),
    };
    if (!row.company_domain && assets.companyDomain) patch.company_domain = assets.companyDomain;
    if (!row.company_logo_url && assets.companyLogoUrl) patch.company_logo_url = assets.companyLogoUrl;

    const { error: updateError } = await supabase.from("jobs").update(patch).eq("id", row.id);
    if (updateError) throw new Error(`[logo-backfill] ${updateError.message}`);

    if (row.company && assets.companyLogoUrl) {
      const propagationPatch: Record<string, unknown> = {
        company_logo_url: assets.companyLogoUrl,
        company_logo_resolved_at: patch.company_logo_resolved_at,
      };
      if (assets.companyDomain) propagationPatch.company_domain = assets.companyDomain;
      const { error: propagationError } = await supabase
        .from("jobs")
        .update(propagationPatch)
        .eq("company", row.company)
        .neq("source", "manual")
        .is("company_logo_url", null);
      if (propagationError) throw new Error(`[logo-backfill-propagate] ${propagationError.message}`);
    }

    if (patch.company_domain || patch.company_logo_url) updated += 1;
  });

  return { skipped: false, scanned: rows.length, updated };
}
