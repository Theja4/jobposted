-- Idempotent repair for projects that have the core JobPosted schema but missed
-- the setup/extension storage migrations.

create table if not exists jobposted.profile_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  prompt text not null,
  value text not null,
  source text default 'extension',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, key)
);

create table if not exists jobposted.extension_field_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  platform text not null,
  field_signature text not null,
  label text not null,
  canonical_key text not null,
  value jsonb,
  confidence numeric not null default 0,
  source text not null default 'llm',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, platform, field_signature)
);

create table if not exists jobposted.onboarding_configurations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table jobposted.profile_answers enable row level security;
alter table jobposted.extension_field_mappings enable row level security;
alter table jobposted.onboarding_configurations enable row level security;

drop policy if exists "own_profile_answers" on jobposted.profile_answers;
create policy "own_profile_answers" on jobposted.profile_answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_extension_field_mappings" on jobposted.extension_field_mappings;
create policy "own_extension_field_mappings" on jobposted.extension_field_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_onboarding_configurations" on jobposted.onboarding_configurations;
create policy "own_onboarding_configurations" on jobposted.onboarding_configurations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on jobposted.profile_answers to service_role;
grant select, insert, update, delete on jobposted.profile_answers to authenticated;

grant all on jobposted.extension_field_mappings to service_role;
grant select, insert, update, delete on jobposted.extension_field_mappings to authenticated;

grant all on jobposted.onboarding_configurations to service_role;
grant select, insert, update, delete on jobposted.onboarding_configurations to authenticated;

create index if not exists idx_profile_answers_user
  on jobposted.profile_answers (user_id);

create index if not exists idx_extension_field_mappings_user_platform
  on jobposted.extension_field_mappings (user_id, platform);

create unique index if not exists idx_onboarding_configurations_user_id_unique
  on jobposted.onboarding_configurations (user_id);

create index if not exists idx_onboarding_configurations_completed
  on jobposted.onboarding_configurations (completed_at);
