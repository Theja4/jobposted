-- Keep the public Jobs board limited to ingested/open listings.
-- Manual tracker rows, extension captures, and tracker-only job_board rows live in
-- `jobs` only so application history/tracker can join against them.

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
        j.source is null
        or j.source not in ('manual', 'extension', 'job_board')
      )
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
