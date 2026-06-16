-- Server-side tracker pagination and search.
--
-- The tracker can grow to hundreds or thousands of applications per user. Browsing it should not
-- load every row into React just to search/sort/filter. This RPC returns one page plus an exact
-- total for the current filter set.

create extension if not exists pg_trgm;

create index if not exists idx_applications_tracker_user_updated
  on jobposted.applications (user_id, coalesce(submitted_at, created_at) desc, id);

create index if not exists idx_applications_tracker_user_source
  on jobposted.applications (user_id, apply_path, coalesce(submitted_at, created_at) desc);

create index if not exists idx_applications_tracker_user_status
  on jobposted.applications (user_id, status, coalesce(submitted_at, created_at) desc);

create index if not exists idx_applications_tracker_field_text_trgm
  on jobposted.applications using gin (
    (lower(
      coalesce(field_map ->> 'role', '') || ' ' ||
      coalesce(field_map ->> 'company', '') || ' ' ||
      coalesce(field_map ->> 'location', '') || ' ' ||
      coalesce(field_map ->> 'jobUrl', '') || ' ' ||
      coalesce(field_map ->> 'platform', '') || ' ' ||
      coalesce(field_map #>> '{manual,notes}', '') || ' ' ||
      coalesce(failure_reason, '')
    )) gin_trgm_ops
  );

create index if not exists idx_jobs_tracker_title_trgm
  on jobposted.jobs using gin (title gin_trgm_ops);

create index if not exists idx_jobs_tracker_company_trgm
  on jobposted.jobs using gin (company gin_trgm_ops);

create index if not exists idx_jobs_tracker_location_trgm
  on jobposted.jobs using gin (location gin_trgm_ops);

create or replace function jobposted.tracker_applications_page(
  p_user_id uuid,
  p_query text default '',
  p_source text default 'all',
  p_stage text default 'all',
  p_sort text default 'recent',
  p_limit int default 50,
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
  failure_reason text,
  job_id uuid,
  job_company text,
  job_title text,
  job_location text,
  job_apply_url text,
  job_ats_type text,
  job_source text,
  total_count bigint
)
language sql
stable
as $$
  with normalized as (
    select
      a.*,
      j.id as joined_job_id,
      j.company as joined_company,
      j.title as joined_title,
      j.location as joined_location,
      j.apply_url as joined_apply_url,
      j.ats_type as joined_ats_type,
      j.source as joined_source,
      case
        when lower(coalesce(a.apply_path, '')) in ('extension', 'manual', 'server')
          then lower(coalesce(a.apply_path, ''))
        else 'job_board'
      end as tracker_source,
      case
        when lower(coalesce(a.status, '')) like 'custom:%'
          then lower(coalesce(a.status, ''))
        when lower(coalesce(a.status, '')) = 'interview'
          then 'interview'
        when lower(coalesce(a.status, '')) = 'offer'
          then 'offer'
        when lower(coalesce(a.status, '')) in ('rejected', 'failed', 'closed')
          then 'closed'
        when lower(coalesce(a.status, '')) in ('submitted', 'applied', 'viewed', 'reply')
          then 'applied'
        else 'inbox'
      end as tracker_stage,
      case
        when coalesce(a.field_map ->> 'matchScore', a.field_map ->> 'score', a.field_map ->> 'rezoomedScore', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then coalesce(a.field_map ->> 'matchScore', a.field_map ->> 'score', a.field_map ->> 'rezoomedScore')::numeric
        else 0
      end as match_score,
      lower(
        coalesce(j.title, '') || ' ' ||
        coalesce(j.company, '') || ' ' ||
        coalesce(j.location, '') || ' ' ||
        coalesce(j.apply_url, '') || ' ' ||
        coalesce(j.ats_type, '') || ' ' ||
        coalesce(j.source, '') || ' ' ||
        coalesce(a.field_map ->> 'role', '') || ' ' ||
        coalesce(a.field_map ->> 'company', '') || ' ' ||
        coalesce(a.field_map ->> 'location', '') || ' ' ||
        coalesce(a.field_map ->> 'jobUrl', '') || ' ' ||
        coalesce(a.field_map ->> 'platform', '') || ' ' ||
        coalesce(a.field_map #>> '{manual,notes}', '') || ' ' ||
        coalesce(a.failure_reason, '') || ' ' ||
        coalesce(a.status, '') || ' ' ||
        coalesce(a.apply_path, '')
      ) as search_text
    from jobposted.applications a
    left join jobposted.jobs j on j.id = a.job_id
    where a.user_id = p_user_id
  ),
  filtered as (
    select *
    from normalized n
    where
      (coalesce(nullif(p_source, ''), 'all') = 'all' or n.tracker_source = lower(p_source))
      and (coalesce(nullif(p_stage, ''), 'all') = 'all' or n.tracker_stage = lower(p_stage))
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
    c.failure_reason,
    c.joined_job_id,
    c.joined_company,
    c.joined_title,
    c.joined_location,
    c.joined_apply_url,
    c.joined_ats_type,
    c.joined_source,
    c.total_count
  from counted c
  order by
    case when p_sort = 'fit' then c.match_score end desc nulls last,
    case when p_sort = 'company' then lower(coalesce(c.joined_company, c.field_map ->> 'company', '')) end asc nulls last,
    case when p_sort = 'role' then lower(coalesce(c.joined_title, c.field_map ->> 'role', '')) end asc nulls last,
    case when p_sort = 'source' then c.tracker_source end asc nulls last,
    coalesce(c.submitted_at, c.created_at) desc,
    c.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 5000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

alter function jobposted.tracker_applications_page(uuid, text, text, text, text, int, int)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.tracker_applications_page(uuid, text, text, text, text, int, int)
  to authenticated, service_role;
