-- Cross-instance worker leases for cron/apply overlap protection.

create table if not exists jobposted.worker_locks (
  lock_name text primary key,
  holder text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_locks_expires_at
  on jobposted.worker_locks (expires_at);

create or replace function jobposted.acquire_worker_lock(
  p_lock_name text,
  p_holder text,
  p_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = jobposted, public, pg_temp
as $$
declare
  v_acquired boolean := false;
begin
  if p_lock_name is null or btrim(p_lock_name) = '' or p_holder is null or btrim(p_holder) = '' then
    raise exception 'lock name and holder are required';
  end if;
  if p_ttl_seconds < 1 then
    raise exception 'lock ttl must be positive';
  end if;

  insert into jobposted.worker_locks (lock_name, holder, expires_at, updated_at)
  values (p_lock_name, p_holder, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (lock_name)
  do update set
    holder = excluded.holder,
    expires_at = excluded.expires_at,
    updated_at = now()
  where jobposted.worker_locks.expires_at <= now()
     or jobposted.worker_locks.holder = excluded.holder
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function jobposted.release_worker_lock(
  p_lock_name text,
  p_holder text
)
returns boolean
language plpgsql
security definer
set search_path = jobposted, public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  delete from jobposted.worker_locks
  where lock_name = p_lock_name
    and holder = p_holder;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function jobposted.acquire_worker_lock(text, text, integer)
  to service_role;
grant execute on function jobposted.release_worker_lock(text, text)
  to service_role;
