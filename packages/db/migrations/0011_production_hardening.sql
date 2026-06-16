-- Production hardening for matching, resume history, tracker scale, and job freshness.

-- Active master resume pointer. Older deployments may already have profiles, so keep this idempotent.
alter table jobposted.profiles
  add column if not exists active_resume_version_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_active_resume_version_id_fkey'
  ) then
    alter table jobposted.profiles
      add constraint profiles_active_resume_version_id_fkey
      foreign key (active_resume_version_id)
      references jobposted.resume_base_versions(id)
      on delete set null;
  end if;
end $$;

-- Resume versions now pin the exact uploaded binary and can carry a profile embedding for vector recall.
alter table jobposted.resume_base_versions
  add column if not exists storage_path text,
  add column if not exists source_document jsonb,
  add column if not exists content_hash text,
  add column if not exists embedding vector(1536);

-- Jobs need freshness tracking so stale postings can be excluded from matching.
alter table jobposted.jobs
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists closed_at timestamptz;

-- Queue claim and dashboard hot paths.
create index if not exists idx_applications_queued_claim
  on jobposted.applications (created_at, id)
  where status = 'queued';

create index if not exists idx_applications_user_status_submitted
  on jobposted.applications (user_id, status, submitted_at desc, created_at desc);

create index if not exists idx_applications_user_activity
  on jobposted.applications (user_id, submitted_at desc, created_at desc);

create index if not exists idx_applications_user_apply_path_status
  on jobposted.applications (user_id, apply_path, status, created_at desc);

create index if not exists idx_applications_field_map_gin
  on jobposted.applications using gin (field_map);

-- Candidate inventory reads should avoid stale/closed rows and match the actual sort order.
create index if not exists idx_jobs_open_fresh
  on jobposted.jobs (posted_at desc, ingested_at desc, id)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_last_seen_open
  on jobposted.jobs (last_seen_at desc)
  where closed_at is null;

create index if not exists idx_resume_base_user_created
  on jobposted.resume_base_versions (user_id, created_at desc);

create index if not exists idx_resume_base_embedding
  on jobposted.resume_base_versions using hnsw (embedding vector_cosine_ops);

-- Vector recall RPC. The app still applies deterministic hard gates after this recall step.
create or replace function jobposted.match_jobs_for_resume(
  profile_embedding vector(1536),
  match_limit int default 500
)
returns table (
  id uuid,
  source text,
  source_job_id text,
  ats_type text,
  company text,
  title text,
  location text,
  remote text,
  description_md text,
  apply_url text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  posted_at timestamptz,
  ingested_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    j.id,
    j.source,
    j.source_job_id,
    j.ats_type,
    j.company,
    j.title,
    j.location,
    j.remote,
    j.description_md,
    j.apply_url,
    j.salary_min,
    j.salary_max,
    j.salary_currency,
    j.posted_at,
    j.ingested_at,
    1 - (j.embedding <=> profile_embedding) as similarity
  from jobposted.jobs j
  where
    profile_embedding is not null
    and j.embedding is not null
    and j.apply_url is not null
    and j.closed_at is null
  order by j.embedding <=> profile_embedding
  limit greatest(1, least(coalesce(match_limit, 500), 1000));
$$;
