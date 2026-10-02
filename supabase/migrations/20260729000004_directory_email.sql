-- Add email to the directory view so members can actually find each other's
-- address instead of hunting through Admin > Members. CREATE OR REPLACE VIEW
-- can only append columns, not reorder existing ones, so email goes last.

create or replace view public.directory_view as
select
  p.id as user_id,
  p.name,
  p.role,
  m.project_id,
  pr.client_name,
  pr.quarter_id,
  p.email
from public.profiles p
left join public.memberships m on m.user_id = p.id
left join public.projects pr on pr.id = m.project_id;

grant select on public.directory_view to authenticated;
