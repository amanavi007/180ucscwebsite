-- Tracks whether a user has completed (or skipped) the first-time sidebar
-- spotlight tour. Null means "never shown"; the (app) layout uses that to
-- auto-launch it right after the forced-password-reset gate clears.

alter table public.profiles add column onboarding_completed_at timestamptz;
