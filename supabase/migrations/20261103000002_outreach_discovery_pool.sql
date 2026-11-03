-- Discovery pool: companies can be looked at ahead of time and stored as "ready", so the daily job
-- adds them without crawling. Also keeps the founders listed in the directory, so a person adding
-- an email by hand can see who to look for.

alter table public.outreach_discovery_candidates
  drop constraint if exists outreach_discovery_candidates_outcome_check;

alter table public.outreach_discovery_candidates
  add constraint outreach_discovery_candidates_outcome_check
  check (outcome in ('ready', 'added', 'duplicate', 'no_email', 'unreachable', 'no_facts', 'error'));

alter table public.outreach_discovery_candidates
  add column if not exists payload jsonb,
  add column if not exists founders jsonb not null default '[]'::jsonb;

create index if not exists outreach_discovery_candidates_outcome_idx
  on public.outreach_discovery_candidates (outcome);
