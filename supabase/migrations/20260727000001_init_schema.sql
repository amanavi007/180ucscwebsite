-- 180DC UCSC ops app: core schema (enums + tables)

create extension if not exists pgcrypto;

-- ── Enums ─────────────────────────────────────────────────────────────────

create type user_role as enum (
  'junior_consultant',
  'consultant',
  'senior_consultant',
  'project_manager',
  'director_of_projects',
  'director_of_internal_affairs',
  'director_of_external_affairs',
  'director_of_marketing',
  'director_of_training',
  'president'
);

create type project_status as enum (
  'introductions',
  'initial_research',
  'issue_tree',
  'preliminary_research',
  'implementable_creation',
  'deliverable_slide_work',
  'presentation_practice',
  'ready_for_final_deliverable',
  'archived'
);

create type project_health as enum ('on_track', 'at_risk', 'blocked');

create type task_status as enum ('not_started', 'in_progress', 'done');

create type task_priority as enum ('low', 'medium', 'high');

-- Mirrors project_status minus 'archived' -- a task's phase, not a project's lifecycle state.
create type task_type as enum (
  'introductions',
  'initial_research',
  'issue_tree',
  'preliminary_research',
  'implementable_creation',
  'deliverable_slide_work',
  'presentation_practice',
  'ready_for_final_deliverable'
);

create type meeting_note_type as enum ('client_call', 'officer_meeting', 'team_checkin');

create type attendance_mark as enum ('excused', 'unexcused', 'tardy');

create type wiki_section as enum ('consultant', 'pm');

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.quarters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Only one quarter can be active at a time.
create unique index quarters_single_active on public.quarters (is_active) where is_active;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique check (email ~* '@180dc\.org$'),
  role user_role not null default 'junior_consultant',
  must_reset_password boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.quarters (id) on delete restrict,
  client_name text not null,
  status project_status not null default 'introductions',
  project_manager_id uuid references public.profiles (id) on delete set null,
  senior_consultant_id uuid references public.profiles (id) on delete set null,
  industry text,
  health project_health not null default 'on_track',
  health_manual_override project_health,
  start_date date,
  deadline date,
  deliverable_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_quarter_id_idx on public.projects (quarter_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_name text not null,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date date,
  status task_status not null default 'not_started',
  priority task_priority not null default 'medium',
  task_type task_type not null,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  is_milestone boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_parent_task_id_idx on public.tasks (parent_task_id);

create table public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  date date not null,
  type meeting_note_type not null,
  body text not null default '',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index meeting_notes_project_id_idx on public.meeting_notes (project_id);

-- One row per team per date.
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  taken_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, date)
);

create index attendance_sessions_project_id_idx on public.attendance_sessions (project_id);
create index attendance_sessions_date_idx on public.attendance_sessions (date);

-- Absence of a row for a (session, user) pair means present & on time.
create table public.attendance_marks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mark attendance_mark not null,
  unique (session_id, user_id)
);

create index attendance_marks_user_id_idx on public.attendance_marks (user_id);

create table public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  section wiki_section not null,
  parent_id uuid references public.wiki_pages (id) on delete cascade,
  title text not null,
  slug text not null,
  body text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section, slug)
);

create index wiki_pages_parent_id_idx on public.wiki_pages (parent_id);

create table public.org_settings (
  key text primary key,
  value text not null
);

insert into public.org_settings (key, value) values ('attendance_alert_threshold', '0.8');
