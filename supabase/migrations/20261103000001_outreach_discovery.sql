-- Automatic discovery of prospects: every company the daily job looked at, and what came of it.
-- Written by the cron with the service role; execs can read it in the portal.

create table public.outreach_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'yc',
  source_ref text,
  company text not null,
  website text,
  domain text not null,
  outcome text not null check (outcome in ('added', 'duplicate', 'no_email', 'unreachable', 'no_facts', 'error')),
  reason text,
  prospect_id uuid references public.outreach_prospects (id) on delete set null,
  email text,
  email_source_url text,
  created_at timestamptz not null default now()
);

-- A company is looked at once, ever.
create unique index outreach_discovery_candidates_domain_idx on public.outreach_discovery_candidates (domain);
create index outreach_discovery_candidates_created_idx on public.outreach_discovery_candidates (created_at desc);

alter table public.outreach_discovery_candidates enable row level security;

create policy outreach_discovery_candidates_select on public.outreach_discovery_candidates
  for select to authenticated using (public.is_exec());

insert into public.org_settings (key, value) values
  ('outreach_discovery_enabled', 'false'),
  ('outreach_discovery_per_day', '10'),
  ('outreach_discovery_regions', 'San Francisco, Palo Alto, Mountain View, Oakland, San Jose, Berkeley, Menlo Park, Redwood City, Sunnyvale, Santa Cruz'),
  ('outreach_discovery_industries', 'Healthcare; B2B; Engineering, Product and Design; Infrastructure; Fintech'),
  ('outreach_discovery_max_team', '50')
on conflict (key) do nothing;
