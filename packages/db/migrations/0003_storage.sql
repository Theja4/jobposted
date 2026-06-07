-- Supabase Storage buckets (design doc §14). Resumes and pre-submit screenshots are private;
-- access is owner-only via RLS, and the app serves them through short-lived SIGNED URLs only.
-- Objects are namespaced per user: the first path segment is the owner's auth uid,
-- e.g. resumes/<user_id>/base.pdf, screenshots/<user_id>/<application_id>.png.

insert into storage.buckets (id, name, public)
values
  ('resumes', 'resumes', false),
  ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

-- storage.objects has RLS enabled by default on Supabase; we add owner-folder policies.
-- The service role bypasses these (the apply worker writes screenshots server-side).

drop policy if exists "jobposted_resumes_owner" on storage.objects;
create policy "jobposted_resumes_owner" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "jobposted_screenshots_owner" on storage.objects;
create policy "jobposted_screenshots_owner" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Minting a signed URL (server, service role):
--   const { data } = await supabase.storage.from('resumes')
--     .createSignedUrl(`${userId}/base.pdf`, 60); // 60s TTL
