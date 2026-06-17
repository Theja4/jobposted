-- Collapse paid entitlements to the current single JobPosted plan.
-- Code already treats legacy starter_20/pro_50 rows as jobposted_20; this normalizes stored rows too.

update jobposted.subscriptions
set
  plan = 'jobposted_20',
  daily_limit = 20
where plan is null
  or plan in ('starter_20', 'pro_50', 'jobposted_20')
  or daily_limit is distinct from 20;
