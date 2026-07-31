-- Soft-archive for members ("remove" without losing history). Several
-- tables RESTRICT-delete on profiles.id (attendance_sessions.taken_by,
-- meeting_notes.created_by) and others CASCADE (clients.created_by would
-- delete the client record itself), so a real account delete is only ever
-- safe for a profile with zero activity -- everyone else gets archived,
-- not deleted. Archived members keep logging in and keep their history;
-- they just drop out of directory/search/assignment pickers and lose
-- their current-quarter team membership.

alter table public.profiles add column archived_at timestamptz;

create or replace view public.directory_view as
select
  p.id as user_id,
  p.name,
  p.role,
  m.project_id,
  pr.client_name,
  pr.quarter_id,
  p.email
from public.profiles p
left join public.memberships m on m.user_id = p.id
left join public.projects pr on pr.id = m.project_id
where p.archived_at is null;

grant select on public.directory_view to authenticated;

-- True only for a profile with no footprint anywhere -- the only case a
-- permanent delete is actually safe. Checked server-side before calling
-- auth.admin.deleteUser(), which cascades to this row.
create or replace function public.member_has_history(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.memberships where user_id = target)
    or exists (select 1 from public.attendance_marks where user_id = target)
    or exists (select 1 from public.attendance_sessions where taken_by = target)
    or exists (select 1 from public.meeting_notes where created_by = target)
    or exists (select 1 from public.lead_candidates where user_id = target)
    or exists (select 1 from public.team_plan_placements where user_id = target)
    or exists (select 1 from public.team_plans where created_by = target)
    or exists (select 1 from public.audit_log where actor_id = target)
    or exists (select 1 from public.tasks where assignee_id = target)
    or exists (select 1 from public.wiki_pages where created_by = target or updated_by = target)
    or exists (select 1 from public.org_events where created_by = target)
    or exists (select 1 from public.clients where created_by = target)
    or exists (select 1 from public.projects where project_manager_id = target or senior_consultant_id = target)
    or exists (
      select 1 from public.exec_todos where created_by = target or target = any(assigned_to)
    );
$$;
