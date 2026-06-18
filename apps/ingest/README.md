# @jobposted/ingest

Phase 1 ingestion (design doc §9): pull jobs from public ATS feeds, normalize, dedupe, embed,
and upsert into `jobposted.jobs`. **Lever, Greenhouse, Ashby, SmartRecruiters, Workable, and
Teamtailor career-site feeds are public — no API key.**

```
src/
  sources/greenhouse.ts   Greenhouse Job Board API (§9.2)
  sources/lever.ts        Lever Postings API (§9.3)
  sources/ashby.ts        Ashby public Job Posting API (§9.3)
  sources/smartrecruiters.ts SmartRecruiters public Posting API
  sources/workable.ts     Workable public career-page endpoint
  sources/teamtailor.ts   Teamtailor public JSON feed
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
pnpm --filter @jobposted/ingest run fetch -- --source lever --company netflix
pnpm --filter @jobposted/ingest run fetch -- --source ashby --company ashby
pnpm --filter @jobposted/ingest run fetch -- --source greenhouse --board stripe --questions
pnpm --filter @jobposted/ingest run fetch -- --source smartrecruiters --company SmartRecruiters
pnpm --filter @jobposted/ingest run fetch -- --source workable --company epignosis
pnpm --filter @jobposted/ingest run fetch -- --source teamtailor --company unleash
pnpm --filter @jobposted/ingest run fetch -- --source greenhouse --board figma --limit 3 --json
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
rather than duplicates. Each seen job refreshes `last_seen_at`; jobs not seen for
`INGEST_CLOSE_AFTER_DAYS` days, default 30, are marked `closed_at` and excluded from matching.
The maintenance pass can also purge closed jobs after `INGEST_PURGE_CLOSED_AFTER_DAYS` days
when they are not referenced by applications or documents.

## Curated company registry

`INGEST_BOARDS_FILE` still accepts simple arrays:

```json
{
  "greenhouse": ["stripe"],
  "lever": ["ramp"],
  "ashby": ["linear"],
  "smartrecruiters": ["SmartRecruiters"],
  "workable": ["epignosis"],
  "teamtailor": ["unleash"]
}
```

For Indian and global target companies, prefer the `companies` registry. It keeps the real display
name/domain attached to jobs while still routing to the right public ATS connector:

```json
{
  "companies": [
    {
      "name": "Razorpay",
      "domain": "razorpay.com",
      "careersUrl": "https://razorpay.com/jobs/",
      "countryFocus": ["IN"],
      "priority": "high",
      "ats": [{ "type": "greenhouse", "slug": "razorpay" }]
    }
  ]
}
```

## Scheduling

`run.ts` exports `cronHandler()` (a web-standard `() => Promise<Response>`). Wire it either way:

- **Vercel Cron** — call `POST /api/ingest/cron` in `apps/web`, protected by
  `INGEST_CRON_SECRET` or `WORKER_CRON_SECRET`, and schedule it in `vercel.json` / `vercel.ts`
  (design doc §9.4, Vercel Cron for light jobs).
- **Standalone worker** — run `pnpm --filter @jobposted/ingest run` on a Fly/Railway schedule for
  heavier polling. The standalone command also runs the same bounded embedding, company-logo, and
  stale-job maintenance pass as the web cron.

## Adding sources

Additional fetchers follow the same shape: return `RawJob[]`, let `normalizeJob` + `dedupeJobs`
do the rest (design doc §9.1). For paid aggregators such as JSearch, keep them as optional gap
fillers rather than the primary source.
