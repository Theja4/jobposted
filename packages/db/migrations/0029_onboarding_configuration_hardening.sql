-- Harden onboarding configuration saves for databases that were created before
-- the completed_at/updated_at shape was finalized.

create table if not exists jobposted.onboarding_configurations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table jobposted.onboarding_configurations
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

create unique index if not exists idx_onboarding_configurations_user_id_unique
  on jobposted.onboarding_configurations (user_id);

create index if not exists idx_onboarding_configurations_completed
  on jobposted.onboarding_configurations (completed_at);

alter table jobposted.onboarding_configurations enable row level security;

drop policy if exists "own_onboarding_configurations" on jobposted.onboarding_configurations;
create policy "own_onboarding_configurations" on jobposted.onboarding_configurations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on jobposted.onboarding_configurations to service_role;
grant select, insert, update, delete on jobposted.onboarding_configurations to authenticated;
