# @jobposted/worker — queue-prep bridge plus Phase 3 apply shell

The server-side apply engine for **open ATS only** (Greenhouse, Lever, Ashby). Runs on
Railway, **not** Vercel — Vercel functions can't hold long, stateful Playwright sessions
(design doc §3, §11.1).

The current implementation has build/start scripts, a health endpoint, a protected cron
entrypoint that calls the web app's daily queue preparer, **and the apply runner**
(`POST /runner/run`).

The same cron path also runs a bounded retention pass by default. For a standalone cleanup run,
call `POST /cron/cleanup`.

## Apply runner (`POST /runner/run`)

Claims `queued` `server` applications, fills + submits them via per-ATS adapters, captures a
screenshot, and transitions status. Implemented in `src/runner/`:

- `db.ts` — atomic claim (`claim_applications` RPC, `FOR UPDATE SKIP LOCKED`), applicant + resume
  resolution, per-user daily-limit counts, status transitions, screenshot upload.
- `policy.ts` — pure daily-limit / attempt decisions + failure classification (unit-tested).
- `adapters.ts` — per-ATS validation + form fill/submit (Greenhouse, Lever, Ashby) + registry.
- `browser.ts` — lazy Playwright Chromium launcher (only loaded on the runner path).
- `runner.ts` — orchestrator: claim → limit gate → resolve → adapter → state transition →
  retry/classify (unit-tested end-to-end with fakes in `runner.test.ts`).

**Safety:**
- Disabled unless `APPLY_RUNNER_ENABLED=1`.
- **Dry-run by default** — fills the form + screenshots it but never clicks submit. Only an
  explicit `APPLY_DRY_RUN=0` submits live.
- Enforces each user's daily limit (derived from `subscriptions`; inactive sub → 0) and an
  attempt cap; permanent failures (unsupported ATS, login wall, captcha, missing form/resume) are
  routed to `ready_for_review`, transient ones are re-queued with backoff.
- Validates selectors before submit. The runner checks for login walls, captchas, closed jobs,
  required identity/email/resume/submit controls, and captures a screenshot before routing broken
  forms to review.
- Recognizes common ATS flows that should not be run headlessly yet (Workday, LinkedIn, iCIMS,
  Workable, SmartRecruiters, Taleo, SuccessFactors, Jobvite, BambooHR, Indeed, Rippling,
  Paylocity, Recruitee, Teamtailor, Personio, JazzHR, Breezy, Comeet, Pinpoint, ClearCompany,
  Paycom, UKG, Ceipal, Trakstar, Recruiterbox, Jobsoid) as `review_only` instead of pretending
  they are unknown or safe.
- Idempotent via `unique (user_id, job_id)` + status checks.

