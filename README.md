# JobPosted

JobPosted is an AI job-application copilot: it finds relevant roles, tailors a resume for each
role, tracks every application, and keeps login-gated applications inside the user's own browser
through the Chrome extension. Standalone product, integrates with
[Rezoomed](https://rezoomed.com) through shared Supabase infrastructure and resume parsing logic.

The product supports two intended operating modes:

- **Fully automatic** — JobPosted finds matched open-ATS roles and queues the daily batch for the
  worker. Once the apply runner is enabled, that worker can submit without per-job user clicks.
- **Review queue** — JobPosted prepares the jobs it found for the day, then the user reviews the
  batch and releases approved jobs to the worker with one action.

Important current-state note: the web UI, mode selection, tracker, resume parsing, tailoring, job
board, extension sync, daily matching, server-owned queue creation, queue rendering, retention
cleanup, and the Railway Playwright apply runner are implemented. The runner is dry-run by
default and should only be allowed to submit live after adapter validation passes against real
target forms.

> Automatic, but never spray-and-pray. Manual tracker entries and extension-captured applications
> are tracked separately from JobPosted worker sends. LinkedIn, Workday, and other login-gated
> platforms never run from JobPosted servers; they run in the user's own Chrome session via the
> extension.

## Monorepo layout

```
apps/
  web/        Next.js 16 portal + marketing landing + tailoring engine (Vercel)
  ingest/     Lever + Greenhouse + Ashby job fetchers → normalized rows in Supabase
  worker/     Railway cron bridge + Playwright apply engine for open ATS
  extension/  Manifest V3 Chrome extension — autofill + apply on login-gated boards
packages/
  shared/     @jobposted/shared — cross-app TS types (incl. resume + tailoring) + helpers
  db/         @jobposted/db — Supabase SQL migrations (schema `jobposted`)
```

## Status

- ✅ Monorepo skeleton (pnpm workspaces + Turborepo)
- ✅ `packages/shared` — types + normalization/dedup, resume + tailoring contracts
- ✅ `packages/db` — schema, RLS, storage, indexes, extension tables (`jobposted` schema)
- ✅ `apps/web` — marketing site, Supabase auth (incl. Google ID-token), and the dashboard:
  overview, setup/onboarding, today's queue, job board (fuzzy search), JobPosted-only
  application history, account, and a DB-backed job tracker
- ✅ `apps/web` — operating mode selection for **Fully automatic** and **Review queue**. The
  UI stores the selected mode and the queue is filtered so manual/extension rows are not counted
  as JobPosted worker applications
- ✅ `apps/web` — **resume tailoring** implemented natively in `lib/tailor` (AI Gateway),
  exposed at `POST /api/tailor`; stores per-job tailored resumes in `documents`
- ✅ `apps/extension` — MV3 autofill engine (Workday + open-ATS + generic adapters), AI-Gateway
  field mapping with a learning cache, web↔extension session bridge, local-first localhost
  builds, durable application-sync retry queue, and popup visibility for pending syncs
- ✅ `apps/ingest` — Lever + Greenhouse + Ashby fetchers, dedupe, embed (key-optional),
  upsert, CLI
- ✅ `apps/web` — daily matcher + queue preparer: scores ingested jobs against onboarding
  preferences/resume signals, dedupes against all existing applications, and creates
  JobPosted-owned `applications` rows with `apply_path = "server"`
- ✅ `apps/web` — Review queue release: one action moves today's approved rows into `queued`
  status without mislabeling them as submitted
- ✅ `apps/web` — protected ingest cron route at `POST /api/ingest/cron`
- ✅ `apps/web` — production health endpoint at `GET /api/health`, plus timeout-capped
  extension field mapping
- ✅ `apps/worker` — Railway worker is wired (`/health`, protected `/cron/run`,
  `/runner/run`, `/runner/validate`, `/cron/cleanup`) with Playwright open-ATS runner,
  screenshot capture, retry/failure transitions, retention cleanup, and live selector
  validation tooling. It is **dry-run by default**; live submit requires `APPLY_DRY_RUN=0`
  after real-form validation.
- ✅ Deploy scaffolding — worker Dockerfile, Railway config, Vercel ingest cron config, and
  production runbook in `deploy/production.md`
- ⏳ Payments (Phase 4) and broader server-side apply support beyond the open-ATS worker are
  not yet built

## Built vs. pending apply flow

Built today:

1. User completes Setup and uploads a resume.
2. Resume is parsed into structured profile data and saved as a base resume version.
3. Jobs can be ingested from public Lever, Greenhouse, and Ashby boards.
4. The job board can search/filter/sort jobs and tailor a resume for a selected role.
5. A role can be added to the tracker manually or from the job board.
6. The Chrome extension can fill supported ATS forms in the user's browser and sync the result
   back into the tracker.
7. The queue and application history intentionally show only `apply_path = "server"` rows, so
   manual and extension-captured jobs are not misrepresented as JobPosted worker sends.
8. `POST /api/queue/prepare` creates the daily worker-owned batch from ingested jobs and skips
   any job the user already has in `applications`, regardless of manual, job-board, extension,
   or server source.
9. In **Review queue** mode, the Queue page can release today's prepared applications to
   `queued` with one action.
10. Railway can call `/cron/run`, which prepares, renders, applies via the worker runner, and
   prunes old transient documents using `WORKER_CRON_SECRET`.
11. The worker supports Greenhouse, Lever, and Ashby as server-safe open ATS adapters, and routes
   many common login-gated/fragile ATS providers to review-only instead of submitting headlessly.

Pending before the full apply promise is production-ready:

1. Validate live selectors for the first production company set with
   `pnpm --filter @jobposted/worker run validate:ats`.
2. Keep `APPLY_DRY_RUN=1` until screenshots prove the forms are filled correctly.
3. Add more server-safe ATS adapters only after live validation; unknown or fragile ATS flows
   should stay review-only or extension-only.
4. Payments/subscription limits are still the remaining major production gate.

## Prerequisites

- Node ≥ 20 (`.nvmrc` pins 20) — works on 24
- pnpm ≥ 11 (`corepack enable` if you don't have it)

## Quick start

```bash
pnpm install

# Marketing site (no secrets required to render the landing page)
pnpm --filter @jobposted/web dev          # http://localhost:3000

# Ingest a real public board (no auth needed) and print normalized jobs
pnpm --filter @jobposted/ingest run fetch -- --source lever --company netflix
pnpm --filter @jobposted/ingest run fetch -- --source greenhouse --board stripe
pnpm --filter @jobposted/ingest run fetch -- --source ashby --company ashby

pnpm -r typecheck
```

## Environment

See [`.env.example`](./.env.example). Each var is tagged with the phase it's first needed.
Phase 0/1 only strictly needs `NEXT_PUBLIC_SITE_URL`, the Supabase trio, and (optionally) an
embedding key. Copy into `apps/web/.env.local` / `apps/ingest/.env` as needed.

## Integration with Rezoomed

- **Supabase** — shares the Rezoomed project. JobPosted tables live in a dedicated
  `jobposted` Postgres schema to avoid colliding with Rezoomed's `public.profiles` /
  `public.jobs` / `public.referrals`. See [`packages/db/README.md`](./packages/db/README.md).
- **Tailoring** — implemented **natively in JobPosted** (`apps/web/lib/tailor`, via the Vercel
  AI Gateway), adapted from Rezoomed's tailoring approach rather than calling a Rezoomed API.
- **Payments** — uses Creem-hosted checkout links, Creem webhooks, and the Creem customer portal.
- **Extension** — built on the WXT/MV3 pattern from Rezoomed's LinkedIn extension.

## Build order

Phase 0 foundations → Phase 1 ingestion → Phase 2 portal → apply path → Phase 4 payments →
Phase 6 beta + launch. The product now supports queue preparation and user-controlled review
before anything is submitted. The extension path works for login-gated boards, native tailoring
works in the web app, daily server-owned queue preparation works, and the server-side Playwright
runner exists with dry-run, screenshots, validation, and failure handling. See
[`deploy/production.md`](./deploy/production.md) before enabling live submit.
