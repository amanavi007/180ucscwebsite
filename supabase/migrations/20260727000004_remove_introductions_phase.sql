-- Drop "Introductions" from the project/task phase pipeline.
-- Postgres can't drop an enum value directly, so swap in new enum types.

delete from public.tasks where task_type = 'introductions';
update public.projects set status = 'initial_research' where status = 'introductions';

alter table public.projects alter column status drop default;

alter type project_status rename to project_status_old;
alter type task_type rename to task_type_old;

create type project_status as enum (
  'initial_research',
  'issue_tree',
  'preliminary_research',
  'implementable_creation',
  'deliverable_slide_work',
  'presentation_practice',
  'ready_for_final_deliverable',
  'archived'
);

create type task_type as enum (
  'initial_research',
  'issue_tree',
  'preliminary_research',
  'implementable_creation',
  'deliverable_slide_work',
  'presentation_practice',
  'ready_for_final_deliverable'
);

alter table public.projects
  alter column status type project_status using status::text::project_status;
alter table public.projects
  alter column status set default 'initial_research';

alter table public.tasks
  alter column task_type type task_type using task_type::text::task_type;

drop type project_status_old;
drop type task_type_old;

-- Recreate the milestone-generation trigger with the new 7-phase list.
create or replace function public.create_milestone_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  phase task_type;
  phases task_type[] := array[
    'initial_research', 'issue_tree', 'preliminary_research',
    'implementable_creation', 'deliverable_slide_work', 'presentation_practice',
    'ready_for_final_deliverable'
  ]::task_type[];
begin
  foreach phase in array phases loop
    insert into public.tasks (project_id, task_name, task_type, is_milestone, status, priority)
    values (new.id, initcap(replace(phase::text, '_', ' ')), phase, true, 'not_started', 'medium');
  end loop;
  return new;
end;
$$;
