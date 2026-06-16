-- Normalized job-board filters.
--
-- The public board should stay cheap to browse. These columns avoid scoring or classifying
-- thousands of rows in application code whenever a user changes filters.

create or replace function jobposted.infer_job_type(title text, description text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(intern|internship|co-op|campus)\M'
      then 'internship'
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(contract|contractor|temporary|temp|freelance|fractional)\M'
      then 'contract'
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(part[-[:space:]]?time|parttime)\M'
      then 'part-time'
    else 'full-time'
  end;
$$;

create or replace function jobposted.infer_seniority(title text, description text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(vp|vice president|director|head of|manager|management|executive)\M'
      then 'leadership'
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(staff|principal|architect|distinguished)\M'
      then 'staff'
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(senior|sr\.?|lead)\M'
      then 'senior'
    when coalesce(title, '') || ' ' || coalesce(description, '') ~* '\m(entry|junior|jr\.?|graduate|new grad|intern)\M'
      then 'entry'
    else 'mid'
  end;
$$;

alter table jobposted.jobs
  add column if not exists job_type text,
  add column if not exists seniority text;

update jobposted.jobs
set
  job_type = jobposted.infer_job_type(title, description_md),
  seniority = jobposted.infer_seniority(title, description_md)
where job_type is null
   or seniority is null;

alter table jobposted.jobs
  add column if not exists salary_listed boolean
    generated always as (salary_min is not null or salary_max is not null) stored,
  add column if not exists salary_ceiling numeric
    generated always as (coalesce(salary_max, salary_min)) stored,
  add column if not exists source_family text
    generated always as (coalesce(nullif(ats_type, ''), nullif(source, ''))) stored;

create index if not exists idx_jobs_open_remote
  on jobposted.jobs (remote)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_job_type
  on jobposted.jobs (job_type)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_seniority
  on jobposted.jobs (seniority)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_source
  on jobposted.jobs (source)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_source_family
  on jobposted.jobs (source_family)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_ats_type
  on jobposted.jobs (ats_type)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_visa
  on jobposted.jobs (visa_sponsorship)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_salary_listed
  on jobposted.jobs (salary_listed)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_salary_ceiling
  on jobposted.jobs (salary_ceiling desc)
  where apply_url is not null and closed_at is null and salary_ceiling is not null;
