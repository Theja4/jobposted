# @jobposted/worker — Phase 3 (not yet implemented)

The server-side apply engine for **open ATS only** (Greenhouse, Lever, Ashby). Runs on
Fly/Railway, **not** Vercel — Vercel functions can't hold long, stateful Playwright sessions
(design doc §3, §11.1).

> Deferred on purpose. Per the design doc's build order (§22), this is built **after** the
> portal (Phase 2). And the Greenhouse/Lever server-side path must be submitting real
> applications before the extension or LinkedIn path is touched — "that single path is the
> whole product thesis."

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
