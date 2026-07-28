-- Stepped tasks (Preliminary Research, Deliverable) should show as a plain
-- "Not started" like everything else until someone actually begins them --
-- the 4-step timeline only appears once stage_step is set. No data wipe
-- this time: just null out stage_step on tasks still sitting at their
-- untouched default (status = 'not_started'), and stop the trigger from
-- pre-seeding a step.

update public.tasks
set stage_step = null
where task_type in ('preliminary_research', 'deliverable')
  and status = 'not_started';

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
    (new.project_id, new.user_id, 'Preliminary Research', 'preliminary_research', true, 'not_started', null, 'medium'),
    (new.project_id, new.user_id, 'Implementables', 'implementables', true, 'not_started', null, 'medium'),
    (new.project_id, new.user_id, 'Deliverable', 'deliverable', true, 'not_started', null, 'medium');
  return new;
end;
$$;
