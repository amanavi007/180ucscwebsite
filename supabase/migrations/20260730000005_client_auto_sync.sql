-- Every project already names a client via client_name -- there's no reason
-- linking to a persistent client record should be a manual, easy-to-forget
-- extra step. Backfill a client record for every existing distinct
-- client_name and link it, then keep new/edited projects in sync
-- automatically via trigger (find a client with a matching name, or create
-- one) instead of requiring exec to pick from a dropdown.

-- Backfill: one client per distinct existing client_name, created by the
-- earliest-registered exec (there's no acting user in a migration).
insert into public.clients (name, created_by)
select distinct on (lower(btrim(p.client_name)))
  btrim(p.client_name),
  (
    select id from public.profiles
    where role in (
      'director_of_projects', 'director_of_internal_affairs', 'director_of_external_affairs',
      'director_of_marketing', 'director_of_training', 'president'
    )
    order by created_at
    limit 1
  )
from public.projects p
where btrim(p.client_name) <> ''
on conflict (lower(name)) do nothing;

update public.projects p
set client_id = c.id
from public.clients c
where p.client_id is null
  and lower(btrim(p.client_name)) = lower(c.name);

create or replace function public.sync_project_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_name text;
begin
  v_name := btrim(new.client_name);
  if v_name = '' then
    new.client_id := null;
    return new;
  end if;

  select id into v_client_id from public.clients where lower(name) = lower(v_name) limit 1;

  if v_client_id is null then
    insert into public.clients (name, created_by)
    values (v_name, auth.uid())
    returning id into v_client_id;
  end if;

  new.client_id := v_client_id;
  return new;
end;
$$;

create trigger projects_sync_client
  before insert or update of client_name on public.projects
  for each row execute function public.sync_project_client();
