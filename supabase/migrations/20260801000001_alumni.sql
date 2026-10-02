-- Alumni distinction: an archived member with departure_reason = 'graduated'
-- is an alum, shown in the org-wide Alumni directory. Archived-but-'left'
-- members stay as they are today -- filtered out everywhere, no public trace.
alter table public.profiles add column departure_reason text
  check (departure_reason in ('graduated', 'left'));
alter table public.profiles add column current_title text;
alter table public.profiles add column current_company text;
alter table public.profiles add column linkedin_url text;

-- One row per (alum, project they worked on); nulls if they never had a team.
-- Like directory_view, this runs as the view owner so it can surface project
-- history without every viewer needing memberships_select access to it.
create view public.alumni_view as
select
  p.id as user_id,
  p.name,
  p.role,
  p.email,
  p.archived_at,
  p.current_title,
  p.current_company,
  p.linkedin_url,
  m.project_id,
  pr.client_name,
  q.name as quarter_name
from public.profiles p
left join public.memberships m on m.user_id = p.id
left join public.projects pr on pr.id = m.project_id
left join public.quarters q on q.id = pr.quarter_id
where p.archived_at is not null and p.departure_reason = 'graduated';

grant select on public.alumni_view to authenticated;
