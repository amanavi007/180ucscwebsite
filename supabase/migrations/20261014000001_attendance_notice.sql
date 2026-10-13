-- One-time "attendance moved to the Check in button" notice for senior consultants,
-- project managers and execs. Null means "not shown yet". People who have not finished
-- the sidebar tour yet never knew the old layout, so they start out as already seen.

alter table public.profiles add column attendance_notice_seen_at timestamptz;

update public.profiles set attendance_notice_seen_at = now() where onboarding_completed_at is null;
