-- Move from "one shared milestone task per project phase" to "each team
-- member gets their own 5 default tasks to track their personal progress."
-- Drops the milestone/subtask nesting entirely -- every task now belongs to
-- exactly one person on one project, flat, no parent_task_id.

-- All existing task rows are placeholder auto-generated milestones (no real
-- tracking data yet), so it's safe to wipe and regenerate rather than
-- attempt a field-by-field migration into the new 5-stage model.
delete from public.tasks;

drop trigger if exists on_project_created on public.projects;
drop function if exists public.create_milestone_tasks();

drop trigger if exists before_task_write_inherit_type on public.tasks;
drop function if exists public.inherit_task_type();

alter table public.tasks drop column if exists parent_task_id;
alter table public.tasks rename column is_milestone to is_default_task;

alter table public.tasks alter column task_type drop default;
alter type task_type rename to task_type_old;

create type task_type as enum (
  'preliminary_research_draft',
  'prelim_research_revisions',
  'implementables',
  'deliverable_draft',
  'deliverable_revisions',
  'other'
);

alter table public.tasks
  alter column task_type type task_type using task_type::text::task_type;

drop type task_type_old;

-- ── New membership -> 5 default tasks for that member ────────────────────

create or replace function public.create_default_tasks_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stage task_type;
  stages task_type[] := array[
    'preliminary_research_draft', 'prelim_research_revisions', 'implementables',
    'deliverable_draft', 'deliverable_revisions'
  ]::task_type[];
begin
  foreach stage in array stages loop
    insert into public.tasks
      (project_id, assignee_id, task_name, task_type, is_default_task, status, priority)
    values (
      new.project_id, new.user_id, initcap(replace(stage::text, '_', ' ')),
      stage, true, 'not_started', 'medium'
    );
  end loop;
  return new;
end;
$$;

create trigger on_membership_created
  after insert on public.memberships
  for each row execute procedure public.create_default_tasks_for_member();

-- Backfill default tasks for everyone already on a team this quarter.
insert into public.tasks (project_id, assignee_id, task_name, task_type, is_default_task, status, priority)
select m.project_id, m.user_id, initcap(replace(stage::text, '_', ' ')), stage, true, 'not_started', 'medium'
from public.memberships m
cross join unnest(array[
  'preliminary_research_draft', 'prelim_research_revisions', 'implementables',
  'deliverable_draft', 'deliverable_revisions'
]::task_type[]) as stage;

-- ── Permissions: any team member may create/delete tasks for themselves ──
-- (leads/exec retain full control; a base member can't touch anyone else's
-- tasks, and can't delete the 5 default tasks -- only their own extras.)

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.is_exec() or public.leads_project(project_id)
    or (public.is_on_project(project_id) and assignee_id = auth.uid())
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.is_exec() or public.leads_project(project_id)
    or (assignee_id = auth.uid() and not is_default_task)
  );
