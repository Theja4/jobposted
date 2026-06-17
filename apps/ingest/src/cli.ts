/**
 * Live verification CLI (no secrets needed): fetch a real public board, normalize, dedupe, and
 * print the result.
 *
 *   pnpm --filter @jobposted/ingest run fetch -- --source lever --company netflix
 *   pnpm --filter @jobposted/ingest run fetch -- --source ashby --company ashby
 *   pnpm --filter @jobposted/ingest run fetch -- --source greenhouse --board stripe --questions
 *   pnpm --filter @jobposted/ingest run fetch -- --source greenhouse --board figma --limit 3 --json
 */

import { argv } from "node:process";
import { applyUrlDirectness, dedupeJobs, normalizeJob, type Job, type RawJob } from "@jobposted/shared";
import { fetchAshbyBoard } from "./sources/ashby";
import { fetchGreenhouseBoard } from "./sources/greenhouse";
import { fetchLeverCompany } from "./sources/lever";
import { enrichRawJobsWithCompanyAssets } from "./company-assets";

interface Args {
  source?: string;
  company?: string;
  board?: string;
  questions: boolean;
  limit: number;
  json: boolean;
}

function parseArgs(raw: string[]): Args {
  const args: Args = { questions: false, limit: 5, json: false };
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    switch (a) {
      case "--source":
        args.source = raw[++i];
        break;
      case "--company":
        args.company = raw[++i];
        break;
      case "--board":
        args.board = raw[++i];
        break;
      case "--questions":
        args.questions = true;
        break;
      case "--limit":
        args.limit = Number(raw[++i]) || 5;
        break;
      case "--json":
        args.json = true;
        break;
    }
  }
  return args;
}

function summarize(job: Job): string {
  const directness = applyUrlDirectness(job);
  const salary =
    job.salaryMin || job.salaryMax
      ? `  $${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"} ${job.salaryCurrency ?? ""}`
      : "";
  return [
    `• ${job.title}  —  ${job.company}`,
    `    ${job.location ?? "no location"} · ${job.remote} · ${job.formQuestions.length} question(s)` +
      `${salary}`,
    `    apply: ${job.applyUrl}  (directness ${directness})`,
    `    logo: ${job.companyLogoUrl ?? "none"}  domain: ${job.companyDomain ?? "unknown"}`,
    `    desc: ${job.descriptionMd ? `${job.descriptionMd.length} chars md` : "none"}`,
  ].join("\n");
}

async function main() {
  const args = parseArgs(argv.slice(2));

  let raw: RawJob[];
  if (args.source === "lever") {
    if (!args.company) return fail("--company <slug> is required for --source lever");
    console.info(`Fetching Lever postings for "${args.company}"…`);
    raw = await fetchLeverCompany(args.company);
  } else if (args.source === "ashby") {
    if (!args.company) return fail("--company <organization> is required for --source ashby");
    console.info(`Fetching Ashby board "${args.company}"…`);
    raw = await fetchAshbyBoard(args.company);
  } else if (args.source === "greenhouse") {
    if (!args.board) return fail("--board <token> is required for --source greenhouse");
    console.info(`Fetching Greenhouse board "${args.board}"…`);
    raw = await fetchGreenhouseBoard(args.board, {
      withQuestions: args.questions,
      questionsLimit: args.limit,
    });
  } else {
    return fail("Usage: --source <lever|ashby|greenhouse> --company <slug> | --board <token>");
  }

  const enrichedRaw = await enrichRawJobsWithCompanyAssets(raw);
  const normalized = enrichedRaw.map(normalizeJob);
  const deduped = dedupeJobs(normalized);

  console.info("\n──────── ingest result ────────");
  console.info(`fetched (raw):   ${raw.length}`);
  console.info(`normalized:      ${normalized.length}`);
  console.info(`after dedupe:    ${deduped.length}  (collapsed ${normalized.length - deduped.length})`);
  console.info(`with questions:  ${deduped.filter((j) => j.formQuestions.length > 0).length}`);
  console.info(`with salary:     ${deduped.filter((j) => j.salaryMin || j.salaryMax).length}`);
  console.info("───────────────────────────────\n");

  const shown = deduped.slice(0, args.limit);
  if (args.json) {
    console.info(JSON.stringify(shown, null, 2));
  } else {
    console.info(`First ${shown.length} normalized jobs:\n`);
    for (const job of shown) console.info(summarize(job) + "\n");
  }
}

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

void main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
