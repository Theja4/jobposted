/**
 * One-shot embedding backfill runner. Needs NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY in the environment.
 *
 *   pnpm --filter @jobposted/ingest backfill                  # jobs + resumes
 *   pnpm --filter @jobposted/ingest backfill -- --jobs --limit 1000
 *   pnpm --filter @jobposted/ingest backfill -- --logos --limit 1000
 *   pnpm --filter @jobposted/ingest backfill -- --resumes
 */

import { argv } from "node:process";
import { runBackfill } from "./backfill";
import { runCompanyAssetBackfill } from "./company-assets-backfill";

function parseArgs(raw: string[]) {
  let jobs = false;
  let logos = false;
  let resumes = false;
  let limit: number | undefined;
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--jobs") jobs = true;
    else if (arg === "--logos") logos = true;
    else if (arg === "--resumes") resumes = true;
    else if (arg === "--limit") limit = Number(raw[++i]) || undefined;
  }
  // No target flag → backfill both.
  if (!jobs && !resumes && !logos) return { jobs: true, logos: false, resumes: true, limit };
  return { jobs, logos, resumes, limit };
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  const [embeddings, companyAssets] = await Promise.all([
    opts.jobs || opts.resumes ? runBackfill(opts) : Promise.resolve(null),
    opts.logos ? runCompanyAssetBackfill({ limit: opts.limit }) : Promise.resolve(null),
  ]);
  console.info("[backfill] done:", { embeddings, companyAssets });
}

void main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
