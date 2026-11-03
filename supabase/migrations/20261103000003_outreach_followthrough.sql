-- Reply follow-through: who is answering a replied or booked prospect, and when it was dealt with.
-- Also lets the webhook record an email that Resend could not send.

alter table public.outreach_prospects
  add column owner_id uuid references public.profiles (id) on delete set null,
  add column handled_at timestamptz;

alter table public.outreach_events drop constraint outreach_events_kind_check;
alter table public.outreach_events add constraint outreach_events_kind_check
  check (kind in ('delivered', 'bounced', 'complained', 'failed', 'replied', 'unsubscribed', 'booked', 'brake'));
