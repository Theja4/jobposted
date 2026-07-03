-- Fix: extension tracker sync failed with `column reference "job_id" is ambiguous`.
--
-- The function returns table (id, job_id), and PL/pgSQL exposes those output columns
-- as variables inside the body. In `on conflict (user_id, job_id)` the bare `job_id`
-- could then mean either the applications column or the output variable, so Postgres
-- refused every upsert that supplied a job id. `#variable_conflict use_column` makes
-- unqualified names resolve to table columns; every variable the body actually reads
-- is either p_-prefixed or explicitly declared, so nothing else changes.

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
#variable_conflict use_column
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
    on conflict (user_id, job_id) do update
    set
      status = coalesce(excluded.status, saved.status),
      apply_path = coalesce(excluded.apply_path, saved.apply_path),
      resume_doc_id = coalesce(excluded.resume_doc_id, saved.resume_doc_id),
      cover_letter_doc_id = coalesce(excluded.cover_letter_doc_id, saved.cover_letter_doc_id),
      field_map = coalesce(saved.field_map, '{}'::jsonb) || coalesce(excluded.field_map, '{}'::jsonb),
      screenshot_path = coalesce(excluded.screenshot_path, saved.screenshot_path),
      failure_reason = excluded.failure_reason,
      base_version_id = coalesce(excluded.base_version_id, saved.base_version_id),
      resume_variant_id = coalesce(excluded.resume_variant_id, saved.resume_variant_id),
      tailoring_delta = coalesce(excluded.tailoring_delta, saved.tailoring_delta),
      rendered_pdf_path = coalesce(excluded.rendered_pdf_path, saved.rendered_pdf_path),
      submitted_at = coalesce(excluded.submitted_at, saved.submitted_at)
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
