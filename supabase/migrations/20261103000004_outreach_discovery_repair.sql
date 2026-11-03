-- Discovery repairs its own problems: each company that could not be read, or published no email, is retried
-- automatically a limited number of times, then moved to "failed" (shown as "Gave up") instead of staying a to-do.

alter table public.outreach_discovery_candidates
  add column if not exists attempts int not null default 0,
  add column if not exists last_attempt_at timestamptz;

alter table public.outreach_discovery_candidates
  drop constraint if exists outreach_discovery_candidates_outcome_check;

alter table public.outreach_discovery_candidates
  add constraint outreach_discovery_candidates_outcome_check
  check (outcome in ('ready', 'added', 'duplicate', 'no_email', 'unreachable', 'no_facts', 'error', 'failed'));

create index if not exists outreach_discovery_candidates_repair_idx
  on public.outreach_discovery_candidates (outcome, attempts, last_attempt_at);
