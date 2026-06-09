# @jobposted/worker — the apply engine (design doc §11)

Server-side **Playwright + vision** worker for **open ATS** (Greenhouse, Lever, Ashby). Claims
`queued` applications, opens the form, fills it via `@jobposted/field-match`, screenshots, and
**parks at `ready_for_review` — never auto-submitting**. On user confirm (status `submitting`),
it re-opens, re-fills from the saved field map, gates on the daily cap, and submits.

Runs as a long-lived container on **Railway** (stateful, human-paced, browser-pool workload —
not serverless). LinkedIn / login-Workday are **out of scope** here; those go to the extension.

```
src/
  index.ts        main loop: claim queued → fill+park; claim submitting → submit
  queue.ts        optimistic atomic claim + status transitions + daily-cap helpers
  browser.ts      stealthed Chromium context + human pacing (§11.5)
  extract.ts      DOM → PageField[] descriptors
  fill.ts         fill from a FieldMap + upload the base resume
  handlers/       per-ATS gotoForm/submit specifics + generic fallback (§11.6)
  applyRunner.ts  fill + screenshot + park (NO submit)
  submitRunner.ts re-fill + submit + verify, after confirmation
  captcha.ts      detect CAPTCHA/Cloudflare → stop, route to extension/manual (§11.4)
  cache.ts        field_map_cache (discover-once, §11.2)
  runFixture.ts   offline verification against saved forms
```

## Local

```bash
cp .env.example .env   # fill Supabase service role + OPENROUTER/ANTHROPIC keys
pnpm --filter @jobposted/worker fixtures           # offline: extract→match→fill on fixtures
WORKER_HEADLESS=false pnpm --filter @jobposted/worker start   # watch it process the live queue
```

The worker never submits to a real employer except via the confirmed `submitting` path. Filling
+ parking (`queued` → `ready_for_review`) opens real forms but **does not submit**.

## Deploy on Railway

1. **New Project → Deploy from GitHub** → pick the `jobposted` repo.
2. Service settings → **Root Directory = repo root**; the build uses `apps/worker/Dockerfile`
   (`railway.toml` wires this). The Dockerfile installs Chromium + system deps.
3. **Variables** (from `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`, optional `BROWSER_PROXY_URL`,
   plus tuning (`WORKER_CONCURRENCY`, `WORKER_POLL_MS`).
4. Deploy. One always-on replica polls the queue. Scale replicas later; the claim is atomic.

## Env

See [`.env.example`](./.env.example). Requires the Supabase service role (bypasses RLS),
an OpenRouter key (DeepSeek), and an Anthropic key (Claude vision). Proxy + Sentry are optional.
