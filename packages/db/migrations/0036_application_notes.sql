-- A free-text note the user can attach to a tracked application from the job tracker
-- (web dashboard and the extension "Add Note" action). Capped at 300 characters at the
-- database level so neither client can exceed it. RLS is unchanged: the existing
-- "own_applications" policy (for all using auth.uid() = user_id) already lets a user
-- read and update the notes on their own rows.

alter table jobposted.applications
  add column if not exists notes text;

alter table jobposted.applications
  drop constraint if exists applications_notes_len;

alter table jobposted.applications
  add constraint applications_notes_len
  check (notes is null or char_length(notes) <= 300);
