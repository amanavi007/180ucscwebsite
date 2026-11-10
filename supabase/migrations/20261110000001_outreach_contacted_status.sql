-- A prospect that someone already emailed outside the pipeline (for example the research agent's browser bot, sending from an exec's
-- own mailbox). "contacted" is terminal: drafting, sending and follow-ups skip it, and the company stays in the duplicate checks.

alter table public.outreach_prospects
  drop constraint if exists outreach_prospects_status_check;
alter table public.outreach_prospects
  add constraint outreach_prospects_status_check check (status in (
    'new', 'verified', 'drafted', 'queued', 'sent', 'follow_up_1', 'follow_up_2',
    'closing_note', 'no_response', 'replied', 'booked', 'unsubscribed', 'bounced',
    'invalid', 'needs_attention', 'contacted'
  ));
