-- Safety migration for application mode persistence.
-- This repeats the idempotent mode DDL so deployments that skipped 0008_modes.sql
-- still support the Account / Queue mode toggle.

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
