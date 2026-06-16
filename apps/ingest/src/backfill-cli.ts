/**
 * One-shot embedding backfill runner. Needs NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY in the environment.
 *
 *   pnpm --filter @jobposted/ingest backfill                  # jobs + resumes
 *   pnpm --filter @jobposted/ingest backfill -- --jobs --limit 1000
 *   pnpm --filter @jobposted/ingest backfill -- --resumes
 */

import { argv } from "node:process";
import { runBackfill } from "./backfill";

function parseArgs(raw: string[]) {
  let jobs = false;
  let resumes = false;
  let limit: number | undefined;
  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === "--jobs") jobs = true;
    else if (arg === "--resumes") resumes = true;
    else if (arg === "--limit") limit = Number(raw[++i]) || undefined;
  }
  // No target flag → backfill both.
  if (!jobs && !resumes) return { jobs: true, resumes: true, limit };
  return { jobs, resumes, limit };
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  const summary = await runBackfill(opts);
  console.info("[backfill] done:", summary);
}

void main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
