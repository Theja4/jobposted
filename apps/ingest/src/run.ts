/**
 * Ingestion scheduler entrypoint (design doc §9.4): fetch → normalize → dedupe → embed →
 * upsert. Runnable two ways:
 *   • standalone:    INGEST_BOARDS_FILE=boards.json pnpm --filter @jobposted/ingest run
 *   • Vercel Cron:   import { cronHandler } from this module into an apps/web route handler
 *                    and schedule it (see README).
 */

import { argv } from "node:process";
import { dedupeJobs, normalizeJob, type Job, type RawJob } from "@jobposted/shared";
import { fetchAshbyBoard } from "./sources/ashby";
import { fetchGreenhouseBoard } from "./sources/greenhouse";
import { fetchLeverCompany } from "./sources/lever";
import { embedJobs } from "./embed";
import { upsertJobs } from "./upsert";
import { runBackfill, type BackfillSummary } from "./backfill";
import {
  runCompanyAssetBackfill,
  type CompanyAssetBackfillSummary,
} from "./company-assets-backfill";
import { enrichRawJobsWithCompanyAssets } from "./company-assets";
import { countBoards, loadBoardConfig, type BoardConfig } from "./config";
import { mapLimit } from "./util";

export interface IngestSummary {
  boards: number;
  fetched: number;
  deduped: number;
  embedded: number;
  upserted: number;
  skippedWrite: boolean;
}

export async function runIngest(
  config: BoardConfig,
  opts: { withQuestions?: boolean } = {},
): Promise<IngestSummary> {
  const raw: RawJob[] = [];

  await mapLimit(config.greenhouse, 3, async (token) => {
    try {
      const jobs = await fetchGreenhouseBoard(token, {
        withQuestions: opts.withQuestions,
        questionsLimit: 25,
      });
      raw.push(...jobs);
      console.info(`[greenhouse] ${token}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[greenhouse] ${token} failed:`, (err as Error).message);
    }
  });

  await mapLimit(config.lever, 3, async (slug) => {
    try {
      const jobs = await fetchLeverCompany(slug);
      raw.push(...jobs);
      console.info(`[lever] ${slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[lever] ${slug} failed:`, (err as Error).message);
    }
  });

  await mapLimit(config.ashby, 3, async (org) => {
    try {
      const jobs = await fetchAshbyBoard(org);
      raw.push(...jobs);
      console.info(`[ashby] ${org}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[ashby] ${org} failed:`, (err as Error).message);
    }
  });

  const enrichedRaw = await enrichRawJobsWithCompanyAssets(raw);
  const normalized: Job[] = enrichedRaw.map(normalizeJob);
  const deduped = dedupeJobs(normalized);
  const embedded = await embedJobs(deduped);
  const embeddedCount = embedded.filter((j) => j.embedding != null).length;
  const { upserted, skipped } = await upsertJobs(embedded);

  return {
    boards: countBoards(config),
    fetched: normalized.length,
    deduped: deduped.length,
    embedded: embeddedCount,
    upserted,
    skippedWrite: skipped,
  };
}

/** Web-standard handler for wiring into Vercel Cron (returns the run summary as JSON). */
export async function cronHandler(): Promise<Response> {
  const config = await loadBoardConfig();
  const summary = await runIngest(config, { withQuestions: process.env.INGEST_QUESTIONS === "1" });

  // Self-heal: chip away at any jobs still missing an embedding (e.g. ingested before embeddings
  // were enabled, or whose batch failed). Bounded per run; set INGEST_BACKFILL_LIMIT=0 to disable.
  const backfillLimit = Number(process.env.INGEST_BACKFILL_LIMIT ?? 200);
  let backfill: BackfillSummary | null = null;
  let companyAssets: CompanyAssetBackfillSummary | null = null;
  if (Number.isFinite(backfillLimit) && backfillLimit > 0) {
    try {
      backfill = await runBackfill({ jobs: true, resumes: false, limit: backfillLimit });
    } catch (err) {
      console.error("[ingest] embedding backfill failed:", (err as Error).message);
    }
  }

  const logoBackfillLimit = Number(process.env.INGEST_LOGO_BACKFILL_LIMIT ?? 100);
  if (Number.isFinite(logoBackfillLimit) && logoBackfillLimit > 0) {
    try {
      companyAssets = await runCompanyAssetBackfill({ limit: logoBackfillLimit });
    } catch (err) {
      console.error("[ingest] company logo backfill failed:", (err as Error).message);
    }
  }

  return new Response(JSON.stringify({ ...summary, backfill, companyAssets }), {
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  const config = await loadBoardConfig();
  if (countBoards(config) === 0) {
    console.error(
      "No boards configured. Set INGEST_BOARDS_FILE to a board_tokens.json " +
        "(see packages/db/seed/board_tokens.example.json), or use the CLI:\n" +
        "  pnpm --filter @jobposted/ingest run fetch -- --source lever --company netflix",
    );
    process.exit(1);
  }
  const summary = await runIngest(config, { withQuestions: process.env.INGEST_QUESTIONS === "1" });
  console.info("[ingest] done:", summary);
}

// Run main() only when executed directly (not when imported, e.g. by the cron route).
if (argv[1] && import.meta.url === `file://${argv[1]}`) {
  void main();
}
