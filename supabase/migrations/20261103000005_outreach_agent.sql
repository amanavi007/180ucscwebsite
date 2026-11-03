-- Outreach agent integration: an external AI agent researches prospects and feeds the existing pipeline over a small
-- scoped HTTP API. It authenticates with a hashed, revocable key (never a human login). Everything the API does runs
-- with the service role after the key is checked, so there are no anon/authenticated policies for the agent itself.

create table public.outreach_agent_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- SHA-256 hex of the full key. The key itself is shown once and never stored.
  key_hash text not null unique,
  -- First characters of the key, for telling keys apart in the portal.
  key_prefix text not null,
  scopes text[] not null default '{}'
    check (scopes <@ array['outreach:read', 'outreach:submit', 'outreach:enrich']::text[]),
  created_by uuid not null references public.profiles (id) on delete cascade,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.outreach_agent_runs (
  id uuid primary key default gen_random_uuid(),
  key_id uuid references public.outreach_agent_keys (id) on delete set null,
  -- A batch id the agent chose; a repeat of the same batch returns the stored result instead of inserting again.
  idempotency_key text unique,
  kind text not null check (kind in ('research', 'enrichment', 'heartbeat')),
  evaluated int not null default 0,
  submitted int not null default 0,
  accepted int not null default 0,
  skipped jsonb not null default '{}'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index outreach_agent_runs_created_idx on public.outreach_agent_runs (created_at desc);

alter table public.outreach_agent_keys enable row level security;
alter table public.outreach_agent_runs enable row level security;

create policy outreach_agent_keys_select on public.outreach_agent_keys
  for select to authenticated using (public.is_exec());
create policy outreach_agent_runs_select on public.outreach_agent_runs
  for select to authenticated using (public.is_exec());

-- Work queue: the discovery candidates the crawler could not finish are what the agent is asked to research.
alter table public.outreach_discovery_candidates
  add column if not exists agent_claimed_at timestamptz,
  add column if not exists agent_claim_token uuid,
  add column if not exists agent_attempts int not null default 0,
  add column if not exists agent_last_reason text;

create index if not exists outreach_discovery_candidates_agent_idx
  on public.outreach_discovery_candidates (outcome, agent_claimed_at);

-- Targeting spans nonprofits and for-profits; niche alone cannot say which a company is.
alter table public.outreach_prospects
  add column if not exists segment text check (segment in ('nonprofit', 'startup', 'small_business', 'other'));
alter table public.outreach_discovery_candidates
  add column if not exists segment text check (segment in ('nonprofit', 'startup', 'small_business', 'other'));

-- Leases up to p_limit stranded candidates in one statement. skip locked means two concurrent claims never get the
-- same company. Only the service role may call it.
create or replace function public.claim_outreach_agent_tasks(p_limit int)
returns setof public.outreach_discovery_candidates
language sql
security invoker
as $$
  update public.outreach_discovery_candidates c
  set agent_claimed_at = now(),
      agent_claim_token = gen_random_uuid(),
      agent_attempts = c.agent_attempts + 1
  where c.id in (
    select id from public.outreach_discovery_candidates
    where outcome in ('no_email', 'unreachable')
      and agent_attempts < 3
      and (agent_claimed_at is null or agent_claimed_at < now() - interval '24 hours')
    order by agent_claimed_at nulls first, created_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning c.*;
$$;

revoke all on function public.claim_outreach_agent_tasks(int) from public, anon, authenticated;
grant execute on function public.claim_outreach_agent_tasks(int) to service_role;

insert into public.org_settings (key, value) values
  ('outreach_agent_enabled', 'false'),
  ('outreach_agent_owner', ''),
  ('outreach_agent_daily_target', '15'),
  ('outreach_agent_targets', '[{"segment":"nonprofit","niche":"strategy","regions":["Santa Cruz","Monterey","San Francisco","Oakland","San Jose","Berkeley"],"minSize":5,"maxSize":200,"share":40,"needs":"program growth, fundraising strategy, community outreach, operations, impact measurement"},{"segment":"startup","niche":"tech","regions":["San Francisco","Palo Alto","Mountain View","San Jose","Berkeley","Oakland","Menlo Park","Redwood City","Sunnyvale","Santa Cruz"],"minSize":5,"maxSize":50,"share":40,"needs":"product and go-to-market strategy, user/market research, data and technical projects — the chapter has many technically strong consultants"},{"segment":"small_business","niche":"other","regions":["Santa Cruz","San Francisco","Oakland","Berkeley","San Jose"],"minSize":5,"maxSize":200,"share":20,"needs":"growth strategy, marketing, operations"}]'),
  ('outreach_heartbeat_agent', '')
on conflict (key) do nothing;
