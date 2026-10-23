-- Removing someone from a project team should remove their work on it too, so
-- they stop showing up in the tasks list and nobody chases a person who left.
--
--   remove_member_work(project, user)    explicit removal from one project
--   purge_orphaned_project_work(quarter) sweep: non-exec assignees with no
--                                        membership on the project (used by the
--                                        team plan apply, and once at the bottom
--                                        to clean up people already removed)
-- Deleting a task cascades to its exec review assignments.

create or replace function public.remove_member_work(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_exec() or public.leads_project(p_project_id)) then
    raise exception 'Not allowed to edit this project';
  end if;

  delete from public.tasks where project_id = p_project_id and assignee_id = p_user_id;
  delete from public.project_events where project_id = p_project_id and consultant_id = p_user_id;
end;
$$;

grant execute on function public.remove_member_work(uuid, uuid) to authenticated;

create or replace function public.purge_orphaned_project_work(p_quarter_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Exec only. No logged-in user means the SQL editor / a migration.
  if auth.uid() is not null and not public.is_exec() then
    raise exception 'Only exec can do that';
  end if;

  delete from public.tasks t
  using public.projects p, public.profiles pr
  where t.project_id = p.id
    and pr.id = t.assignee_id
    and (p_quarter_id is null or p.quarter_id = p_quarter_id)
    and pr.role not in (
      'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
      'director_of_marketing', 'director_of_training', 'president'
    )
    and not exists (
      select 1 from public.memberships m
      where m.project_id = t.project_id and m.user_id = t.assignee_id
    );

  delete from public.project_events e
  using public.projects p, public.profiles pr
  where e.project_id = p.id
    and pr.id = e.consultant_id
    and (p_quarter_id is null or p.quarter_id = p_quarter_id)
    and pr.role not in (
      'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
      'director_of_marketing', 'director_of_training', 'president'
    )
    and not exists (
      select 1 from public.memberships m
      where m.project_id = e.project_id and m.user_id = e.consultant_id
    );
end;
$$;

revoke all on function public.purge_orphaned_project_work(uuid) from public, anon;
grant execute on function public.purge_orphaned_project_work(uuid) to authenticated;

create or replace function public.apply_team_plan(p_plan_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_quarter_id uuid;
  v_plan_name text;
  v_finalized boolean;
  v_desired jsonb;
  v_project_ids uuid[];
  v_role_changes jsonb := '[]'::jsonb;
  v_lead record;
begin
  if not public.is_exec() then
    raise exception 'Only exec can do that.';
  end if;

  select quarter_id into v_quarter_id from public.team_plans where id = p_plan_id;
  if v_quarter_id is null then
    raise exception 'Draft not found.';
  end if;

  -- Serialize every apply for a quarter (even of different drafts) so two
  -- execs can't interleave. Transaction-scoped: released on commit/rollback,
  -- and doesn't block anything else touching the quarter.
  perform pg_advisory_xact_lock(hashtextextended('apply_team_plan:' || v_quarter_id::text, 0));

  -- Re-read under the lock: the draft may have been unfinalized or deleted
  -- while we waited. FOR UPDATE also makes a concurrent (un)finalize wait.
  select name, is_finalized into v_plan_name, v_finalized
  from public.team_plans where id = p_plan_id for update;
  if not found then
    raise exception 'Draft not found.';
  end if;
  if not v_finalized then
    raise exception 'Finalize this draft first.';
  end if;

  -- 1. Create a real project for every draft team with no name match
  --    (trim + case-insensitive). Two draft teams with the same name share
  --    one project.
  insert into public.projects (client_name, quarter_id)
  select distinct on (lower(btrim(t.client_name))) t.client_name, v_quarter_id
  from public.team_plan_teams t
  where t.plan_id = p_plan_id
    and not exists (
      select 1 from public.projects p
      where p.quarter_id = v_quarter_id
        and lower(btrim(p.client_name)) = lower(btrim(t.client_name))
    )
  order by lower(btrim(t.client_name)), t.created_at;

  -- 2. Who should end up where: one row per placed user.
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', pl.user_id,
    'project_id', (
      select p.id from public.projects p
      where p.quarter_id = v_quarter_id
        and lower(btrim(p.client_name)) = lower(btrim(t.client_name))
      order by p.created_at
      limit 1
    ),
    'team_role', pl.team_role
  )), '[]'::jsonb) into v_desired
  from public.team_plan_placements pl
  join public.team_plan_teams t on t.id = pl.plan_team_id
  where pl.plan_id = p_plan_id;

  -- 3. The draft is the full source of truth for the quarter: drop every real
  --    membership that isn't exactly what the draft wants (unplaced people,
  --    moved people, changed roles).
  delete from public.memberships m
  using public.projects p
  where m.project_id = p.id
    and p.quarter_id = v_quarter_id
    and not exists (
      select 1
      from jsonb_to_recordset(v_desired) as d(user_id uuid, project_id uuid, team_role membership_team_role)
      where d.user_id = m.user_id
        and d.project_id = m.project_id
        and d.team_role = m.team_role
    );

  -- 4. Insert what's missing. ON CONFLICT covers a concurrent add-member from
  --    the project page, which the advisory lock doesn't cover.
  insert into public.memberships (project_id, user_id, team_role)
  select d.project_id, d.user_id, d.team_role
  from jsonb_to_recordset(v_desired) as d(user_id uuid, project_id uuid, team_role membership_team_role)
  on conflict (project_id, user_id) do update set team_role = excluded.team_role;

  -- 4b. Anyone the draft took off a team also leaves that team's work: their
  --     tasks (and exec review assignments, via cascade) and 1:1 agenda items.
  --     Execs are skipped -- an exec can hold a task on a team they aren't on.
  perform public.purge_orphaned_project_work(v_quarter_id);

  -- 5. Placing someone as PM/SC sets their org-wide role to match. Members
  --    are left alone, and execs are never touched.
  for v_lead in
    select pr.id, pr.name, pr.role as old_role,
      case d.team_role
        when 'pm' then 'project_manager'::user_role
        when 'sc' then 'senior_consultant'::user_role
      end as new_role
    from jsonb_to_recordset(v_desired) as d(user_id uuid, project_id uuid, team_role membership_team_role)
    join public.profiles pr on pr.id = d.user_id
    where d.team_role in ('pm', 'sc')
      and pr.role not in (
        'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
        'director_of_marketing', 'director_of_training', 'president'
      )
    for update of pr
  loop
    if v_lead.old_role is distinct from v_lead.new_role then
      update public.profiles set role = v_lead.new_role where id = v_lead.id;
      v_role_changes := v_role_changes || jsonb_build_object(
        'name', v_lead.name,
        'from', v_lead.old_role,
        'to', v_lead.new_role
      );
    end if;
  end loop;

  -- Every project a draft team maps to, including teams with nobody placed.
  select coalesce(array_agg(distinct p.id), '{}') into v_project_ids
  from public.team_plan_teams t
  join public.projects p
    on p.quarter_id = v_quarter_id
   and lower(btrim(p.client_name)) = lower(btrim(t.client_name))
  where t.plan_id = p_plan_id;

  return jsonb_build_object(
    'project_ids', to_jsonb(v_project_ids),
    'role_changes', v_role_changes
  );
end;
$$;

revoke all on function public.apply_team_plan(uuid) from public, anon;
grant execute on function public.apply_team_plan(uuid) to authenticated;

-- One-time cleanup of people who were already removed from or moved between teams.
select public.purge_orphaned_project_work(null);
