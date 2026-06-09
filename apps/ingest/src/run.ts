/**
 * Ingestion scheduler entrypoint (design doc §9.4): fetch → normalize → dedupe → embed →
 * upsert. Runnable two ways:
 *   • standalone:    INGEST_BOARDS_FILE=boards.json pnpm --filter @jobposted/ingest run
 *   • Vercel Cron:   import { cronHandler } from this module into an apps/web route handler
 *                    and schedule it (see README).
 */

import { argv } from "node:process";
import { dedupeJobs, normalizeJob, type Job, type RawJob } from "@jobposted/shared";
import { fetchGreenhouseBoard } from "./sources/greenhouse.js";
import { fetchLeverCompany } from "./sources/lever.js";
import { fetchAshbyBoard } from "./sources/ashby.js";
import { fetchWellfound } from "./sources/wellfound.js";
import { fetchRemoteFront } from "./sources/remotefront.js";
import { embedJobs } from "./embed.js";
import { upsertJobs } from "./upsert.js";
import { countBoards, loadBoardConfig, type BoardConfig } from "./config.js";
import { mapLimit } from "./util.js";

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

  // Bot-protected boards via Apify (no-op without APIFY_TOKEN + actor; design doc §9.1).
  if (config.wellfound?.length) {
    const jobs = await fetchWellfound(config.wellfound);
    raw.push(...jobs);
    if (jobs.length) console.info(`[wellfound] ${jobs.length} jobs`);
  }
  if (config.remotefront?.length) {
    const jobs = await fetchRemoteFront(config.remotefront);
    raw.push(...jobs);
    if (jobs.length) console.info(`[remotefront] ${jobs.length} jobs`);
  }

  const normalized: Job[] = raw.map(normalizeJob);
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
  return new Response(JSON.stringify(summary), {
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  const config = await loadBoardConfig();
  if (countBoards(config) === 0) {
    console.error(
      "No boards configured. Set INGEST_BOARDS_FILE to a board_tokens.json " +
        "(see packages/db/seed/board_tokens.example.json), or use the CLI:\n" +
        "  pnpm --filter @jobposted/ingest fetch -- --source lever --company netflix",
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
