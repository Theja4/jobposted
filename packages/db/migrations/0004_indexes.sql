-- Indexes for the hot paths (design doc §9.4, §12).

-- Derived daily-usage count: "submissions today (user tz) < daily_limit" (design doc §12).
-- This index makes counting a user's submissions for the current day cheap.
create index if not exists idx_applications_user_submitted
  on jobposted.applications (user_id, submitted_at);

-- Apply-worker claim queue + review queue filter by status (design doc §11.1, §10.4).
create index if not exists idx_applications_status
  on jobposted.applications (status);

-- Owner lookups.
create index if not exists idx_documents_user        on jobposted.documents (user_id);
create index if not exists idx_resume_variants_user  on jobposted.resume_variants (user_id);
create index if not exists idx_resume_base_user       on jobposted.resume_base_versions (user_id);

-- Ingestion: rolling-window polling + dedupe lookups (design doc §9.4).
create index if not exists idx_jobs_ingested_at on jobposted.jobs (ingested_at);
create index if not exists idx_jobs_company     on jobposted.jobs (lower(company));
create index if not exists idx_jobs_ats_type    on jobposted.jobs (ats_type);

-- Vector match scoring against the profile embedding (design doc §9.4, §10.3).
-- HNSW works on an initially-empty table and needs no `lists` tuning; cosine distance.
create index if not exists idx_jobs_embedding
  on jobposted.jobs using hnsw (embedding vector_cosine_ops);
