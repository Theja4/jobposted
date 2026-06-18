# JobPosted production runbook

This app has two production surfaces:

1. **Web** — Next.js dashboard, job board, queue prep, ingest cron.
2. **Worker** — Railway Playwright worker for prepare -> render -> apply -> cleanup.

The worker can run while the web app is local only, but `JOBPOSTED_WEB_URL` must point to an
HTTP-reachable web app for queue preparation and resume rendering.

## Web

- Health: `GET /api/health`
- Ingest cron: `POST /api/ingest/cron`
- Queue prepare: `POST /api/queue/prepare`
- Queue render: `POST /api/queue/render`

Vercel cron is declared in `apps/web/vercel.json`:

```json
{ "path": "/api/ingest/cron", "schedule": "0 */4 * * *" }
```

Required web env:

```bash
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
WORKER_CRON_SECRET=
CRON_SECRET=
INGEST_CRON_SECRET=
INGEST_BOARDS_FILE=
INGEST_BOARDS_JSON=
```

Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
Use `INGEST_BOARDS_JSON` on Vercel when possible; file paths such as `INGEST_BOARDS_FILE` are
better suited to local runs or a persistent worker filesystem.

Vercel plan check:

- `POST /api/tailor` declares `maxDuration = 120`.
- `POST /api/queue/render` declares `maxDuration = 300` for batch resume rendering.
- `GET/POST /api/ingest/cron` declares `maxDuration = 60`.
- Make sure the deployed Vercel plan supports those durations, or lower the batch sizes/timeouts
  before enabling scheduled production traffic.

## Worker on Railway

Railway config is in `railway.toml`; the image is built from `Dockerfile.worker`.

Use one persistent worker service for health checks/manual runs, and optionally one scheduled
Railway Cron service from the same repo for the timed pipeline.

Persistent worker service:

- Private Railway URL for this worker: `http://jobpostedworker-copy.railway.internal:8080`
  assuming `WORKER_PORT=8080`. Use this only from another Railway service in the same project
  environment. Local machines, browsers, and Vercel cannot reach `.railway.internal` directly.
- Start command: `pnpm --filter @jobposted/worker start`
- Health check path: `/health`
- Health: `GET /health`
- Full pipeline: `POST /cron/run`
- Cleanup only: `POST /cron/cleanup`
- Runner only: `POST /runner/run`
- Adapter validation: `POST /runner/validate`

Scheduled Railway Cron service:

- Create a second Railway service from this repo.
- Set the Railway config file path to `/railway.cron.toml`.
- The cron config uses `Dockerfile.worker`, runs
  `pnpm --filter @jobposted/worker run cron:run`, disables the health check, and schedules
  `*/15 * * * *`.
- Edit `cronSchedule` in `railway.cron.toml` if you want a different cadence.
- Railway evaluates cron schedules in UTC and expects the process to finish and exit.

Required worker env:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JOBPOSTED_WEB_URL=
WORKER_CRON_SECRET=
WORKER_PORT=8080
```

Safe launch env:

```bash
APPLY_RUNNER_ENABLED=0
APPLY_DRY_RUN=1
APPLY_BATCH=50
QUEUE_RENDER_ON_CRON=1
APPLY_RUNNER_ON_CRON=0
DOCUMENT_CLEANUP_ON_CRON=1
WORKER_LOCKS_ENABLED=1
```

Only when intentionally validating the server apply runner:

```bash
APPLY_RUNNER_ENABLED=1
APPLY_RUNNER_ON_CRON=1
APPLY_DRY_RUN=1
```

Only after dry-run screenshots and adapter validation pass:

```bash
APPLY_DRY_RUN=0
```

## Pre-live checks

```bash
pnpm --filter @jobposted/web typecheck
pnpm --filter @jobposted/ingest typecheck
pnpm --filter @jobposted/worker typecheck
pnpm --filter @jobposted/worker test
pnpm --filter @jobposted/db print >/tmp/jobposted-migrations.sql
```

Validate live ATS selectors before allowing server submit:

```bash
pnpm --filter @jobposted/worker run validate:ats -- \
  --file apps/worker/ats-validation.example.json \
  --screenshots ./tmp/ats-validation
```

## Cron smoke

```bash
curl -fsS "$WORKER_URL/health"
curl -fsS -X POST "$WORKER_URL/cron/run" \
  -H "Authorization: Bearer $WORKER_CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{}'

pnpm --filter @jobposted/worker build
pnpm --filter @jobposted/worker run cron:run
```
