-- Prelim reviewer. See docs/superpowers/specs/2026-10-15-prelim-reviewer-design.md.

create table public.review_rubrics (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('doc', 'slides')),
  version integer not null check (version >= 1),
  criteria jsonb not null,
  guide_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint review_rubrics_kind_version unique (kind, version)
);
alter table public.review_rubrics enable row level security;
create policy review_rubrics_select on public.review_rubrics
  for select to authenticated using (true);
create policy review_rubrics_insert on public.review_rubrics
  for insert to authenticated with check (public.is_exec());

create table public.prelim_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  file_id text not null,
  file_name text not null,
  file_url text not null,
  kind text not null check (kind in ('doc', 'slides')),
  rubric_version integer not null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  verdict text check (verdict in ('ready', 'needs_work')),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now()
);
create index prelim_reviews_project_idx on public.prelim_reviews (project_id, created_at desc);
create index prelim_reviews_author_idx on public.prelim_reviews (created_by, created_at desc);
alter table public.prelim_reviews enable row level security;
create policy prelim_reviews_select on public.prelim_reviews
  for select to authenticated using (public.is_exec() or public.is_on_project(project_id));
create policy prelim_reviews_insert on public.prelim_reviews
  for insert to authenticated
  with check (created_by = auth.uid() and (public.is_exec() or public.is_on_project(project_id)));
create policy prelim_reviews_update_own on public.prelim_reviews
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
