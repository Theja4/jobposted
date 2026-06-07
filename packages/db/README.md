# @jobposted/db

Supabase SQL migrations for JobPosted. **All objects live in the `jobposted` Postgres
schema**, not `public` — this database is shared with Rezoomed, which already owns
`public.profiles`, `public.jobs`, and `public.referrals`. Namespacing prevents collisions.
FKs to `auth.users` and RLS via `auth.uid()` work identically in a non-public schema.

## Migrations (apply in order)

| File | What it does | Design doc |
| --- | --- | --- |
| `0001_schema.sql` | `jobposted` schema + all tables + role grants | §8, §8.2, §11.8, §12 |
| `0002_rls.sql` | RLS on every user-scoped table; owner-only policies; jobs global read | §8.1 |
| `0003_storage.sql` | private `resumes` + `screenshots` buckets, owner-folder RLS | §14 |
| `0004_indexes.sql` | derived daily-usage, queue, dedupe, and HNSW vector indexes | §9.4, §12 |

## How to apply

These migrations are **not** auto-applied — they touch the shared production Supabase, so
applying them is a deliberate step you take.

**Option A — Supabase SQL Editor (simplest):** paste each file's contents, in order, and run.

**Option B — Supabase CLI / psql:**

```bash
# Print all migrations concatenated in order:
pnpm --filter @jobposted/db print

# Pipe to your database (set the connection string from Supabase → Project Settings → Database):
pnpm --filter @jobposted/db print | psql "$SUPABASE_DB_URL"
```

### One required dashboard step

So `supabase-js` can reach `jobposted.*` tables through the REST API, add the schema to the
API allow-list: **Supabase → Project Settings → API → Exposed schemas → add `jobposted`**.
(The grants in `0001` already give `anon` / `authenticated` / `service_role` the right
table privileges; RLS still governs row access.) The waitlist endpoint uses the **service
role** server-side, which bypasses both RLS and the exposed-schema restriction, so signups
work even before you flip this — but the authenticated portal (Phase 2) will need it.

## Keys: anon vs service role (design doc §8.1)

- **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — shipped to the browser. Every request is
  constrained by RLS, so a user only ever sees their own rows. Safe to expose.
- **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — **server only, never reaches the
  client.** Bypasses RLS. Used by the ingest upserts, the apply worker, and the waitlist
  endpoint. Leaking it leaks every user's data.

## Sensitive data (design doc §8.2)

`sensitive_self_id` holds **optional, consented** EEO demographics as an **encrypted blob**
(`data_encrypted bytea`), never plaintext columns, and is never used for matching/filtering.
Encrypt with **Supabase Vault** (or application-level encryption) before writing. Criminal
background is **never persisted** — capture it at fill time per application only.

## Storage signed URLs (design doc §14)

Buckets are private. Serve files via short-lived signed URLs:

```ts
const { data } = await supabase.storage
  .from("resumes")
  .createSignedUrl(`${userId}/base.pdf`, 60); // 60-second TTL
```
