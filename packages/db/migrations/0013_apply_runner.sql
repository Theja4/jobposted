-- Server-side apply runner support (gaps.md §1): atomic claim queue + attempt tracking.

alter table jobposted.applications
  add column if not exists attempts int not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

-- Atomic, multi-worker-safe claim. Moves up to `batch` queued *server* applications to
-- 'submitting' (incrementing attempts) and returns them. FOR UPDATE SKIP LOCKED lets several
-- runner instances claim disjoint batches without blocking each other.
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
