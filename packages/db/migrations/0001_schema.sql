-- JobPosted schema (design doc §8, §8.2, §11.8, §12).
--
-- Everything lives in the dedicated `jobposted` schema, NOT `public`, because this database
-- is shared with Rezoomed, which already owns public.profiles / public.jobs / public.referrals.
-- Namespacing avoids clobbering Rezoomed. FKs to auth.users and RLS via auth.uid() work the
-- same in a non-public schema.

create extension if not exists vector;

create schema if not exists jobposted;

-- ── profiles (design doc §8) ────────────────────────────────────────────────
-- Note: EEO demographics & criminal background are deliberately NOT here (see §8.2 and the
-- separate sensitive_self_id table below).
create table if not exists jobposted.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  location text,
  linkedin_url text,
  portfolio_url text,
  work_authorization text,        -- citizen | OPT | STEM-OPT | H1B | needs_sponsorship | india_citizen
  needs_sponsorship boolean,
  relocation_ok boolean,
  relocation_notes text,
  salary_expectation_min numeric,
  salary_expectation_max numeric,
  salary_currency text,
  notice_period_days int,
  created_at timestamptz default now()
);

-- ── documents (design doc §8) ───────────────────────────────────────────────
create table if not exists jobposted.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text,                      -- base_resume | tailored_resume | cover_letter
  job_id uuid,
  storage_path text,
  rezoomed_score numeric,
  created_at timestamptz default now()
);

-- ── jobs (global read; design doc §8, §9) ───────────────────────────────────
create table if not exists jobposted.jobs (
  id uuid primary key default gen_random_uuid(),
  source text,
  source_job_id text,
  ats_type text,
  company text,
  title text,
  location text,
  remote text,                    -- remote | hybrid | on-site | unknown
  description_md text,
  apply_url text,
  form_questions jsonb,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  visa_sponsorship boolean,
  posted_at timestamptz,
  ingested_at timestamptz default now(),
  embedding vector(1536),
  unique (source, source_job_id)
);

-- ── resume base + variants (design doc §11.8) ───────────────────────────────
-- Created before `applications` so its FKs resolve. Stores deltas, not hundreds of PDFs.
create table if not exists jobposted.resume_base_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content jsonb,                  -- structured resume, source of truth
  created_at timestamptz default now()
);

create table if not exists jobposted.resume_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  base_version_id uuid references jobposted.resume_base_versions(id),
  label text,                     -- human readable, e.g. "Backend / Go"
  jd_centroid vector(1536),       -- the JD cluster this variant serves
  tailoring jsonb,                -- delta vs base: summary, skills order, keywords, bullets
  jobs_count int default 0,
  created_at timestamptz default now()
);

-- ── applications (design doc §8, §11.8 columns, §10.7 referral columns) ──────
create table if not exists jobposted.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  job_id uuid references jobposted.jobs(id) on delete cascade,
  status text,                    -- queued | tailoring | ready_for_review | submitting | submitted | failed | rejected | interview
  apply_path text,                -- server | extension
  resume_doc_id uuid references jobposted.documents(id),
  cover_letter_doc_id uuid references jobposted.documents(id),
  field_map jsonb,
  screenshot_path text,
  failure_reason text,
  -- §11.8 resume-at-scale
  base_version_id uuid references jobposted.resume_base_versions(id),
  resume_variant_id uuid references jobposted.resume_variants(id),
  tailoring_delta jsonb,          -- per-job tweaks beyond the variant
  rendered_pdf_path text,         -- nullable, hot-cached PDF, TTL'd
  -- §10.7 referral messages persist until regenerated
  referral_cold text,
  referral_warm text,
  referral_generated_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, job_id)
);

-- ── subscriptions (design doc §8, §12 — paid only, daily-limit model) ────────
create table if not exists jobposted.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text,                  -- creem | razorpay
  plan text,                      -- starter_20 | pro_50
  daily_limit int,                -- 20 for Starter ($19), 50 for Pro ($49)
  status text,                    -- trialing | active | past_due | canceled
  trial_applications_used int default 0,  -- counts toward the 5-application trial
  renews_at timestamptz
);
-- Daily usage is DERIVED from the applications table (drift-free; design doc §12), not a
-- stored counter: count submissions where submitted_at::date = current_date in the user's tz.
-- See the index on applications(user_id, submitted_at) in 0004_indexes.sql.

-- ── waitlist (design doc §7.2, §8) ──────────────────────────────────────────
create table if not exists jobposted.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
);

-- ── sensitive_self_id (design doc §8.2) ─────────────────────────────────────
-- EEO demographics: encrypted blob, optional, explicit per-purpose consent, never used for
-- matching/filtering. Criminal background is NEVER persisted (captured at fill time only).
create table if not exists jobposted.sensitive_self_id (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data_encrypted bytea,           -- encrypted blob, not plaintext columns (use Supabase Vault)
  consent_given_at timestamptz,
  consent_version text
);

-- ── Role grants ─────────────────────────────────────────────────────────────
-- RLS (0002) governs which ROWS each user sees; these grants govern TABLE access for the
-- Supabase roles. The service role bypasses RLS and is used only server-side.
grant usage on schema jobposted to anon, authenticated, service_role;

grant all on all tables in schema jobposted to service_role;
grant all on all sequences in schema jobposted to service_role;

grant select, insert, update, delete on all tables in schema jobposted to authenticated;

-- jobs is global read (design doc §8.1): allow anon + authenticated to read it.
grant select on jobposted.jobs to anon, authenticated;

-- Future tables inherit these grants.
alter default privileges in schema jobposted grant all on tables to service_role;
alter default privileges in schema jobposted
  grant select, insert, update, delete on tables to authenticated;
