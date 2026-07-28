-- 180DC UCSC ops app: helper functions, triggers, directory view

-- ── Role-tier helpers (security definer so they can read profiles regardless of RLS) ──

create or replace function public.current_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_exec()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() in (
    'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
    'director_of_marketing', 'director_of_training', 'president'
  );
$$;

create or replace function public.is_elevated_or_above()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() in (
    'senior_consultant', 'project_manager',
    'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
    'director_of_marketing', 'director_of_training', 'president'
  );
$$;

-- Member of the project's roster, or its PM/SC for the quarter.
create or replace function public.is_on_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where project_id = p_project_id and user_id = auth.uid()
  ) or exists (
    select 1 from public.projects
    where id = p_project_id
      and (project_manager_id = auth.uid() or senior_consultant_id = auth.uid())
  );
$$;

-- Caller is the PM or SC assigned to this specific project (their elevated scope).
create or replace function public.leads_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id
      and (project_manager_id = auth.uid() or senior_consultant_id = auth.uid())
  );
$$;

-- ── New auth user -> profile row ─────────────────────────────────────────
-- Admin bulk-create calls supabase.auth.admin.createUser() with
-- user_metadata: { name, role }. This trigger mirrors that into profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, must_reset_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'junior_consultant'),
    true
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── New project -> 8 milestone tasks (one per phase, excluding Archived) ──

create or replace function public.create_milestone_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  phase task_type;
  phases task_type[] := array[
    'introductions', 'initial_research', 'issue_tree', 'preliminary_research',
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

create trigger on_project_created
  after insert on public.projects
  for each row execute procedure public.create_milestone_tasks();

-- ── Sub-tasks inherit task_type from their parent milestone ──────────────

create or replace function public.inherit_task_type()
returns trigger
language plpgsql
as $$
begin
  if new.parent_task_id is not null then
    select task_type into new.task_type from public.tasks where id = new.parent_task_id;
  end if;
  return new;
end;
$$;

create trigger before_task_write_inherit_type
  before insert or update of parent_task_id on public.tasks
  for each row execute procedure public.inherit_task_type();

-- ── updated_at maintenance ────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute procedure public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

create trigger wiki_pages_set_updated_at
  before update on public.wiki_pages
  for each row execute procedure public.set_updated_at();

-- ── Directory view ─────────────────────────────────────────────────────
-- The Member Directory shows everyone's name/role/current team org-wide,
-- which is broader than the per-project RLS on `projects`/`memberships`
-- (those stay scoped to "your own team" for Base/Elevated tiers). This
-- view is owned by the migration role (bypasses RLS on the underlying
-- tables) and only exposes non-sensitive columns, granted to all
-- authenticated users.

create view public.directory_view as
select
  p.id as user_id,
  p.name,
  p.role,
  m.project_id,
  pr.client_name,
  pr.quarter_id
from public.profiles p
left join public.memberships m on m.user_id = p.id
left join public.projects pr on pr.id = m.project_id;

grant select on public.directory_view to authenticated;
