-- Phase 2: profile preferences + onboarding gate (design doc §10.2, §10.3).
-- Additive; safe to re-run.

alter table jobposted.profiles
  add column if not exists preferences jsonb,
  -- { titles: text[], locations: text[], remoteOnly: bool, minSalary: number|null,
  --   currency: text, skills: text[], excludeCompanies: text[] }
  add column if not exists onboarded_at timestamptz;
  -- null → user still needs onboarding; set when the wizard completes.
