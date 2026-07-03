-- Keep billing webhooks monotonic per user so delayed provider retries cannot
-- resurrect an older subscription state after a newer cancellation/past-due event.

alter table jobposted.subscriptions
  add column if not exists billing_event_at timestamptz;

create index if not exists idx_subscriptions_billing_event_at
  on jobposted.subscriptions (billing_event_at);

create or replace function jobposted.upsert_subscription_from_webhook(
  p_user_id uuid,
  p_provider text,
  p_plan text,
  p_daily_limit int,
  p_status text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_current_period_end timestamptz,
  p_billing_event_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = jobposted, public, pg_temp
as $$
declare
  applied boolean;
begin
  if p_user_id is null or p_billing_event_at is null then
    raise exception 'user_id and billing_event_at are required';
  end if;

  insert into jobposted.subscriptions as saved (
    user_id,
    provider,
    plan,
    daily_limit,
    status,
    provider_customer_id,
    provider_subscription_id,
    current_period_end,
    renews_at,
    billing_event_at,
    updated_at
  )
  values (
    p_user_id,
    p_provider,
    p_plan,
    p_daily_limit,
    p_status,
    p_provider_customer_id,
    p_provider_subscription_id,
    p_current_period_end,
    p_current_period_end,
    p_billing_event_at,
    now()
  )
  on conflict (user_id) do update
  set
    provider = excluded.provider,
    plan = excluded.plan,
    daily_limit = excluded.daily_limit,
    status = excluded.status,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    current_period_end = excluded.current_period_end,
    renews_at = excluded.renews_at,
    billing_event_at = excluded.billing_event_at,
    updated_at = now()
  where saved.billing_event_at is null or saved.billing_event_at <= excluded.billing_event_at
  returning true into applied;

  return coalesce(applied, false);
end;
$$;

revoke execute on function jobposted.upsert_subscription_from_webhook(
  uuid,
  text,
  text,
  int,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function jobposted.upsert_subscription_from_webhook(
  uuid,
  text,
  text,
  int,
  text,
  text,
  text,
  timestamptz,
  timestamptz
) to service_role;
