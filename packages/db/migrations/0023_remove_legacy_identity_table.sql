-- Remove the legacy voluntary identity table.
--
-- Voluntary identity answers now live in the user's normal onboarding configuration payload.
-- They are not used for job matching or filtering.

drop table if exists jobposted.sensitive_self_id;
