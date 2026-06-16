-- Job board pagination/search support.
--
-- The dashboard job board intentionally avoids per-row match scoring while browsing.
-- These indexes support cheap paged browsing and text filtering over the open-job inventory.

create extension if not exists pg_trgm;

create index if not exists idx_jobs_open_company_title
  on jobposted.jobs (company asc, title asc, id)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_title_company
  on jobposted.jobs (title asc, company asc, id)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_title_trgm
  on jobposted.jobs using gin (title gin_trgm_ops)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_company_trgm
  on jobposted.jobs using gin (company gin_trgm_ops)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_location_trgm
  on jobposted.jobs using gin (location gin_trgm_ops)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_description_trgm
  on jobposted.jobs using gin (description_md gin_trgm_ops)
  where apply_url is not null and closed_at is null;
