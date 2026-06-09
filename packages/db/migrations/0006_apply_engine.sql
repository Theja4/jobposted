-- Phase 3: apply engine (design doc §11). Additive; safe to re-run.

-- Worker bookkeeping on applications: claim timestamp + retry counter.
alter table jobposted.applications
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts int default 0;

-- Discover-once / reuse field-map cache per (ats_type, company) (design doc §11.2):
-- repeat applications to the same employer skip the expensive vision step.
create table if not exists jobposted.field_map_cache (
  ats_type text,
  company text,
  structure jsonb,                 -- resolved selectors/types for this employer's form
  updated_at timestamptz default now(),
  primary key (ats_type, company)
);

-- Cache is written/read by the worker + field-match service via the service role only.
grant all on jobposted.field_map_cache to service_role;

-- Help the worker find claimable work quickly.
create index if not exists idx_applications_status_created
  on jobposted.applications (status, created_at);
