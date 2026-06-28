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
import { fetchSmartRecruitersCompany } from "./sources/smartrecruiters";
import { fetchTeamtailorCompany } from "./sources/teamtailor";
import { fetchWorkableAccount } from "./sources/workable";
import { embedJobs } from "./embed";
import { upsertJobs } from "./upsert";
import { runBackfill, type BackfillSummary } from "./backfill";
import {
  runCompanyAssetBackfill,
  type CompanyAssetBackfillSummary,
} from "./company-assets-backfill";
import { enrichRawJobsWithCompanyAssets } from "./company-assets";
import { purgeOldUnreferencedJobs, type JobRetentionSummary } from "./job-retention";
import { countBoards, loadBoardConfig, shardBoardConfig, targetsFor, type BoardConfig } from "./config";
import { mapLimit } from "./util";

export { countBoards, loadBoardConfig } from "./config";

export interface IngestSummary {
  boards: number;
  fetched: number;
  deduped: number;
  embedded: number;
  upserted: number;
  skippedWrite: boolean;
}

export interface IngestMaintenanceSummary {
  backfill: BackfillSummary | null;
  companyAssets: CompanyAssetBackfillSummary | null;
  jobRetention: JobRetentionSummary | null;
}

export async function runIngest(
  config: BoardConfig,
  opts: { withQuestions?: boolean } = {},
): Promise<IngestSummary> {
  const raw: RawJob[] = [];

  await mapLimit(targetsFor(config, "greenhouse"), 3, async (target) => {
    try {
      const jobs = await fetchGreenhouseBoard(target.slug, {
        withQuestions: opts.withQuestions,
        questionsLimit: 25,
        companyName: target.companyName,
        companyDomain: target.companyDomain,
      });
      raw.push(...jobs);
      console.info(`[greenhouse] ${target.slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[greenhouse] ${target.slug} failed:`, (err as Error).message);
    }
  });

  await mapLimit(targetsFor(config, "lever"), 3, async (target) => {
    try {
      const jobs = await fetchLeverCompany(target.slug, {
        companyName: target.companyName,
        companyDomain: target.companyDomain,
      });
      raw.push(...jobs);
      console.info(`[lever] ${target.slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[lever] ${target.slug} failed:`, (err as Error).message);
    }
  });

  await mapLimit(targetsFor(config, "ashby"), 3, async (target) => {
    try {
      const jobs = await fetchAshbyBoard(target.slug, {
        companyName: target.companyName,
        companyDomain: target.companyDomain,
      });
      raw.push(...jobs);
      console.info(`[ashby] ${target.slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[ashby] ${target.slug} failed:`, (err as Error).message);
    }
  });

  await mapLimit(targetsFor(config, "smartrecruiters"), 3, async (target) => {
    try {
      const jobs = await fetchSmartRecruitersCompany(target.slug, {
        companyName: target.companyName,
        companyDomain: target.companyDomain,
      });
      raw.push(...jobs);
      console.info(`[smartrecruiters] ${target.slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[smartrecruiters] ${target.slug} failed:`, (err as Error).message);
    }
  });

  await mapLimit(targetsFor(config, "workable"), 3, async (target) => {
    try {
      const jobs = await fetchWorkableAccount(target.slug, {
        companyName: target.companyName,
        companyDomain: target.companyDomain,
      });
      raw.push(...jobs);
      console.info(`[workable] ${target.slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[workable] ${target.slug} failed:`, (err as Error).message);
    }
  });

  await mapLimit(targetsFor(config, "teamtailor"), 3, async (target) => {
    try {
      const jobs = await fetchTeamtailorCompany(target.slug, {
        companyName: target.companyName,
        companyDomain: target.companyDomain,
      });
      raw.push(...jobs);
      console.info(`[teamtailor] ${target.slug}: ${jobs.length} jobs`);
    } catch (err) {
      console.error(`[teamtailor] ${target.slug} failed:`, (err as Error).message);
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

export async function runIngestMaintenance(): Promise<IngestMaintenanceSummary> {
  // Self-heal: chip away at any jobs still missing an embedding (e.g. ingested before embeddings
  // were enabled, or whose batch failed). Bounded per run; set INGEST_BACKFILL_LIMIT=0 to disable.
  const backfillLimit = Number(process.env.INGEST_BACKFILL_LIMIT ?? 200);
  let backfill: BackfillSummary | null = null;
  let companyAssets: CompanyAssetBackfillSummary | null = null;
  let jobRetention: JobRetentionSummary | null = null;
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

  const jobRetentionDays = Number(process.env.INGEST_PURGE_CLOSED_AFTER_DAYS ?? 30);
  const jobRetentionLimit = Number(process.env.INGEST_PURGE_CLOSED_LIMIT ?? 1000);
  if (Number.isFinite(jobRetentionDays) && jobRetentionDays >= 0) {
    try {
      jobRetention = await purgeOldUnreferencedJobs({
        retentionDays: jobRetentionDays,
        limit: Number.isFinite(jobRetentionLimit) ? jobRetentionLimit : 1000,
      });
    } catch (err) {
      console.error("[ingest] job retention failed:", (err as Error).message);
    }
  }

  return { backfill, companyAssets, jobRetention };
}

/**
 * Pick the shard to run this invocation. With INGEST_SHARD_COUNT > 1 the board list is split into
 * shards and the current 4-hourly cron slot (UTC hour / 4) selects one, so a large list is covered
 * across the day without any single run exceeding the function's time limit.
 */
function shardForThisRun(config: BoardConfig): { config: BoardConfig; shard?: { index: number; count: number } } {
  const shardCount = Number(process.env.INGEST_SHARD_COUNT ?? 1);
  if (!Number.isFinite(shardCount) || shardCount <= 1) return { config };
  const count = Math.trunc(shardCount);
  const slot = Math.floor(new Date().getUTCHours() / 4);
  const index = ((slot % count) + count) % count;
  return { config: shardBoardConfig(config, count, index), shard: { index, count } };
}

/** Web-standard handler for wiring into Vercel Cron (returns the run summary as JSON). */
export async function cronHandler(): Promise<Response> {
  const config = await loadBoardConfig();
  if (countBoards(config) === 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "no_boards_configured",
        message: "Set INGEST_BOARDS_JSON or INGEST_BOARDS_FILE before running ingest.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  const { config: runConfig, shard } = shardForThisRun(config);
  const summary = await runIngest(runConfig, { withQuestions: process.env.INGEST_QUESTIONS === "1" });
  const maintenance = await runIngestMaintenance();

  return new Response(JSON.stringify({ ok: true, shard, ...summary, ...maintenance }), {
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
  const maintenance = await runIngestMaintenance();
  console.info("[ingest] done:", { ...summary, ...maintenance });
}

// Run main() only when executed directly (not when imported, e.g. by the cron route).
if (argv[1] && import.meta.url === `file://${argv[1]}`) {
  void main();
}
