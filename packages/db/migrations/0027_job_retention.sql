-- Retention support for stale job-board inventory.
-- Deletes only closed jobs that are not referenced by applications or documents, so user
-- history and generated files remain intact.

create index if not exists idx_jobs_closed_retention
  on jobposted.jobs (closed_at, id)
  where closed_at is not null;

create index if not exists idx_applications_job_id_retention
  on jobposted.applications (job_id)
  where job_id is not null;

create index if not exists idx_documents_job_id_retention
  on jobposted.documents (job_id)
  where job_id is not null;

create or replace function jobposted.purge_old_unreferenced_jobs(
  p_closed_before timestamptz default now() - interval '30 days',
  p_limit int default 1000
)
returns table (deleted_count int)
language plpgsql
security definer
set search_path = jobposted, public
as $$
begin
  return query
  with doomed as (
    select j.id
    from jobposted.jobs j
    where j.closed_at is not null
      and j.closed_at < p_closed_before
      and not exists (
        select 1
        from jobposted.applications a
        where a.job_id = j.id
      )
      and not exists (
        select 1
        from jobposted.documents d
        where d.job_id = j.id
      )
    order by j.closed_at asc, j.id asc
    limit greatest(0, least(coalesce(p_limit, 1000), 10000))
  ),
  deleted as (
    delete from jobposted.jobs j
    using doomed
    where j.id = doomed.id
    returning 1
  )
  select count(*)::int from deleted;
end;
$$;

revoke all on function jobposted.purge_old_unreferenced_jobs(timestamptz, int) from public;
grant execute on function jobposted.purge_old_unreferenced_jobs(timestamptz, int) to service_role;
