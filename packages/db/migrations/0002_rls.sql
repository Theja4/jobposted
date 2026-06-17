-- Row Level Security (design doc §8.1). Without RLS the anon key leaks every user's data.
-- Every user-scoped table gets owner-only policies keyed on auth.uid(). `jobs` is global read.
-- Server-side workers use the service role key, which BYPASSES RLS — never expose it to the
-- client.
--
-- Policies use drop-if-exists then create so this migration is safely re-runnable.

-- ── Enable RLS ──────────────────────────────────────────────────────────────
alter table jobposted.profiles            enable row level security;
alter table jobposted.documents           enable row level security;
alter table jobposted.applications        enable row level security;
alter table jobposted.subscriptions       enable row level security;
alter table jobposted.resume_base_versions enable row level security;
alter table jobposted.resume_variants     enable row level security;
alter table jobposted.jobs                enable row level security;
alter table jobposted.waitlist            enable row level security;

-- ── Owner-only policies (auth.uid()) ────────────────────────────────────────
drop policy if exists "own_profile" on jobposted.profiles;
create policy "own_profile" on jobposted.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own_documents" on jobposted.documents;
create policy "own_documents" on jobposted.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_applications" on jobposted.applications;
create policy "own_applications" on jobposted.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_resume_base_versions" on jobposted.resume_base_versions;
create policy "own_resume_base_versions" on jobposted.resume_base_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_resume_variants" on jobposted.resume_variants;
create policy "own_resume_variants" on jobposted.resume_variants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- subscriptions: owner may read; writes happen via webhooks using the service role (§12).
drop policy if exists "own_subscription_read" on jobposted.subscriptions;
create policy "own_subscription_read" on jobposted.subscriptions
  for select using (auth.uid() = user_id);

-- jobs: global read (design doc §8.1). Writes are service-role only (RLS-bypassing ingest).
drop policy if exists "jobs_public_read" on jobposted.jobs;
create policy "jobs_public_read" on jobposted.jobs
  for select using (true);

-- waitlist: no anon/authenticated policy on purpose. The public landing form inserts via the
-- server-side service role (apps/web/app/api/waitlist), which bypasses RLS. RLS-on + no policy
-- means the anon key cannot read or enumerate signups.
