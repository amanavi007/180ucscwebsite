-- Consolidate the 5 default tasks per member down to 3: Preliminary
-- Research, Implementables, Deliverable. Preliminary Research and
-- Deliverable each get a 4-step timeline (stage_step) instead of a plain
-- status, so a draft and its revisions live under one task instead of two.
-- Implementables keeps the old 3-state status.

-- Junk placeholder data again (no real tracking has happened yet).
delete from public.tasks;

create type task_stage_step as enum (
  'draft_in_progress',
  'draft_complete',
  'revisions_in_progress',
  'complete'
);

alter table public.tasks add column stage_step task_stage_step;

alter table public.tasks alter column task_type drop default;
alter type task_type rename to task_type_old;

create type task_type as enum (
  'preliminary_research',
  'implementables',
  'deliverable',
  'other'
);

alter table public.tasks
  alter column task_type type task_type using task_type::text::task_type;

drop type task_type_old;

-- ── Default tasks per member: Preliminary Research + Deliverable get a
-- starting timeline step; Implementables keeps the plain not_started status.

create or replace function public.create_default_tasks_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tasks
    (project_id, assignee_id, task_name, task_type, is_default_task, status, stage_step, priority)
  values
    (new.project_id, new.user_id, 'Preliminary Research', 'preliminary_research', true, 'not_started', 'draft_in_progress', 'medium'),
    (new.project_id, new.user_id, 'Implementables', 'implementables', true, 'not_started', null, 'medium'),
    (new.project_id, new.user_id, 'Deliverable', 'deliverable', true, 'not_started', 'draft_in_progress', 'medium');
  return new;
end;
$$;

-- Backfill everyone already on a team this quarter.
insert into public.tasks (project_id, assignee_id, task_name, task_type, is_default_task, status, stage_step, priority)
select m.project_id, m.user_id, 'Preliminary Research', 'preliminary_research'::task_type, true, 'not_started'::task_status, 'draft_in_progress'::task_stage_step, 'medium'::task_priority
from public.memberships m
union all
select m.project_id, m.user_id, 'Implementables', 'implementables'::task_type, true, 'not_started'::task_status, null::task_stage_step, 'medium'::task_priority
from public.memberships m
union all
select m.project_id, m.user_id, 'Deliverable', 'deliverable'::task_type, true, 'not_started'::task_status, 'draft_in_progress'::task_stage_step, 'medium'::task_priority
from public.memberships m;
