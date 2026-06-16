-- Cross-board posting de-duplication (gaps.md §17): a stable identity per real-world posting so
-- the same role posted to several boards/aggregators isn't queued and applied to twice.

alter table jobposted.jobs add column if not exists dedupe_key text;
create index if not exists idx_jobs_dedupe_key on jobposted.jobs (dedupe_key);

-- Backfill existing rows with the same canonicalization the app uses (packages/shared dedupeKey):
-- lower → collapse non-alphanumerics to single spaces → trim, the three parts joined by '|'.
update jobposted.jobs
set dedupe_key =
  btrim(regexp_replace(lower(coalesce(company, '')), '[^a-z0-9]+', ' ', 'g'))
  || '|' ||
  btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', ' ', 'g'))
  || '|' ||
  btrim(regexp_replace(lower(coalesce(location, '')), '[^a-z0-9]+', ' ', 'g'))
where dedupe_key is null;

-- Recreate the vector-recall function to also return dedupe_key (return signature change → drop first).
drop function if exists jobposted.match_jobs_for_resume(vector, integer);

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
  dedupe_key text,
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
    j.dedupe_key,
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

alter function jobposted.match_jobs_for_resume(vector, integer) set search_path = jobposted, public, pg_temp;
grant execute on function jobposted.match_jobs_for_resume(vector, integer) to authenticated, service_role;