> ⚠️ The adapter DOM selectors are best-effort and **must be validated against live forms in a
> staging dry-run before `APPLY_DRY_RUN=0`**. The orchestration/state-machine is fully tested; the
> live form interaction is not (and can't be unit-tested).

Runner env:

```bash
APPLY_RUNNER_ENABLED=0          # 1 to enable the /runner/run endpoint
APPLY_DRY_RUN=1                 # 0 to actually submit (default: dry run)
APPLY_BATCH=10                  # applications claimed per run (max 50)
APPLY_MAX_ATTEMPTS=3            # retries before a transient failure becomes 'failed'
APPLY_DAILY_LIMIT_DEFAULT=20    # fallback when a subscription has no daily_limit
```

## Auto pipeline (`POST /cron/run` or `cron:run`)

A single scheduled cron hit runs the whole auto path in order:

1. **prepare** — `POST $JOBPOSTED_WEB_URL/api/queue/prepare` (matches jobs → creates `server`
   application rows).
2. **render** — `POST $JOBPOSTED_WEB_URL/api/queue/render` tailors (when enabled + gateway
   configured) and renders a PDF for queued apps missing an artifact, pinning `rendered_pdf_path`
   so the runner submits the *tailored* resume, not the master fallback. Gated by
   `QUEUE_RENDER_ON_CRON` (default on); batch via `QUEUE_RENDER_LIMIT` (default 8).
3. **apply** — runs `runApplyBatch` locally (same code as `POST /runner/run`). Gated by
   `APPLY_RUNNER_ON_CRON` (default on) **and** `APPLY_RUNNER_ENABLED=1`, still dry-run unless
   `APPLY_DRY_RUN=0`.
4. **cleanup** — document retention (gated by `DOCUMENT_CLEANUP_ON_CRON`).

```bash
QUEUE_RENDER_ON_CRON=1          # 0 to skip the render step in /cron/run
QUEUE_RENDER_LIMIT=8            # apps rendered per cron tick (web side, max 50)
APPLY_RUNNER_ON_CRON=1          # 0 to skip the apply step in /cron/run
```

Each stage is independent: a render or apply failure is captured in the response (and error
reporting) without failing the others. Use `POST /cron/run` for a persistent HTTP worker run, or
use `pnpm --filter @jobposted/worker run cron:run` as a one-shot Railway Cron start command.

## Adapter validation (`POST /runner/validate`)

Use this before enabling a new company form or before turning off dry-run. It opens the URL,
picks the adapter, checks for blockers and required selectors, and returns confidence plus
missing fields. It never submits.

```bash
curl -X POST "$WORKER_URL/runner/validate" \
  -H "Authorization: Bearer $WORKER_CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"platform":"ashby","jobUrl":"https://jobs.ashbyhq.com/acme/role"}'
```

For repeated checks against real forms, use the local validator. It runs the same code path as the
HTTP endpoint, supports a matrix file, and can save failure screenshots:

```bash
pnpm --filter @jobposted/worker run validate:ats -- \
  --url "https://jobs.ashbyhq.com/acme/role/application" \
  --platform ashby \
  --screenshots ./tmp/ats-validation

pnpm --filter @jobposted/worker run validate:ats -- \
  --file apps/worker/ats-validation.example.json \
  --screenshots ./tmp/ats-validation
```

The command exits non-zero when a target has missing required selectors, a login wall, CAPTCHA, or
unsupported flow. Use `--no-fail` for exploratory reports where you do not want CI behavior.

## Railway

The repo includes `Dockerfile.worker` and `railway.toml` for the persistent worker service.

Persistent worker service:

- Builder: Dockerfile (`Dockerfile.worker`)
- Start command: `pnpm --filter @jobposted/worker start`
- Health check path: `/health`
- Manual/full run: `POST /cron/run` with `Authorization: Bearer $WORKER_CRON_SECRET`
- Cleanup only: `POST /cron/cleanup`
- Runner only: `POST /runner/run`
- Adapter validation: `POST /runner/validate`

Railway Cron service:

- Create a second Railway service from the same repo if you want Railway to schedule the pipeline.
- Set its config file path to `/railway.cron.toml`; this avoids inheriting the persistent
  worker's `/health` check.
- The included cron config uses `Dockerfile.worker`, runs
  `pnpm --filter @jobposted/worker run cron:run`, and schedules `*/15 * * * *`.
- Adjust `cronSchedule` in `railway.cron.toml` if you want a different cadence.
- Do not use the always-on `start` command for a scheduled service; Railway Cron expects the
  process to complete and exit after the task is done.
- Use `pnpm --filter @jobposted/worker run cron:cleanup` for a cleanup-only scheduled service.

Cron behavior: calls `POST $JOBPOSTED_WEB_URL/api/queue/prepare` and creates `server`
application rows from ingested jobs that match completed onboarding profiles, then runs render,
apply, and cleanup according to the env gates below.

Required env:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JOBPOSTED_WEB_URL=
WORKER_CRON_SECRET=
WORKER_PORT=8080
SENTRY_DSN=
ERROR_REPORTING_WEBHOOK_URL=
```

Optional queue-prep env:

```bash
JOBPOSTED_DAILY_PREP_LIMIT=16
JOBPOSTED_DAILY_CANDIDATE_LIMIT=500
JOBPOSTED_BULK_USER_PAGE_SIZE=200
JOBPOSTED_BULK_CONCURRENCY=4
```

Optional retention env:

```bash
DOCUMENT_CLEANUP_ON_CRON=1             # 0 disables cleanup after /cron/run
DOCUMENT_RETENTION_DAYS=14             # hot window for transient tailored renders
DOCUMENT_CLEANUP_BATCH=500             # old document rows considered per pass
DOCUMENT_CLEANUP_STORAGE_SCAN_LIMIT=1000
DOCUMENT_CLEANUP_STORAGE_USER_LIMIT=1000
```

Retention safety:
- Only `tailored_resume` / `cover_letter` document rows older than the cutoff are candidates.
- Any document referenced by an application is preserved.
- Storage objects are removed only if they live under `uid/tailored/` or `uid/transient/` and are
  not referenced by `documents`, `applications.rendered_pdf_path`, or `resume_base_versions`.

## Planned shape (design doc §11)

```
src/
  queue.ts        atomically claim applications rows with status 'ready'
  applyRunner.ts  open apply_url, fill, screenshot, park at 'ready_for_review' (DO NOT submit)
  fieldMatch.ts   call the field-matching service (data, not code — §11.2)
  antiDetect.ts   stealth + human pacing + per-user residential proxy (§11.5)
```

### The loop (§11.1)

1. Claim a `ready` application; set `tailoring`.
2. Call **Rezoomed tailoring** on `(base_resume, job.description_md)` → per-job resume + cover
   letter; store in `documents` (§11.3). This is the moat — wire it as an internal service
   call (`REZOOMED_API_URL`), not a copy of the logic.
3. Launch a Playwright context (optional per-user proxy via `BROWSER_PROXY_URL`), stealth + human pacing.
4. Read the page (accessibility tree + screenshot) → ask the field-matching service for a
   **field map (data)**; the code does the filling. Cache per `(ats_type, company)`.
5. Upload the tailored resume from Supabase Storage.
6. Screenshot the filled form. **Park at `ready_for_review`. Never auto-submit.** A separate
   confirm handler resumes and submits only after the user confirms.

### Failure handling (§11.4)

- Form changed / field not found → `failed` + `failure_reason`, alert Sentry, surface as
  "needs manual apply" with the direct link. Never silently drop.
- CAPTCHA / Cloudflare → **stop**; do not attempt to solve. Route to the extension path or
  manual apply.
- Backoff + concurrency cap; respect the per-channel daily ceilings (§1, ~100/day direct ATS).
- Idempotency via `unique (user_id, job_id)`; check status before resuming.

## Env

`REZOOMED_API_URL`, `REZOOMED_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `BROWSER_PROXY_URL`, `SENTRY_DSN` (see repo-root `.env.example`).
