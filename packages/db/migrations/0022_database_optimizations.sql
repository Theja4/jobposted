-- Database-side dashboard, job-board, usage, and application logging optimizations.

create extension if not exists pg_trgm;

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
  add column if not exists last_seen_at timestamptz default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists company_domain text,
  add column if not exists company_logo_url text,
  add column if not exists company_logo_resolved_at timestamptz,
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

create index if not exists idx_jobs_company_domain
  on jobposted.jobs (company_domain)
  where company_domain is not null;

create index if not exists idx_jobs_open_remote
  on jobposted.jobs (remote)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_job_type
  on jobposted.jobs (job_type)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_seniority
  on jobposted.jobs (seniority)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_source_family
  on jobposted.jobs (source_family)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_salary_listed
  on jobposted.jobs (salary_listed)
  where apply_url is not null and closed_at is null;

create index if not exists idx_jobs_open_salary_ceiling
  on jobposted.jobs (salary_ceiling desc)
  where apply_url is not null and closed_at is null and salary_ceiling is not null;

-- Hot lookup indexes. Some older migrations already cover adjacent paths; these keep the exact
-- high-cardinality predicates cheap as the applications/documents tables grow.
create index if not exists idx_applications_user_job_present
  on jobposted.applications (user_id, job_id)
  where job_id is not null;

create index if not exists idx_applications_user_server_status_activity
  on jobposted.applications (user_id, apply_path, status, submitted_at desc, created_at desc)
  where apply_path = 'server';

create index if not exists idx_documents_user_job_type_created
  on jobposted.documents (user_id, job_id, type, created_at desc)
  where job_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_source_source_job_id_key'
      and conrelid = 'jobposted.jobs'::regclass
  ) then
    alter table jobposted.jobs
      add constraint jobs_source_source_job_id_key unique (source, source_job_id);
  end if;
end;
$$;

