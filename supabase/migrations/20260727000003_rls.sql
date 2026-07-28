-- 180DC UCSC ops app: row level security

alter table public.quarters enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.memberships enable row level security;
alter table public.tasks enable row level security;
alter table public.meeting_notes enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_marks enable row level security;
alter table public.wiki_pages enable row level security;
alter table public.org_settings enable row level security;

-- ── quarters ──────────────────────────────────────────────────────────────

create policy quarters_select on public.quarters
  for select to authenticated using (true);

create policy quarters_write on public.quarters
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- ── profiles ──────────────────────────────────────────────────────────────
-- Everyone can read the roster (Member Directory); self or exec can update
-- (self-update covers clearing must_reset_password after a forced reset;
-- exec-update covers role changes / admin password resets).

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_exec())
  with check (id = auth.uid() or public.is_exec());

-- ── projects ──────────────────────────────────────────────────────────────

create policy projects_select on public.projects
  for select to authenticated using (public.is_exec() or public.is_on_project(id));

create policy projects_insert on public.projects
  for insert to authenticated with check (public.is_exec());

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_exec() or public.leads_project(id))
  with check (public.is_exec() or public.leads_project(id));

create policy projects_delete on public.projects
  for delete to authenticated using (public.is_exec());

-- ── memberships ──────────────────────────────────────────────────────────

create policy memberships_select on public.memberships
  for select to authenticated using (public.is_exec() or public.is_on_project(project_id));

create policy memberships_write on public.memberships
  for all to authenticated
  using (public.is_exec() or public.leads_project(project_id))
  with check (public.is_exec() or public.leads_project(project_id));

-- ── tasks ────────────────────────────────────────────────────────────────

create policy tasks_select on public.tasks
  for select to authenticated using (public.is_exec() or public.is_on_project(project_id));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_exec() or public.leads_project(project_id));

-- Base members may update tasks assigned to them (status changes); leads/exec may update any task on their project.
create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_exec() or public.leads_project(project_id) or assignee_id = auth.uid())
  with check (public.is_exec() or public.leads_project(project_id) or assignee_id = auth.uid());

create policy tasks_delete on public.tasks
  for delete to authenticated using (public.is_exec() or public.leads_project(project_id));

-- ── meeting_notes ────────────────────────────────────────────────────────

create policy meeting_notes_select on public.meeting_notes
  for select to authenticated using (public.is_exec() or public.is_on_project(project_id));

-- Base members may submit notes for their own team.
create policy meeting_notes_insert on public.meeting_notes
  for insert to authenticated with check (public.is_exec() or public.is_on_project(project_id));

create policy meeting_notes_update on public.meeting_notes
  for update to authenticated
  using (public.is_exec() or public.leads_project(project_id) or created_by = auth.uid())
  with check (public.is_exec() or public.leads_project(project_id) or created_by = auth.uid());

create policy meeting_notes_delete on public.meeting_notes
  for delete to authenticated
  using (public.is_exec() or public.leads_project(project_id) or created_by = auth.uid());

-- ── attendance_sessions ──────────────────────────────────────────────────

create policy attendance_sessions_select on public.attendance_sessions
  for select to authenticated using (public.is_exec() or public.is_on_project(project_id));

create policy attendance_sessions_write on public.attendance_sessions
  for all to authenticated
  using (public.is_exec() or public.leads_project(project_id))
  with check (public.is_exec() or public.leads_project(project_id));

-- ── attendance_marks ─────────────────────────────────────────────────────

create policy attendance_marks_select on public.attendance_marks
  for select to authenticated using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_id and (public.is_exec() or public.is_on_project(s.project_id))
    )
  );

create policy attendance_marks_write on public.attendance_marks
  for all to authenticated
  using (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_id and (public.is_exec() or public.leads_project(s.project_id))
    )
  )
  with check (
    exists (
      select 1 from public.attendance_sessions s
      where s.id = session_id and (public.is_exec() or public.leads_project(s.project_id))
    )
  );

-- ── wiki_pages ───────────────────────────────────────────────────────────
-- Consultant section: everyone reads. PM section: elevated tier and up. Editing: exec only.

create policy wiki_pages_select on public.wiki_pages
  for select to authenticated using (
    section = 'consultant' or public.is_elevated_or_above()
  );

create policy wiki_pages_write on public.wiki_pages
  for all to authenticated using (public.is_exec()) with check (public.is_exec());

-- ── org_settings ─────────────────────────────────────────────────────────

create policy org_settings_all on public.org_settings
  for all to authenticated using (public.is_exec()) with check (public.is_exec());
