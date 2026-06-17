-- Lightweight API rate limiting for user-triggered LLM/public endpoints.

create table if not exists jobposted.api_rate_limits (
  scope text not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope, key, window_start)
);

create index if not exists idx_api_rate_limits_updated_at
  on jobposted.api_rate_limits (updated_at);

create or replace function jobposted.check_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  current_count integer
)
language plpgsql
security definer
set search_path = jobposted, public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_scope is null or btrim(p_scope) = '' or p_key is null or btrim(p_key) = '' then
    raise exception 'rate limit scope and key are required';
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate limit and window must be positive';
  end if;

  v_window_start :=
    to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds);

  insert into jobposted.api_rate_limits (scope, key, window_start, count, updated_at)
  values (p_scope, p_key, v_window_start, 1, p_now)
  on conflict (scope, key, window_start)
  do update set
    count = jobposted.api_rate_limits.count + 1,
    updated_at = p_now
  returning count into v_count;

  return query
    select
      v_count <= p_limit,
      greatest(p_limit - v_count, 0),
      v_window_start + make_interval(secs => p_window_seconds),
      v_count;
end;
$$;

grant execute on function jobposted.check_rate_limit(text, text, integer, integer, timestamptz)
  to anon, authenticated, service_role;
