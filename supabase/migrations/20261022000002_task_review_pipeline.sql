-- Review pipeline for Preliminary Research / Deliverable tasks.
--
-- Old timeline: draft_in_progress -> draft_complete -> revisions_in_progress -> complete
-- New timeline: draft_in_progress -> pm_sc_comments -> awaiting_exec_revision -> complete
--
--   draft_in_progress      consultant is writing the draft
--   pm_sc_comments         draft is in; PM/SC leave comments, consultant fixes them
--   awaiting_exec_revision consultant finished the PM/SC fixes. Two execs are
--                          auto-assigned (task_exec_reviews); each marks their
--                          review done, then the consultant fixes their comments
--   complete               consultant marks the exec revision done
--
-- Existing rows: draft_complete and revisions_in_progress both mean "past the
-- draft, being worked over by reviewers", so they land on pm_sc_comments.

alter type task_stage_step rename to task_stage_step_old;

create type task_stage_step as enum (
  'draft_in_progress',
  'pm_sc_comments',
  'awaiting_exec_revision',
  'complete'
);

alter table public.tasks
  alter column stage_step type task_stage_step using (
    case stage_step::text
      when 'draft_complete' then 'pm_sc_comments'
      when 'revisions_in_progress' then 'pm_sc_comments'
      else stage_step::text
    end
  )::task_stage_step;

drop type task_stage_step_old;

-- ── Exec reviewers ───────────────────────────────────────────────────────

create table public.task_exec_reviews (
  task_id uuid not null references public.tasks (id) on delete cascade,
  exec_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  reviewed_at timestamptz,
  primary key (task_id, exec_id)
);

create index task_exec_reviews_exec_idx on public.task_exec_reviews (exec_id)
  where reviewed_at is null;

alter table public.task_exec_reviews enable row level security;

-- Anyone who can see the task can see who is reviewing it.
create policy task_exec_reviews_select on public.task_exec_reviews
  for select to authenticated using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (public.is_exec() or public.is_on_project(t.project_id))
    )
  );

-- Rows are created/removed only by assign_task_exec_reviewers() below.
-- An exec may stamp their own review as done.
create policy task_exec_reviews_mark_done on public.task_exec_reviews
  for update to authenticated
  using (exec_id = auth.uid())
  with check (exec_id = auth.uid());

-- ── Auto-assignment ──────────────────────────────────────────────────────
-- Picks the two execs with the fewest open (unreviewed) assignments, so load
-- stays even across the whole exec team. Ties break randomly. Skips archived
-- execs, the task's own assignee, and execs on the project's team (they would
-- be reviewing their own team). If fewer than two qualify it assigns who it can.
-- Re-running replaces the current reviewers, so it is safe to call again.

create or replace function public.assign_task_exec_reviewers(p_task_id uuid)
returns setof public.task_exec_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not (
    public.is_exec()
    or public.leads_project(v_task.project_id)
    or v_task.assignee_id = auth.uid()
  ) then
    raise exception 'Not allowed to assign reviewers for this task';
  end if;

  delete from public.task_exec_reviews where task_id = p_task_id;

  return query
  insert into public.task_exec_reviews (task_id, exec_id)
  select p_task_id, p.id
  from public.profiles p
  left join lateral (
    select count(*) as open_reviews
    from public.task_exec_reviews r
    where r.exec_id = p.id and r.reviewed_at is null
  ) load on true
  where p.role in (
      'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
      'director_of_marketing', 'director_of_training', 'president'
    )
    and p.archived_at is null
    and p.id is distinct from v_task.assignee_id
    and not exists (
      select 1 from public.memberships m
      where m.project_id = v_task.project_id and m.user_id = p.id
    )
  order by load.open_reviews asc, random()
  limit 2
  returning *;
end;
$$;

grant execute on function public.assign_task_exec_reviewers(uuid) to authenticated;
