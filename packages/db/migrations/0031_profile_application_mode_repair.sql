-- Repair environments that have the newer setup tables but missed the profile mode column.
-- Queue preparation falls back to onboarding_configurations, but this keeps the database aligned
-- with the application schema used by account/settings pages.

alter table jobposted.profiles
  add column if not exists application_mode text not null default 'auto';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_application_mode_check'
  ) then
    alter table jobposted.profiles
      add constraint profiles_application_mode_check
      check (application_mode in ('auto', 'review'));
  end if;
end $$;
