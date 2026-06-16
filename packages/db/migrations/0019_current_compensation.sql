-- Separate current compensation from expected compensation.
--
-- Application forms often ask both "current salary/CTC" and "expected salary/CTC".
-- These must not share one profile value, otherwise autofill can disclose the wrong number.

alter table jobposted.profiles
  add column if not exists current_salary_min numeric,
  add column if not exists current_salary_max numeric,
  add column if not exists current_salary_currency text;
