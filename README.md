# JobPosted

An AI job-application platform: find matching jobs, tailor a resume per role (via
[Rezoomed](https://rezoomed.com)), fill the application, **the user confirms**, then submit.
Standalone product, integrates with Rezoomed (shared Supabase, tailoring API, geo payments).

> Copilot, not autopilot. We don't spray. You confirm every submission. Your LinkedIn never
> runs from our servers.

## Monorepo layout

```
apps/
  web/        Next.js 16 portal + marketing landing (Vercel)
  ingest/     Lever + Greenhouse job fetchers → normalized rows in Supabase
  worker/     Playwright + vision apply engine        (Phase 3 — stub)
  extension/  Manifest V3 Chrome extension             (Phase 5 — stub)
packages/
  shared/     @jobposted/shared — cross-app TS types + normalize/dedupe helpers
  db/         @jobposted/db — Supabase SQL migrations (schema `jobposted`)
```

## Status

Built so far (Phase 0 + start of Phase 1):

- ✅ Monorepo skeleton (pnpm workspaces + Turborepo)
- ✅ `packages/shared` — types + normalization/dedup
- ✅ `packages/db` — schema, RLS, storage, indexes (all in the `jobposted` Postgres schema)
- ✅ `apps/web` — landing page, waitlist capture, SEO
- ✅ `apps/ingest` — Lever + Greenhouse fetchers, dedupe, embed (key-optional), upsert, CLI
- 🚧 `apps/worker`, `apps/extension` — README stubs (deferred per design-doc build order)

## Prerequisites

- Node ≥ 20 (`.nvmrc` pins 20) — works on 24
- pnpm ≥ 11 (`corepack enable` if you don't have it)

## Quick start

```bash
pnpm install

# Marketing site (no secrets required to render the landing page)
pnpm --filter @jobposted/web dev          # http://localhost:3000

# Ingest a real public board (no auth needed) and print normalized jobs
pnpm --filter @jobposted/ingest fetch -- --source lever --company netflix
pnpm --filter @jobposted/ingest fetch -- --source greenhouse --board stripe

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
- **Tailoring** — calls Rezoomed's ATS tailoring API as an internal service (Phase 3).
- **Payments** — reuses the Polar (international) / Razorpay (India) geo split (Phase 4).
- **Extension** — clones the proven WXT/MV3 pattern from Rezoomed's LinkedIn extension (Phase 5).

## Build order (design doc §22)

Phase 0 foundations → Phase 1 ingestion → Phase 2 portal → Phase 3 apply engine →
Phase 4 payments → Phase 5 extension → Phase 6 beta + launch. **Do not** build the extension
or LinkedIn path until the Greenhouse/Lever server-side apply path is converting.
