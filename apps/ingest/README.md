# @jobposted/ingest

Phase 1 ingestion (design doc §9): pull jobs from public ATS feeds, normalize, dedupe, embed,
and upsert into `jobposted.jobs`. **Lever and Greenhouse feeds are public — no API key.**

```
src/
  sources/greenhouse.ts   Greenhouse Job Board API (§9.2)
  sources/lever.ts        Lever Postings API (§9.3)
  embed.ts                1536-dim embeddings (optional; no-ops without a key)
  upsert.ts               service-role upsert into jobposted.jobs (no-ops without env)
  run.ts                  scheduler: fetch → normalize → dedupe → embed → upsert
  cli.ts                  live verification CLI (no secrets needed)
  config.ts / util.ts     board config + HTTP backoff / concurrency helpers
```

Normalization (`htmlToMarkdown`, location/salary/remote) and cross-source dedup
(`dedupeJobs`, prefer most-direct apply_url) live in [`@jobposted/shared`](../../packages/shared)
so the web app and worker reuse the exact same logic.

## Verify it live (no secrets)

```bash
pnpm --filter @jobposted/ingest fetch -- --source lever --company netflix
pnpm --filter @jobposted/ingest fetch -- --source greenhouse --board stripe --questions
pnpm --filter @jobposted/ingest fetch -- --source greenhouse --board figma --limit 3 --json
```

Prints how many raw jobs were fetched, how many remained after dedupe, and a sample of the
normalized `Job` objects (title, company, location, remote, salary, apply-URL directness,
description length, captured questions).

## Run the full pipeline (writes to Supabase)

Set env (see `.env.example`) and point `INGEST_BOARDS_FILE` at a board list shaped like
[`packages/db/seed/board_tokens.example.json`](../../packages/db/seed/board_tokens.example.json):

```bash
export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
export INGEST_BOARDS_FILE=./boards.json
pnpm --filter @jobposted/ingest run
```

Upserts are idempotent (conflict on `unique (source, source_job_id)`), so re-running refreshes
rather than duplicates.

## Scheduling

`run.ts` exports `cronHandler()` (a web-standard `() => Promise<Response>`). Wire it either way:

- **Vercel Cron** — add a route in `apps/web` (e.g. `app/api/cron/ingest/route.ts`) that calls
  `cronHandler()`, and schedule it in `vercel.json` / `vercel.ts` (design doc §9.4 — Vercel Cron
  for light jobs). Protect it with a `CRON_SECRET` check.
- **Standalone worker** — run `pnpm --filter @jobposted/ingest run` on a Fly/Railway schedule for
  heavier polling.

## Adding sources

Once the Lever/Greenhouse pattern is in place, additional fetchers (Ashby, SmartRecruiters,
Workable, Adzuna, JSearch) follow the same shape: return `RawJob[]`, let `normalizeJob` +
`dedupeJobs` do the rest (design doc §9.1).
