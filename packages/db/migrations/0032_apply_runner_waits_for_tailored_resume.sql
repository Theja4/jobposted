-- Keep the apply runner behind queue rendering: tailored applications must have
-- a rendered PDF before they can be claimed for browser submission.

create or replace function jobposted.claim_applications(batch int default 10)
returns table (
  id uuid,
  user_id uuid,
  job_id uuid,
  field_map jsonb,
  base_version_id uuid,
  resume_variant_id uuid,
  rendered_pdf_path text,
  attempts int
)
language sql
volatile
as $$
  update jobposted.applications a
  set status = 'submitting',
      claimed_at = now(),
      last_attempt_at = now(),
      attempts = a.attempts + 1
  where a.id in (
    select c.id
    from jobposted.applications c
    where c.status = 'queued'
      and c.apply_path = 'server'
      and (
        c.rendered_pdf_path is not null
        or lower(coalesce(c.field_map ->> 'tailoringEnabled', 'true')) = 'false'
      )
    order by c.created_at asc
    limit greatest(1, least(coalesce(batch, 10), 50))
    for update skip locked
  )
  returning
    a.id,
    a.user_id,
    a.job_id,
    a.field_map,
    a.base_version_id,
    a.resume_variant_id,
    a.rendered_pdf_path,
    a.attempts;
$$;

alter function jobposted.claim_applications(int) set search_path = jobposted, public, pg_temp;
grant execute on function jobposted.claim_applications(int) to service_role;

-- Repair rows from the old behavior: these are still eligible for queue rendering
-- and should not need manual review until rendering or submission truly fails.
update jobposted.applications
set status = 'queued',
    failure_reason = null,
    attempts = greatest(coalesce(attempts, 0) - 1, 0),
    claimed_at = null
where apply_path = 'server'
  and status = 'ready_for_review'
  and rendered_pdf_path is null
  and lower(coalesce(field_map ->> 'tailoringEnabled', 'true')) <> 'false'
  and lower(coalesce(field_map ->> 'mode', 'auto')) = 'auto'
  and created_at >= now() - interval '3 days'
  and (
    failure_reason is null
    or failure_reason in ('missing_tailored_resume_artifact', 'waiting_for_tailored_resume', 'tailor_failed')
  );
