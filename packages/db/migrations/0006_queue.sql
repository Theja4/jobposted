-- Daily queue acknowledgement. Automatic submission keeps running only while the
-- user logs in once a day and acknowledges the batch that went out. One row per
-- user per day; presence of today's row = acknowledged.

create table if not exists jobposted.queue_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  ack_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz default now(),
  unique (user_id, ack_date)
);

alter table jobposted.queue_acknowledgements enable row level security;

drop policy if exists "own_queue_acknowledgements" on jobposted.queue_acknowledgements;
create policy "own_queue_acknowledgements" on jobposted.queue_acknowledgements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant all on jobposted.queue_acknowledgements to service_role;
grant select, insert, update, delete on jobposted.queue_acknowledgements to authenticated;

create index if not exists idx_queue_ack_user_date
  on jobposted.queue_acknowledgements (user_id, ack_date desc);
