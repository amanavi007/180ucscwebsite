-- Audit access for the research agent: a new key scope, and a run kind for the corrections it makes.

alter table public.outreach_agent_keys
  drop constraint if exists outreach_agent_keys_scopes_check;
alter table public.outreach_agent_keys
  add constraint outreach_agent_keys_scopes_check
  check (scopes <@ array['outreach:read', 'outreach:submit', 'outreach:enrich', 'outreach:audit']::text[]);

alter table public.outreach_agent_runs
  drop constraint if exists outreach_agent_runs_kind_check;
alter table public.outreach_agent_runs
  add constraint outreach_agent_runs_kind_check
  check (kind in ('research', 'enrichment', 'heartbeat', 'correction'));

-- Stable paging for the audit's full sweeps.
create index if not exists outreach_discovery_candidates_created_id_idx
  on public.outreach_discovery_candidates (created_at, id);
create index if not exists outreach_prospects_created_id_idx
  on public.outreach_prospects (created_at, id);
