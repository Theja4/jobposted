-- Billing metadata beyond the original subscription limit fields. These columns
-- let checkout/webhook handlers reconcile provider records without expanding
-- user-facing account data.

alter table jobposted.subscriptions
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_subscriptions_provider_subscription
  on jobposted.subscriptions (provider, provider_subscription_id);

create index if not exists idx_subscriptions_status
  on jobposted.subscriptions (status);
