-- Team Builder drafts: a staging layer independent of the real
-- projects/memberships tables, so exploring roster options never touches
-- live data. Finalize is the one operation that writes a chosen draft
-- into the real tables (see finalizePlan() in src/actions/team-builder.ts).

create table public.team_plans (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete cascade,
  name text not null,
  is_finalized boolean not null default false,
  finalized_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index team_plans_quarter_id_idx on public.team_plans (quarter_id);

create table public.team_plan_teams (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.team_plans (id) on delete cascade,
  client_name text not null,
  created_at timestamptz not null default now()
);

create index team_plan_teams_plan_id_idx on public.team_plan_teams (plan_id);

create table public.team_plan_placements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.team_plans (id) on delete cascade,
  plan_team_id uuid not null references public.team_plan_teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role membership_team_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (plan_id, user_id)
);

create index team_plan_placements_plan_team_id_idx on public.team_plan_placements (plan_team_id);

alter table public.team_plans enable row level security;
alter table public.team_plan_teams enable row level security;
alter table public.team_plan_placements enable row level security;

create policy team_plans_all on public.team_plans
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create policy team_plan_teams_all on public.team_plan_teams
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create policy team_plan_placements_all on public.team_plan_placements
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

create trigger team_plans_set_updated_at
  before update on public.team_plans
  for each row execute procedure public.set_updated_at();
