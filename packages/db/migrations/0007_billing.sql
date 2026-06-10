-- Phase 4: billing (design doc §12). Additive; safe to re-run. Provider-agnostic
-- (Polar now, Razorpay later use the same columns).

alter table jobposted.subscriptions
  add column if not exists external_subscription_id text,
  add column if not exists external_customer_id text,
  add column if not exists current_period_end timestamptz;

-- Idempotent webhook handling: a provider event is processed at most once.
create table if not exists jobposted.processed_webhooks (
  provider text,
  event_id text,
  processed_at timestamptz default now(),
  primary key (provider, event_id)
);

grant all on jobposted.processed_webhooks to service_role;
