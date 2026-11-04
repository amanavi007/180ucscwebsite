-- Correction access for the research agent: a new key scope and a terminal "retired" outcome for discovery candidates.

alter table public.outreach_agent_keys
  drop constraint if exists outreach_agent_keys_scopes_check;
alter table public.outreach_agent_keys
  add constraint outreach_agent_keys_scopes_check
  check (scopes <@ array['outreach:read', 'outreach:submit', 'outreach:enrich', 'outreach:audit', 'outreach:correct']::text[]);

alter table public.outreach_discovery_candidates
  drop constraint if exists outreach_discovery_candidates_outcome_check;
alter table public.outreach_discovery_candidates
  add constraint outreach_discovery_candidates_outcome_check
  check (outcome in ('ready', 'added', 'duplicate', 'no_email', 'unreachable', 'no_facts', 'error', 'failed', 'retired'));
