-- Auto-mode batches can still create review-needed exceptions after rendering or worker handling.
-- Keep those rows visible in Queue until the user acts, regardless of mode or day.

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
    and (
      a.status in ('ready_for_review', 'filled')
      or (
        coalesce(a.submitted_at, a.created_at)::date = p_queue_date
        and (
          (
            p_mode = 'review'
            and a.status in ('queued', 'submitting', 'submitted')
          )
          or (
            coalesce(nullif(p_mode, ''), 'auto') <> 'review'
            and a.status in ('queued', 'submitting', 'applied', 'submitted')
          )
        )
      )
    )
  order by
    case when a.status in ('ready_for_review', 'filled') then 0 else 1 end,
    coalesce(a.submitted_at, a.created_at) desc,
    a.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

alter function jobposted.dashboard_queue_today(uuid, date, text, int)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.dashboard_queue_today(uuid, date, text, int)
  to authenticated, service_role;
