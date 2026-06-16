-- Application mode: how the daily batch is handled.
--   'auto'   — JobPosted applies automatically; the user acknowledges after (default).
--   'review' — the user reviews the prepared queue each day and one-click applies before sending.
alter table jobposted.profiles
  add column if not exists application_mode text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_application_mode_check'
  ) then
    alter table jobposted.profiles
      add constraint profiles_application_mode_check
      check (application_mode in ('auto', 'review'));
  end if;
end $$;
