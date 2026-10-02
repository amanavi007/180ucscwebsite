-- Support more than one PM/SC per project. `memberships.team_role` becomes
-- the source of truth for who leads a project; `projects.project_manager_id`/
-- `senior_consultant_id` stay as columns (everything else in the app reads
-- them directly) but are now derived -- kept in sync by a trigger that sets
-- each to the oldest 'pm'/'sc' membership row for that project.

create type membership_team_role as enum ('pm', 'sc', 'member');

alter table public.memberships
  add column team_role membership_team_role not null default 'member';

-- Backfill: existing PM/SC always have a membership row already
-- (see ensureMembership() in src/actions/projects.ts), but upsert
-- defensively in case any historical row is missing.
insert into public.memberships (project_id, user_id, team_role)
select id, project_manager_id, 'pm'::membership_team_role
from public.projects
where project_manager_id is not null
on conflict (project_id, user_id) do update set team_role = excluded.team_role;

insert into public.memberships (project_id, user_id, team_role)
select id, senior_consultant_id, 'sc'::membership_team_role
from public.projects
where senior_consultant_id is not null
on conflict (project_id, user_id) do update set team_role = excluded.team_role;

-- ── Keep projects.project_manager_id/senior_consultant_id in sync ────────

create or replace function public.sync_project_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects
  set
    project_manager_id = (
      select user_id from public.memberships
      where project_id = target_project_id and team_role = 'pm'
      order by created_at asc
      limit 1
    ),
    senior_consultant_id = (
      select user_id from public.memberships
      where project_id = target_project_id and team_role = 'sc'
      order by created_at asc
      limit 1
    )
  where id = target_project_id;
  return null;
end;
$$;

create trigger memberships_sync_project_leads
  after insert or delete or update of team_role on public.memberships
  for each row execute procedure public.sync_project_leads();

-- ── leads_project() now covers any pm/sc membership, not just the primary ─

create or replace function public.leads_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where project_id = p_project_id and user_id = auth.uid() and team_role in ('pm', 'sc')
  );
$$;
