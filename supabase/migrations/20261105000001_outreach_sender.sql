-- The officer an outreach prospect hears from. Set when the first email is scheduled and kept for every follow-up,
-- so one company never sees the name change mid-thread. Null means no officer was assigned (the single sender in Settings).
alter table public.outreach_prospects add column if not exists sender_id text;