create or replace function jobposted.application_match_score(p_field_map jsonb)
returns int
language sql
immutable
as $$
  select case
    when coalesce(p_field_map ->> 'matchScore', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest(0, least(100, round((p_field_map ->> 'matchScore')::numeric)))::int
    when jsonb_typeof(p_field_map -> 'fieldsFilled') = 'array'
      and jsonb_array_length(p_field_map -> 'fieldsFilled') > 0
      then round(
        100.0 * (
          select count(*)
          from jsonb_array_elements(p_field_map -> 'fieldsFilled') item
          where item ->> 'status' = 'filled'
        ) / jsonb_array_length(p_field_map -> 'fieldsFilled')
      )::int
    else 0
  end;
$$;

grant execute on function jobposted.application_match_score(jsonb) to authenticated, service_role;

create or replace function jobposted.dashboard_application_stats(
  p_user_id uuid,
  p_week_start timestamptz
)
returns table (
  sent_this_week bigint,
  responses bigint,
  interviews bigint,
  avg_match int
)
language sql
stable
as $$
  with scoped as (
    select a.status, a.submitted_at, a.field_map
    from jobposted.applications a
    where
      a.user_id = p_user_id
      and a.apply_path = 'server'
  )
  select
    count(*) filter (
      where status in ('applied', 'submitted', 'viewed', 'interview', 'offer', 'rejected', 'failed')
        and submitted_at >= p_week_start
    ) as sent_this_week,
    count(*) filter (where status in ('viewed', 'interview', 'offer')) as responses,
    count(*) filter (where status = 'interview') as interviews,
    coalesce(
      round(
        avg(jobposted.application_match_score(field_map)) filter (
        where status in ('applied', 'submitted', 'viewed', 'interview', 'offer', 'rejected', 'failed')
        )
      ),
      0
    )::int as avg_match
  from scoped;
$$;

alter function jobposted.dashboard_application_stats(uuid, timestamptz)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.dashboard_application_stats(uuid, timestamptz)
  to authenticated, service_role;

create or replace function jobposted.dashboard_queue_today(
  p_user_id uuid,
  p_queue_date date,
  p_mode text default 'auto',
  p_limit int default 100
)
returns table (
  id uuid,
  status text,
  apply_path text,
  submitted_at timestamptz,
  created_at timestamptz,
  rendered_pdf_path text,
  field_map jsonb,
  job_company text,
  job_title text,
  job_location text,
  job_company_domain text,
  job_company_logo_url text
)
language sql
stable
as $$
  select
    a.id,
    a.status,
    a.apply_path,
    a.submitted_at,
    a.created_at,
    a.rendered_pdf_path,
    a.field_map,
    j.company,
    j.title,
    j.location,
    j.company_domain,
    j.company_logo_url
  from jobposted.applications a
  left join jobposted.jobs j on j.id = a.job_id
  where
    a.user_id = p_user_id
    and a.apply_path = 'server'
    and coalesce(a.submitted_at, a.created_at)::date = p_queue_date
    and (
      (
        p_mode = 'review'
        and a.status in ('ready_for_review', 'filled', 'queued', 'submitting', 'submitted')
      )
      or (
        coalesce(nullif(p_mode, ''), 'auto') <> 'review'
        and a.status in ('queued', 'submitting', 'applied', 'submitted')
      )
    )
  order by coalesce(a.submitted_at, a.created_at) desc, a.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

alter function jobposted.dashboard_queue_today(uuid, date, text, int)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.dashboard_queue_today(uuid, date, text, int)
  to authenticated, service_role;

create or replace function jobposted.job_board_listings_page(
  p_user_id uuid default null,
  p_query text default '',
  p_workplace text default 'All',
  p_posted_after timestamptz default null,
  p_location text default '',
  p_job_type text default 'All',
  p_seniority text default 'All',
  p_salary_listed boolean default false,
  p_min_salary numeric default null,
  p_company text default '',
  p_exclude_companies text[] default '{}'::text[],
  p_source text default '',
  p_visa_sponsorship boolean default false,
  p_hide_tracked boolean default false,
  p_sort text default 'recent',
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  source text,
  source_job_id text,
  ats_type text,
  company text,
  company_domain text,
  company_logo_url text,
  title text,
  location text,
  remote text,
  job_type text,
  seniority text,
  description_md text,
  apply_url text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  posted_at timestamptz,
  ingested_at timestamptz,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select j.*
    from jobposted.jobs j
    where
      j.apply_url is not null
      and j.closed_at is null
      and (
        btrim(coalesce(p_query, '')) = ''
        or j.title ilike '%' || btrim(p_query) || '%'
        or j.company ilike '%' || btrim(p_query) || '%'
        or j.location ilike '%' || btrim(p_query) || '%'
        or j.description_md ilike '%' || btrim(p_query) || '%'
      )
      and (p_workplace = 'All' or j.remote = lower(replace(p_workplace, 'On-site', 'on-site')))
      and (p_posted_after is null or j.posted_at >= p_posted_after)
      and (btrim(coalesce(p_location, '')) = '' or j.location ilike '%' || btrim(p_location) || '%')
      and (p_job_type = 'All' or j.job_type = p_job_type)
      and (p_seniority = 'All' or j.seniority = p_seniority)
      and (not p_salary_listed or j.salary_listed = true)
      and (p_min_salary is null or j.salary_ceiling >= p_min_salary)
      and (btrim(coalesce(p_company, '')) = '' or j.company ilike '%' || btrim(p_company) || '%')
      and (btrim(coalesce(p_source, '')) = '' or j.source_family = p_source)
      and (not p_visa_sponsorship or j.visa_sponsorship = true)
      and (
        coalesce(array_length(p_exclude_companies, 1), 0) = 0
        or not exists (
          select 1
          from unnest(p_exclude_companies) excluded(company_name)
          where
            btrim(excluded.company_name) <> ''
            and j.company ilike '%' || btrim(excluded.company_name) || '%'
        )
      )
      and (
        not p_hide_tracked
        or p_user_id is null
        or not exists (
          select 1
          from jobposted.applications a
          where a.user_id = p_user_id and a.job_id = j.id
        )
      )
  ),
  counted as (
    select f.*, count(*) over () as total_count
    from filtered f
  )
  select
    c.id,
    c.source,
    c.source_job_id,
    c.ats_type,
    c.company,
    c.company_domain,
    c.company_logo_url,
    c.title,
    c.location,
    c.remote,
    c.job_type,
    c.seniority,
    c.description_md,
    c.apply_url,
    c.salary_min,
    c.salary_max,
    c.salary_currency,
    c.posted_at,
    c.ingested_at,
    c.total_count
  from counted c
  order by
    case when p_sort = 'company' then lower(c.company) end asc nulls last,
    case when p_sort = 'company' then lower(c.title) end asc nulls last,
    case when p_sort = 'role' then lower(c.title) end asc nulls last,
    case when p_sort = 'role' then lower(c.company) end asc nulls last,
    case when p_sort = 'salary' then c.salary_ceiling end desc nulls last,
    case when p_sort = 'salary' then c.posted_at end desc nulls last,
    case when p_sort not in ('company', 'role', 'salary') then c.posted_at end desc nulls last,
    case when p_sort not in ('company', 'role', 'salary') then c.ingested_at end desc nulls last,
    c.id desc
  limit greatest(1, least(coalesce(p_limit, 10), 24))
  offset greatest(0, coalesce(p_offset, 0));
$$;

alter function jobposted.job_board_listings_page(
  uuid, text, text, timestamptz, text, text, text, boolean, numeric, text, text[], text, boolean, boolean, text, int, int
) set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.job_board_listings_page(
  uuid, text, text, timestamptz, text, text, text, boolean, numeric, text, text[], text, boolean, boolean, text, int, int
) to authenticated, service_role;

create table if not exists jobposted.application_usage_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_submitted int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists jobposted.application_usage_daily (
  user_id uuid references auth.users(id) on delete cascade,
  usage_date date not null,
  submitted_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table jobposted.application_usage_counters enable row level security;
alter table jobposted.application_usage_daily enable row level security;

drop policy if exists "own_application_usage_counters_read" on jobposted.application_usage_counters;
create policy "own_application_usage_counters_read" on jobposted.application_usage_counters
  for select using (auth.uid() = user_id);

drop policy if exists "own_application_usage_daily_read" on jobposted.application_usage_daily;
create policy "own_application_usage_daily_read" on jobposted.application_usage_daily
  for select using (auth.uid() = user_id);

grant select on jobposted.application_usage_counters to authenticated;
grant select on jobposted.application_usage_daily to authenticated;
grant all on jobposted.application_usage_counters to service_role;
grant all on jobposted.application_usage_daily to service_role;

insert into jobposted.application_usage_counters (user_id, total_submitted)
select user_id, count(*)::int
from jobposted.applications
where user_id is not null and apply_path = 'server' and submitted_at is not null
group by user_id
on conflict (user_id) do update
set total_submitted = excluded.total_submitted,
    updated_at = now();

insert into jobposted.application_usage_daily (user_id, usage_date, submitted_count)
select user_id, submitted_at::date, count(*)::int
from jobposted.applications
where user_id is not null and apply_path = 'server' and submitted_at is not null
group by user_id, submitted_at::date
on conflict (user_id, usage_date) do update
set submitted_count = excluded.submitted_count,
    updated_at = now();

create or replace function jobposted.adjust_application_usage_counter(
  p_user_id uuid,
  p_usage_date date,
  p_delta int
)
returns void
language plpgsql
security definer
set search_path = jobposted, public, pg_temp
as $$
begin
  if p_user_id is null or p_usage_date is null or coalesce(p_delta, 0) = 0 then
    return;
  end if;

  insert into jobposted.application_usage_counters (user_id, total_submitted)
  values (p_user_id, greatest(p_delta, 0))
  on conflict (user_id) do update
  set total_submitted = greatest(0, jobposted.application_usage_counters.total_submitted + p_delta),
      updated_at = now();

  insert into jobposted.application_usage_daily (user_id, usage_date, submitted_count)
  values (p_user_id, p_usage_date, greatest(p_delta, 0))
  on conflict (user_id, usage_date) do update
  set submitted_count = greatest(0, jobposted.application_usage_daily.submitted_count + p_delta),
      updated_at = now();
end;
$$;

revoke all on function jobposted.adjust_application_usage_counter(uuid, date, int)
  from public, anon, authenticated;

create or replace function jobposted.sync_application_usage_counter()
returns trigger
language plpgsql
security definer
set search_path = jobposted, public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and old.user_id is not null
     and old.apply_path = 'server'
     and old.submitted_at is not null then
    perform jobposted.adjust_application_usage_counter(old.user_id, old.submitted_at::date, -1);
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new.user_id is not null
     and new.apply_path = 'server'
     and new.submitted_at is not null then
    perform jobposted.adjust_application_usage_counter(new.user_id, new.submitted_at::date, 1);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function jobposted.sync_application_usage_counter()
  from public, anon, authenticated;

drop trigger if exists trg_sync_application_usage_counter on jobposted.applications;
drop trigger if exists trg_sync_application_usage_counter_write on jobposted.applications;
drop trigger if exists trg_sync_application_usage_counter_delete on jobposted.applications;

create trigger trg_sync_application_usage_counter_write
after insert or update of user_id, apply_path, submitted_at on jobposted.applications
for each row execute function jobposted.sync_application_usage_counter();

create trigger trg_sync_application_usage_counter_delete
after delete on jobposted.applications
for each row execute function jobposted.sync_application_usage_counter();

create or replace function jobposted.application_usage_snapshot(
  p_user_id uuid,
  p_usage_date date default current_date
)
returns table (
  plan text,
  status text,
  daily_limit int,
  trial_applications_used int,
  total_submitted int,
  today_submitted int
)
language sql
stable
as $$
  select
    s.plan,
    s.status,
    s.daily_limit,
    s.trial_applications_used,
    coalesce(c.total_submitted, 0)::int as total_submitted,
    coalesce(d.submitted_count, 0)::int as today_submitted
  from (select p_user_id as user_id) u
  left join jobposted.subscriptions s on s.user_id = u.user_id
  left join jobposted.application_usage_counters c on c.user_id = u.user_id
  left join jobposted.application_usage_daily d
    on d.user_id = u.user_id and d.usage_date = p_usage_date
  where p_user_id = auth.uid() or auth.role() = 'service_role';
$$;

alter function jobposted.application_usage_snapshot(uuid, date)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.application_usage_snapshot(uuid, date)
  to authenticated, service_role;

drop function if exists jobposted.upsert_application_log(
  uuid, uuid, text, text, uuid, uuid, jsonb, text, text, uuid, uuid, jsonb, text, timestamptz
);

create or replace function jobposted.upsert_application_log(
  p_user_id uuid,
  p_job_id uuid default null,
  p_status text default null,
  p_apply_path text default null,
  p_resume_doc_id uuid default null,
  p_cover_letter_doc_id uuid default null,
  p_field_map jsonb default '{}'::jsonb,
  p_screenshot_path text default null,
  p_failure_reason text default null,
  p_base_version_id uuid default null,
  p_resume_variant_id uuid default null,
  p_tailoring_delta jsonb default null,
  p_rendered_pdf_path text default null,
  p_submitted_at timestamptz default null
)
returns table (
  id uuid,
  job_id uuid
)
language plpgsql
security invoker
set search_path = jobposted, public, pg_temp
as $$
declare
  saved_id uuid;
  saved_job_id uuid;
begin
  if p_user_id is null or (p_user_id <> auth.uid() and auth.role() <> 'service_role') then
    raise exception 'not allowed to log application';
  end if;

  if p_job_id is not null then
    insert into jobposted.applications as saved (
      user_id,
      job_id,
      status,
      apply_path,
      resume_doc_id,
      cover_letter_doc_id,
      field_map,
      screenshot_path,
      failure_reason,
      base_version_id,
      resume_variant_id,
      tailoring_delta,
      rendered_pdf_path,
      submitted_at
    )
    values (
      p_user_id,
      p_job_id,
      p_status,
      p_apply_path,
      coalesce(p_resume_doc_id, null),
      coalesce(p_cover_letter_doc_id, null),
      coalesce(p_field_map, '{}'::jsonb),
      p_screenshot_path,
      p_failure_reason,
      p_base_version_id,
      p_resume_variant_id,
      p_tailoring_delta,
      p_rendered_pdf_path,
      p_submitted_at
    )
    on conflict (user_id, job_id) do update
    set
      status = excluded.status,
      apply_path = excluded.apply_path,
      resume_doc_id = excluded.resume_doc_id,
      cover_letter_doc_id = excluded.cover_letter_doc_id,
      field_map = excluded.field_map,
      screenshot_path = excluded.screenshot_path,
      failure_reason = excluded.failure_reason,
      base_version_id = excluded.base_version_id,
      resume_variant_id = excluded.resume_variant_id,
      tailoring_delta = excluded.tailoring_delta,
      rendered_pdf_path = excluded.rendered_pdf_path,
      submitted_at = excluded.submitted_at
    returning saved.id, saved.job_id into saved_id, saved_job_id;
  else
    insert into jobposted.applications as saved (
      user_id,
      job_id,
      status,
      apply_path,
      resume_doc_id,
      cover_letter_doc_id,
      field_map,
      screenshot_path,
      failure_reason,
      base_version_id,
      resume_variant_id,
      tailoring_delta,
      rendered_pdf_path,
      submitted_at
    )
    values (
      p_user_id,
      null,
      p_status,
      p_apply_path,
      p_resume_doc_id,
      p_cover_letter_doc_id,
      coalesce(p_field_map, '{}'::jsonb),
      p_screenshot_path,
      p_failure_reason,
      p_base_version_id,
      p_resume_variant_id,
      p_tailoring_delta,
      p_rendered_pdf_path,
      p_submitted_at
    )
    returning saved.id, saved.job_id into saved_id, saved_job_id;
  end if;

  return query select saved_id, saved_job_id;
end;
$$;

grant execute on function jobposted.upsert_application_log(
  uuid, uuid, text, text, uuid, uuid, jsonb, text, text, uuid, uuid, jsonb, text, timestamptz
) to authenticated, service_role;
