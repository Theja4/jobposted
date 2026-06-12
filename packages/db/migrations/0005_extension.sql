-- Extension support: reusable answers and field-mapping cache.
-- These are owner-scoped tables in the jobposted schema so the MV3 extension
-- can learn from user-approved answers without expanding the base profile table.

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

alter table jobposted.profile_answers enable row level security;
alter table jobposted.extension_field_mappings enable row level security;

drop policy if exists "own_profile_answers" on jobposted.profile_answers;
create policy "own_profile_answers" on jobposted.profile_answers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_extension_field_mappings" on jobposted.extension_field_mappings;
create policy "own_extension_field_mappings" on jobposted.extension_field_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on jobposted.profile_answers to service_role;
grant select, insert, update, delete on jobposted.profile_answers to authenticated;

grant all on jobposted.extension_field_mappings to service_role;
grant select, insert, update, delete on jobposted.extension_field_mappings to authenticated;

create index if not exists idx_profile_answers_user
  on jobposted.profile_answers (user_id);

create index if not exists idx_extension_field_mappings_user_platform
  on jobposted.extension_field_mappings (user_id, platform);
