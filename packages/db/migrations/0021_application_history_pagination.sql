-- Server-side pagination for JobPosted application history.
--
-- History can grow indefinitely, so the dashboard should never fetch the full table just to
-- search or render the first screen. This function returns one bounded page plus an exact count
-- for the active filters.

alter table jobposted.jobs
  add column if not exists company_domain text,
  add column if not exists company_logo_url text,
  add column if not exists company_logo_resolved_at timestamptz;

create index if not exists idx_applications_history_server_activity
  on jobposted.applications (user_id, coalesce(submitted_at, created_at) desc, id)
  where apply_path = 'server';

drop function if exists jobposted.history_applications_page(uuid, text, date, date, int, int);

create or replace function jobposted.history_applications_page(
  p_user_id uuid,
  p_query text default '',
  p_date_from date default null,
  p_date_to date default null,
  p_limit int default 20,
  p_offset int default 0
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
  job_company_logo_url text,
  total_count bigint
)
language sql
stable
as $$
  with normalized as (
    select
      a.id,
      a.status,
      a.apply_path,
      a.submitted_at,
      a.created_at,
      a.rendered_pdf_path,
      a.field_map,
      j.company as joined_company,
      j.title as joined_title,
      j.location as joined_location,
      j.company_domain as joined_company_domain,
      j.company_logo_url as joined_company_logo_url,
      coalesce(a.submitted_at, a.created_at) as activity_at,
      lower(
        coalesce(j.title, '') || ' ' ||
        coalesce(j.company, '') || ' ' ||
        coalesce(j.location, '') || ' ' ||
        coalesce(a.field_map ->> 'role', '') || ' ' ||
        coalesce(a.field_map ->> 'company', '') || ' ' ||
        coalesce(a.field_map ->> 'location', '') || ' ' ||
        coalesce(a.field_map ->> 'resumeUsed', '') || ' ' ||
        coalesce(a.status, '')
      ) as search_text
    from jobposted.applications a
    left join jobposted.jobs j on j.id = a.job_id
    where
      a.user_id = p_user_id
      and a.apply_path = 'server'
      and a.status in ('applied', 'submitted', 'viewed', 'interview', 'offer', 'rejected', 'failed')
  ),
  filtered as (
    select *
    from normalized n
    where
      (p_date_from is null or n.activity_at::date >= p_date_from)
      and (p_date_to is null or n.activity_at::date <= p_date_to)
      and (
        btrim(coalesce(p_query, '')) = ''
        or not exists (
          select 1
          from regexp_split_to_table(lower(btrim(p_query)), '\s+') term
          where term <> '' and n.search_text not like '%' || term || '%'
        )
      )
  ),
  counted as (
    select f.*, count(*) over () as total_count
    from filtered f
  )
  select
    c.id,
    c.status,
    c.apply_path,
    c.submitted_at,
    c.created_at,
    c.rendered_pdf_path,
    c.field_map,
    c.joined_company,
    c.joined_title,
    c.joined_location,
    c.joined_company_domain,
    c.joined_company_logo_url,
    c.total_count
  from counted c
  order by c.activity_at desc nulls last, c.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20))
  offset greatest(0, coalesce(p_offset, 0));
$$;

alter function jobposted.history_applications_page(uuid, text, date, date, int, int)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.history_applications_page(uuid, text, date, date, int, int)
  to authenticated, service_role;
