-- Hardening for the vector-recall function and a cleanup of an unused index (gaps.md §12 note).

-- Pin an explicit search_path so the function can't be hijacked by a caller-set path, and grant
-- EXECUTE explicitly rather than relying on the PUBLIC default.
alter function jobposted.match_jobs_for_resume(vector, integer)
  set search_path = jobposted, public, pg_temp;

grant execute on function jobposted.match_jobs_for_resume(vector, integer)
  to authenticated, service_role;

-- The per-resume embedding is only ever read by primary-key/user_id point lookups, never by an
-- ANN search over resume_base_versions, so the HNSW index added in 0010 is dead weight.
drop index if exists jobposted.idx_resume_base_embedding;
